import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import crypto from 'crypto';

export interface CacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
  expiresAt: number;
  hits: number;
}

export class CacheManager {
  private static instance: CacheManager | null = null;
  private memoryCache: Map<string, CacheEntry<any>> = new Map();
  private maxMemoryEntries: number = 100;
  private defaultTTL: number = 3600000; // 1 hour
  private cacheDir: string;

  private constructor() {
    this.cacheDir = path.join(app.getPath('userData'), 'cache');
    this.ensureCacheDirectory();
    this.loadPersistentCache();
  }

  public static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  private ensureCacheDirectory(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Generate cache key from data
   */
  private generateKey(data: any): string {
    const str = JSON.stringify(data);
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  /**
   * Get value from cache
   */
  get<T>(key: string | any): T | null {
    const cacheKey = typeof key === 'string' ? key : this.generateKey(key);
    
    // Check memory cache
    const memoryEntry = this.memoryCache.get(cacheKey);
    if (memoryEntry) {
      if (Date.now() < memoryEntry.expiresAt) {
        memoryEntry.hits++;
        return memoryEntry.value as T;
      } else {
        // Expired, remove it
        this.memoryCache.delete(cacheKey);
      }
    }

    // Check persistent cache
    return this.getFromPersistentCache<T>(cacheKey);
  }

  /**
   * Set value in cache
   */
  set<T>(key: string | any, value: T, ttl?: number): void {
    const cacheKey = typeof key === 'string' ? key : this.generateKey(key);
    const expiresAt = Date.now() + (ttl || this.defaultTTL);

    const entry: CacheEntry<T> = {
      key: cacheKey,
      value,
      timestamp: Date.now(),
      expiresAt,
      hits: 0
    };

    // Store in memory
    this.memoryCache.set(cacheKey, entry);

    // Enforce max entries
    if (this.memoryCache.size > this.maxMemoryEntries) {
      this.evictOldest();
    }

    // Store in persistent cache
    this.setInPersistentCache(cacheKey, entry);
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string | any): boolean {
    const cacheKey = typeof key === 'string' ? key : this.generateKey(key);
    
    // Check memory
    const memoryEntry = this.memoryCache.get(cacheKey);
    if (memoryEntry && Date.now() < memoryEntry.expiresAt) {
      return true;
    }

    // Check persistent
    return this.hasInPersistentCache(cacheKey);
  }

  /**
   * Delete from cache
   */
  delete(key: string | any): void {
    const cacheKey = typeof key === 'string' ? key : this.generateKey(key);
    this.memoryCache.delete(cacheKey);
    this.deleteFromPersistentCache(cacheKey);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.memoryCache.clear();
    this.clearPersistentCache();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    memoryEntries: number;
    totalHits: number;
    hitRate: number;
  } {
    let totalHits = 0;
    for (const entry of this.memoryCache.values()) {
      totalHits += entry.hits;
    }

    return {
      memoryEntries: this.memoryCache.size,
      totalHits,
      hitRate: this.memoryCache.size > 0 ? totalHits / this.memoryCache.size : 0
    };
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.memoryCache.delete(oldestKey);
    }
  }

  private getCacheFilePath(key: string): string {
    return path.join(this.cacheDir, `${key}.json`);
  }

  private getFromPersistentCache<T>(key: string): T | null {
    try {
      const filePath = this.getCacheFilePath(key);
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const data = fs.readFileSync(filePath, 'utf-8');
      const entry: CacheEntry<T> = JSON.parse(data);

      // Check if expired
      if (Date.now() >= entry.expiresAt) {
        this.deleteFromPersistentCache(key);
        return null;
      }

      // Move to memory cache
      this.memoryCache.set(key, entry);

      return entry.value;
    } catch (error) {
      console.error(`[CacheManager] Error reading cache ${key}:`, error);
      return null;
    }
  }

  private setInPersistentCache<T>(key: string, entry: CacheEntry<T>): void {
    try {
      const filePath = this.getCacheFilePath(key);
      fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
    } catch (error) {
      console.error(`[CacheManager] Error writing cache ${key}:`, error);
    }
  }

  private hasInPersistentCache(key: string): boolean {
    const filePath = this.getCacheFilePath(key);
    if (!fs.existsSync(filePath)) {
      return false;
    }

    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const entry: CacheEntry<any> = JSON.parse(data);
      return Date.now() < entry.expiresAt;
    } catch {
      return false;
    }
  }

  private deleteFromPersistentCache(key: string): void {
    try {
      const filePath = this.getCacheFilePath(key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`[CacheManager] Error deleting cache ${key}:`, error);
    }
  }

  private loadPersistentCache(): void {
    try {
      const files = fs.readdirSync(this.cacheDir);
      let loaded = 0;

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const filePath = path.join(this.cacheDir, file);
          const data = fs.readFileSync(filePath, 'utf-8');
          const entry: CacheEntry<any> = JSON.parse(data);

          // Check if expired
          if (Date.now() >= entry.expiresAt) {
            fs.unlinkSync(filePath);
            continue;
          }

          // Load into memory
          const key = file.replace('.json', '');
          this.memoryCache.set(key, entry);
          loaded++;
        } catch (error) {
          console.error(`[CacheManager] Error loading cache file ${file}:`, error);
        }
      }

      console.log(`[CacheManager] Loaded ${loaded} cache entries`);
    } catch (error) {
      console.error('[CacheManager] Error loading persistent cache:', error);
    }
  }

  private clearPersistentCache(): void {
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      }
    } catch (error) {
      console.error('[CacheManager] Error clearing persistent cache:', error);
    }
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): void {
    const now = Date.now();

    // Clean memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now >= entry.expiresAt) {
        this.memoryCache.delete(key);
      }
    }

    // Clean persistent cache
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.cacheDir, file);
        try {
          const data = fs.readFileSync(filePath, 'utf-8');
          const entry: CacheEntry<any> = JSON.parse(data);

          if (now >= entry.expiresAt) {
            fs.unlinkSync(filePath);
          }
        } catch {
          // Invalid file, delete it
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      console.error('[CacheManager] Error during cleanup:', error);
    }
  }
}









