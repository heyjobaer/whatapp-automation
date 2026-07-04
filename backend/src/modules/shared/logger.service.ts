import { Injectable, LoggerService as NestLoggerService, Scope } from '@nestjs/common';
import * as winston from 'winston';
import { LogLevel, LogFormat, LogContext } from '../../common/enum/loglevel.enum';

const SECRET_KEY_PATTERN = /password|passwd|secret|token|api[-_]?key|authorization|credential|pepper|private[-_]?key/i;

function redactSecrets(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object' || depth > 4) return value;
  if (Array.isArray(value)) return value.map(v => redactSecrets(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : redactSecrets(val, depth + 1);
  }
  return out;
}

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
} as const;

const LEVEL_COLOR: Record<LogLevel, string> = {
  [LogLevel.ERROR]: ANSI.red,
  [LogLevel.WARN]: ANSI.yellow,
  [LogLevel.INFO]: ANSI.green,
  [LogLevel.DEBUG]: ANSI.magenta,
  [LogLevel.VERBOSE]: ANSI.cyan,
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.INFO]: 'LOG',
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.VERBOSE]: 'VERBOSE',
};

const STRUCTURAL_KEYS = new Set(['timestamp', 'level', 'context', 'message', 'trace']);

const WINSTON_LEVELS: Record<string, number> = {
  [LogLevel.ERROR]: 0,
  [LogLevel.WARN]: 1,
  [LogLevel.INFO]: 2,
  [LogLevel.DEBUG]: 3,
  [LogLevel.VERBOSE]: 4,
};

let logFormatOverride: LogFormat | null = null;

function resolveFormat(): LogFormat {
  if (logFormatOverride) return logFormatOverride;

  const explicit = process.env.LOG_FORMAT?.trim().toLowerCase();
  if (explicit === LogFormat.JSON || explicit === LogFormat.PRETTY) {
    return explicit;
  }

  return process.env.NODE_ENV === 'production' ? LogFormat.JSON : LogFormat.PRETTY;
}

function colorEnabled(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY);
}

function formatPretty(level: LogLevel, entry: Record<string, unknown>): string {
  const useColor = colorEnabled();
  const paint = (code: string, text: string): string => (useColor ? `${code}${text}${ANSI.reset}` : text);

  const levelColor = LEVEL_COLOR[level] ?? ANSI.green;
  const label = (LEVEL_LABEL[level] ?? String(level).toUpperCase()).padStart(7);
  const timestamp = new Date(String(entry.timestamp)).toLocaleString();
  const contextName = String(entry.context);
  const message = String(entry.message);

  const formatValue = (value: unknown): string => (typeof value === 'string' ? value : (JSON.stringify(value) ?? ''));
  const meta = Object.entries(entry)
    .filter(([key, value]) => !STRUCTURAL_KEYS.has(key) && value !== undefined)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(' ');

  let line =
    `${paint(levelColor, `[OpenWA] ${process.pid}  -`)} ${timestamp} ` +
    `${paint(levelColor, label)} ${paint(ANSI.yellow, `[${contextName}]`)} ${paint(levelColor, message)}`;

  if (meta) {
    line += ` ${paint(ANSI.dim, meta)}`;
  }

  // Error stack traces print on their own line(s), like NestJS.
  if (typeof entry.trace === 'string' && entry.trace) {
    line += `\n${paint(levelColor, entry.trace)}`;
  }

  return line;
}

const winstonLogger = winston.createLogger({
  levels: WINSTON_LEVELS,
  level: LogLevel.INFO,
  format: winston.format.printf(info => {
    const { level, message, timestamp, context, ...rest } = info as unknown as Record<string, unknown>;
    const entry: Record<string, unknown> = { timestamp, level, context, message, ...rest };
    return resolveFormat() === LogFormat.PRETTY ? formatPretty(level as LogLevel, entry) : JSON.stringify(entry);
  }),
  transports: [new winston.transports.Console({ stderrLevels: [LogLevel.ERROR, LogLevel.WARN] })],
});

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService implements NestLoggerService {
  private context: string = 'Application';

  static setLogLevel(level: LogLevel): void {
    winstonLogger.level = level;
  }

  static setLogFormat(format: LogFormat | null): void {
    logFormatOverride = format;
  }

  setContext(context: string): void {
    this.context = context;
  }

  log(message: string, context?: string | LogContext): void {
    this.writeLog(LogLevel.INFO, message, context);
  }

  error(message: string, trace?: string, context?: string | LogContext): void {
    const ctx = typeof context === 'string' ? { context } : context;
    this.writeLog(LogLevel.ERROR, message, { ...ctx, trace });
  }

  warn(message: string, context?: string | LogContext): void {
    this.writeLog(LogLevel.WARN, message, context);
  }

  debug(message: string, context?: string | LogContext): void {
    this.writeLog(LogLevel.DEBUG, message, context);
  }

  verbose(message: string, context?: string | LogContext): void {
    this.writeLog(LogLevel.VERBOSE, message, context);
  }

  private writeLog(level: LogLevel, message: string, context?: string | LogContext): void {
    const timestamp = new Date().toISOString();
    const contextName = typeof context === 'string' ? context : this.context;
    const metadata =
      typeof context === 'object' && context !== null ? (redactSecrets(context) as Record<string, unknown>) : {};

    winstonLogger.log(level, message, { timestamp, context: contextName, ...metadata });
  }
}

export function createLogger(context: string): LoggerService {
  const logger = new LoggerService();
  logger.setContext(context);
  return logger;
}
