import { EventEmitter } from 'events';

export interface QueuedRequest<T> {
  id: string;
  priority: number;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timestamp: number;
  timeout?: number;
  timeoutId?: NodeJS.Timeout;
}

export class RequestQueue extends EventEmitter {
  private queue: QueuedRequest<any>[] = [];
  private processing: boolean = false;
  private maxConcurrent: number = 3;
  private currentConcurrent: number = 0;
  private defaultTimeout: number = 30000; // 30 seconds

  /**
   * Add request to queue
   */
  async enqueue<T>(
    execute: () => Promise<T>,
    options?: {
      priority?: number;
      timeout?: number;
    }
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        priority: options?.priority || 0,
        execute,
        resolve,
        reject,
        timestamp: Date.now(),
        timeout: options?.timeout || this.defaultTimeout
      };

      // Set timeout
      if (request.timeout) {
        request.timeoutId = setTimeout(() => {
          this.cancel(request.id);
          reject(new Error('Request timeout'));
        }, request.timeout);
      }

      // Insert based on priority (higher priority first)
      this.insertByPriority(request);
      this.emit('enqueued', request.id);

      // Start processing if not already
      this.process();
    });
  }

  /**
   * Insert request by priority
   */
  private insertByPriority<T>(request: QueuedRequest<T>): void {
    let inserted = false;
    for (let i = 0; i < this.queue.length; i++) {
      if (request.priority > this.queue[i].priority) {
        this.queue.splice(i, 0, request);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.queue.push(request);
    }
  }

  /**
   * Process queue
   */
  private async process(): Promise<void> {
    if (this.processing) return;
    if (this.queue.length === 0) return;
    if (this.currentConcurrent >= this.maxConcurrent) return;

    this.processing = true;

    while (this.queue.length > 0 && this.currentConcurrent < this.maxConcurrent) {
      const request = this.queue.shift();
      if (!request) break;

      this.currentConcurrent++;
      this.emit('processing', request.id);

      // Execute request
      this.executeRequest(request)
        .then((result) => {
          if (request.timeoutId) {
            clearTimeout(request.timeoutId);
          }
          request.resolve(result);
          this.emit('completed', request.id);
        })
        .catch((error) => {
          if (request.timeoutId) {
            clearTimeout(request.timeoutId);
          }
          request.reject(error);
          this.emit('failed', request.id, error);
        })
        .finally(() => {
          this.currentConcurrent--;
          this.process(); // Continue processing
        });
    }

    this.processing = false;
  }

  /**
   * Execute single request
   */
  private async executeRequest<T>(request: QueuedRequest<T>): Promise<T> {
    try {
      return await request.execute();
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Cancel request
   */
  cancel(requestId: string): boolean {
    const index = this.queue.findIndex(req => req.id === requestId);
    if (index !== -1) {
      const request = this.queue[index];
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.reject(new Error('Request cancelled'));
      this.queue.splice(index, 1);
      this.emit('cancelled', requestId);
      return true;
    }
    return false;
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    for (const request of this.queue) {
      if (request.timeoutId) {
        clearTimeout(request.timeoutId);
      }
      request.reject(new Error('Queue cleared'));
    }
    this.queue = [];
    this.emit('cleared');
  }

  /**
   * Get queue status
   */
  getStatus(): {
    queued: number;
    processing: number;
    total: number;
  } {
    return {
      queued: this.queue.length,
      processing: this.currentConcurrent,
      total: this.queue.length + this.currentConcurrent
    };
  }

  /**
   * Set max concurrent requests
   */
  setMaxConcurrent(max: number): void {
    this.maxConcurrent = Math.max(1, max);
    this.process(); // Re-process if we can handle more
  }
}









