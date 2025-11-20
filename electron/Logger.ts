import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
  };
}

export class Logger {
  private static instance: Logger | null = null;
  private logLevel: LogLevel = LogLevel.INFO;
  private logDir: string;
  private logFile: string;
  private maxLogSize: number = 10 * 1024 * 1024; // 10MB
  private maxLogFiles: number = 5;
  private enableConsole: boolean = true;
  private enableFile: boolean = true;

  private constructor() {
    this.logDir = path.join(app.getPath('userData'), 'logs');
    this.ensureLogDirectory();
    this.logFile = path.join(this.logDir, `app-${this.getDateString()}.log`);
    this.rotateLogsIfNeeded();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private getDateString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private rotateLogsIfNeeded(): void {
    try {
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        if (stats.size > this.maxLogSize) {
          this.rotateLogFile();
        }
      }
    } catch (error) {
      console.error('[Logger] Error checking log file size:', error);
    }
  }

  private rotateLogFile(): void {
    try {
      // Find existing rotated files
      const files = fs.readdirSync(this.logDir)
        .filter(f => f.startsWith('app-') && f.endsWith('.log'))
        .sort()
        .reverse();

      // Delete oldest files if we exceed max
      if (files.length >= this.maxLogFiles) {
        const filesToDelete = files.slice(this.maxLogFiles - 1);
        for (const file of filesToDelete) {
          fs.unlinkSync(path.join(this.logDir, file));
        }
      }

      // Create new log file with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      this.logFile = path.join(this.logDir, `app-${this.getDateString()}-${timestamp}.log`);
    } catch (error) {
      console.error('[Logger] Error rotating log file:', error);
    }
  }

  private formatMessage(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): string {
    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    const errorStr = error ? ` Error: ${error.message}${error.stack ? `\n${error.stack}` : ''}` : '';
    
    return `[${timestamp}] [${levelName}] ${message}${contextStr}${errorStr}`;
  }

  private writeLog(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    if (level < this.logLevel) {
      return; // Skip if below log level
    }

    const formatted = this.formatMessage(level, message, context, error);

    // Console output
    if (this.enableConsole) {
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(formatted);
          break;
        case LogLevel.INFO:
          console.info(formatted);
          break;
        case LogLevel.WARN:
          console.warn(formatted);
          break;
        case LogLevel.ERROR:
          console.error(formatted);
          break;
      }
    }

    // File output
    if (this.enableFile) {
      try {
        this.rotateLogsIfNeeded();
        fs.appendFileSync(this.logFile, formatted + '\n', 'utf-8');
      } catch (error) {
        console.error('[Logger] Error writing to log file:', error);
      }
    }
  }

  public debug(message: string, context?: Record<string, any>): void {
    this.writeLog(LogLevel.DEBUG, message, context);
  }

  public info(message: string, context?: Record<string, any>): void {
    this.writeLog(LogLevel.INFO, message, context);
  }

  public warn(message: string, context?: Record<string, any>): void {
    this.writeLog(LogLevel.WARN, message, context);
  }

  public error(message: string, error?: Error, context?: Record<string, any>): void {
    this.writeLog(LogLevel.ERROR, message, context, error);
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public setEnableConsole(enable: boolean): void {
    this.enableConsole = enable;
  }

  public setEnableFile(enable: boolean): void {
    this.enableFile = enable;
  }

  public getLogFile(): string {
    return this.logFile;
  }

  public getLogs(limit: number = 100): string[] {
    try {
      if (!fs.existsSync(this.logFile)) {
        return [];
      }

      const content = fs.readFileSync(this.logFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      return lines.slice(-limit);
    } catch (error) {
      console.error('[Logger] Error reading logs:', error);
      return [];
    }
  }

  public clearLogs(): void {
    try {
      if (fs.existsSync(this.logFile)) {
        fs.writeFileSync(this.logFile, '', 'utf-8');
      }
    } catch (error) {
      console.error('[Logger] Error clearing logs:', error);
    }
  }
}

// Export singleton instance
export const logger = Logger.getInstance();









