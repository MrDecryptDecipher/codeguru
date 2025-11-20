/**
 * Advanced Error Handling with Retry Logic and Circuit Breaker Pattern
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: Array<new (...args: any[]) => Error>;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  halfOpenMaxCalls?: number;
}

export enum CircuitBreakerState {
  CLOSED = 'closed',      // Normal operation
  OPEN = 'open',          // Failing, reject requests
  HALF_OPEN = 'half-open' // Testing if service recovered
}

export class RetryHandler {
  /**
   * Execute function with exponential backoff retry
   */
  static async withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 30000,
      backoffMultiplier = 2,
      retryableErrors = [],
      onRetry
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (retryableErrors.length > 0) {
          const isRetryable = retryableErrors.some(
            ErrorClass => lastError instanceof ErrorClass
          );
          if (!isRetryable) {
            throw lastError;
          }
        }

        // Don't retry on last attempt
        if (attempt === maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          initialDelay * Math.pow(backoffMultiplier, attempt),
          maxDelay
        );

        if (onRetry) {
          onRetry(attempt + 1, lastError);
        }

        console.warn(
          `[RetryHandler] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms:`,
          lastError.message
        );

        await this.delay(delay);
      }
    }

    throw lastError || new Error('Unknown error');
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenCalls: number = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly halfOpenMaxCalls: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.halfOpenMaxCalls = options.halfOpenMaxCalls || 3;
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitBreakerState.OPEN) {
      // Check if reset timeout has passed
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.halfOpenCalls = 0;
        console.log('[CircuitBreaker] Moving to HALF_OPEN state');
      } else {
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
    }

    // Execute function
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.halfOpenCalls++;
      if (this.halfOpenCalls >= this.halfOpenMaxCalls) {
        // Service recovered
        this.state = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
        this.halfOpenCalls = 0;
        console.log('[CircuitBreaker] Service recovered, moving to CLOSED state');
      }
    } else {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Failed during half-open, open circuit immediately
      this.state = CircuitBreakerState.OPEN;
      this.halfOpenCalls = 0;
      console.log('[CircuitBreaker] Failed during HALF_OPEN, moving to OPEN state');
    } else if (this.failureCount >= this.failureThreshold) {
      // Too many failures, open circuit
      this.state = CircuitBreakerState.OPEN;
      console.log(`[CircuitBreaker] Failure threshold reached (${this.failureCount}), opening circuit`);
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.halfOpenCalls = 0;
    this.lastFailureTime = 0;
    console.log('[CircuitBreaker] Manually reset');
  }
}

export class ErrorHandler {
  private static circuitBreakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create circuit breaker for a service
   */
  static getCircuitBreaker(serviceName: string, options?: CircuitBreakerOptions): CircuitBreaker {
    if (!this.circuitBreakers.has(serviceName)) {
      this.circuitBreakers.set(serviceName, new CircuitBreaker(options));
    }
    return this.circuitBreakers.get(serviceName)!;
  }

  /**
   * Execute with both retry and circuit breaker
   */
  static async executeWithProtection<T>(
    serviceName: string,
    fn: () => Promise<T>,
    retryOptions?: RetryOptions,
    circuitBreakerOptions?: CircuitBreakerOptions
  ): Promise<T> {
    const circuitBreaker = this.getCircuitBreaker(serviceName, circuitBreakerOptions);

    return circuitBreaker.execute(() =>
      RetryHandler.withRetry(fn, retryOptions)
    );
  }

  /**
   * Handle error and provide user-friendly message
   */
  static getUserFriendlyError(error: unknown): string {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Network errors
      if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
        return 'Network error. Please check your internet connection and try again.';
      }

      // API errors
      if (message.includes('api') || message.includes('401') || message.includes('unauthorized')) {
        return 'Authentication error. Please check your API key.';
      }

      if (message.includes('429') || message.includes('rate limit')) {
        return 'Rate limit exceeded. Please wait a moment and try again.';
      }

      if (message.includes('404') || message.includes('not found')) {
        return 'Resource not found. The requested item may have been removed.';
      }

      // Circuit breaker errors
      if (message.includes('circuit breaker')) {
        return 'Service temporarily unavailable. Please try again in a moment.';
      }

      // Generic error
      return error.message || 'An unexpected error occurred. Please try again.';
    }

    return 'An unexpected error occurred. Please try again.';
  }

  /**
   * Check if error is retryable
   */
  static isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();

    // Retryable errors
    const retryablePatterns = [
      'network',
      'timeout',
      'econnrefused',
      'etimedout',
      'eai_again',
      'temporary',
      '503',
      '502',
      '504'
    ];

    return retryablePatterns.some(pattern => message.includes(pattern));
  }

  /**
   * Log error with context
   */
  static logError(error: unknown, context?: Record<string, any>): void {
    const errorInfo = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
      timestamp: new Date().toISOString()
    };

    console.error('[ErrorHandler]', JSON.stringify(errorInfo, null, 2));
  }
}









