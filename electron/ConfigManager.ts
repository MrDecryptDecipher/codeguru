import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface UserConfig {
  // Window settings
  window: {
    opacity: number;
    position: { x: number; y: number } | null;
    size: { width: number; height: number } | null;
    theme: 'light' | 'dark' | 'auto';
  };

  // Screenshot settings
  screenshot: {
    format: 'png' | 'jpg' | 'webp';
    quality: number;
    compression: boolean;
    maxQueueSize: number;
    autoDelete: boolean;
    deleteAfter: number; // minutes
  };

  // AI settings
  ai: {
    provider: 'openrouter' | 'gemini' | 'ollama';
    defaultModel: string;
    temperature: number;
    maxTokens: number;
    enableCaching: boolean;
    cacheTTL: number; // seconds
  };

  // Audio settings
  audio: {
    sampleRate: number;
    enableRealTime: boolean;
    autoTranscribe: boolean;
    language: string;
  };

  // Shortcuts
  shortcuts: {
    toggleWindow: string;
    takeScreenshot: string;
    processScreenshot: string;
    resetQueue: string;
    moveLeft: string;
    moveRight: string;
    moveUp: string;
    moveDown: string;
  };

  // Advanced
  advanced: {
    enableOCR: boolean;
    enableCodeExecution: boolean;
    enableMultiMonitor: boolean;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    enableAnalytics: boolean;
  };

  // Real-time assistant
  realtime: {
    enabled: boolean;
    transcription: {
      provider: 'deepgram';
      language: string;
      sampleRate: number;
      interimResults: boolean;
      systemDevice: string;
      microphoneDevice: string;
      includeSystemAudio: boolean;
    };
    responder: {
      throttleMs: number;
      maxTokens: number;
      persona: 'interview' | 'meeting' | 'custom';
      contextWindowSeconds: number;
    };
  };
}

const DEFAULT_CONFIG: UserConfig = {
  window: {
    opacity: 0.95,
    position: null,
    size: null,
    theme: 'dark'
  },
  screenshot: {
    format: 'png',
    quality: 90,
    compression: true,
    maxQueueSize: 5,
    autoDelete: true,
    deleteAfter: 60
  },
  ai: {
    provider: 'openrouter',
    defaultModel: '',
    temperature: 0.7,
    maxTokens: 4096,
    enableCaching: true,
    cacheTTL: 3600
  },
  audio: {
    sampleRate: 16000,
    enableRealTime: false,
    autoTranscribe: false,
    language: 'en-US'
  },
  shortcuts: {
    toggleWindow: 'CommandOrControl+B',
    takeScreenshot: 'CommandOrControl+H',
    processScreenshot: 'CommandOrControl+Enter',
    resetQueue: 'CommandOrControl+R',
    moveLeft: 'CommandOrControl+Left',
    moveRight: 'CommandOrControl+Right',
    moveUp: 'CommandOrControl+Up',
    moveDown: 'CommandOrControl+Down'
  },
  advanced: {
    enableOCR: true,
    enableCodeExecution: true,
    enableMultiMonitor: true,
    logLevel: 'info',
    enableAnalytics: false
  },
  realtime: {
    enabled: false,
    transcription: {
      provider: 'deepgram',
      language: 'en-US',
      sampleRate: 16000,
      interimResults: true,
      systemDevice: 'virtual-audio-capturer',
      microphoneDevice: 'default',
      includeSystemAudio: true
    },
    responder: {
      throttleMs: 450,
      maxTokens: 160,
      persona: 'interview',
      contextWindowSeconds: 45
    }
  }
};

export class ConfigManager {
  private static instance: ConfigManager | null = null;
  private config: UserConfig;
  private configPath: string;

  private constructor() {
    this.configPath = path.join(app.getPath('userData'), 'config.json');
    this.config = this.loadConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Load configuration from file
   */
  private loadConfig(): UserConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const loaded = JSON.parse(data);
        // Merge with defaults to handle missing keys
        return this.mergeConfig(DEFAULT_CONFIG, loaded);
      }
    } catch (error) {
      console.error('[ConfigManager] Error loading config:', error);
    }

    return { ...DEFAULT_CONFIG };
  }

  /**
   * Merge config objects (deep merge)
   */
  private mergeConfig(defaults: UserConfig, loaded: Partial<UserConfig>): UserConfig {
    const merged = { ...defaults };

    if (loaded.window) {
      merged.window = { ...defaults.window, ...loaded.window };
    }
    if (loaded.screenshot) {
      merged.screenshot = { ...defaults.screenshot, ...loaded.screenshot };
    }
    if (loaded.ai) {
      merged.ai = { ...defaults.ai, ...loaded.ai };
    }
    if (loaded.audio) {
      merged.audio = { ...defaults.audio, ...loaded.audio };
    }
    if (loaded.shortcuts) {
      merged.shortcuts = { ...defaults.shortcuts, ...loaded.shortcuts };
    }
    if (loaded.advanced) {
      merged.advanced = { ...defaults.advanced, ...loaded.advanced };
    }

    return merged;
  }

  /**
   * Save configuration to file
   */
  async saveConfig(config: Partial<UserConfig>): Promise<void> {
    try {
      this.config = this.mergeConfig(this.config, config);
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
      this.emit('configChanged', this.config);
    } catch (error) {
      console.error('[ConfigManager] Error saving config:', error);
      throw error;
    }
  }

  /**
   * Get configuration
   */
  getConfig(): UserConfig {
    return { ...this.config };
  }

  /**
   * Get specific config section
   */
  getSection<K extends keyof UserConfig>(section: K): UserConfig[K] {
    return { ...this.config[section] };
  }

  /**
   * Update specific config section
   */
  async updateSection<K extends keyof UserConfig>(
    section: K,
    values: Partial<UserConfig[K]>
  ): Promise<void> {
    const updated = { ...this.config[section], ...values };
    await this.saveConfig({ [section]: updated } as Partial<UserConfig>);
  }

  /**
   * Get config value by path (e.g., 'window.opacity')
   */
  getValue(path: string): any {
    const keys = path.split('.');
    let value: any = this.config;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Set config value by path
   */
  async setValue(path: string, value: any): Promise<void> {
    const keys = path.split('.');
    const lastKey = keys.pop();
    if (!lastKey) return;

    let target: any = this.config;
    for (const key of keys) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }

    target[lastKey] = value;
    await this.saveConfig({});
  }

  /**
   * Reset to defaults
   */
  async reset(): Promise<void> {
    this.config = { ...DEFAULT_CONFIG };
    await this.saveConfig({});
  }

  /**
   * Export configuration
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration
   */
  async importConfig(configJson: string): Promise<void> {
    try {
      const imported = JSON.parse(configJson);
      this.config = this.mergeConfig(DEFAULT_CONFIG, imported);
      await this.saveConfig({});
    } catch (error) {
      throw new Error(`Invalid config format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private emit(event: string, data?: any): void {
    // Event emitter functionality can be added if needed
  }
}




