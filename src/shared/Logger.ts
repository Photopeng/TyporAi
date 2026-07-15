export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, details?: unknown): void;
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

export class ConsoleLogger implements Logger {
  constructor(private readonly scope = 'typora-ai-assistant') {}

  debug(message: string, details?: unknown): void {
    this.write('debug', message, details);
  }

  info(message: string, details?: unknown): void {
    this.write('info', message, details);
  }

  warn(message: string, details?: unknown): void {
    this.write('warn', message, details);
  }

  error(message: string, details?: unknown): void {
    this.write('error', message, details);
  }

  private write(level: LogLevel, message: string, details?: unknown): void {
    const prefix = `[${this.scope}] ${message}`;
    if (details === undefined) {
      console[level](prefix);
    } else {
      console[level](prefix, details);
    }
  }
}
