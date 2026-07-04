import { LoggerService, LogLevel, LogFormat, createLogger } from './logger.service';

interface LogEntry {
  timestamp: string;
  level: string;
  context: string;
  message: string;
  sessionId?: string;
  action?: string;
  trace?: string;
}

// The logger writes through Winston's Console transport, which emits to process.stdout /
// process.stderr (error + warn go to stderr). Winston appends a trailing newline; JSON.parse and
// String#includes both tolerate it, so no trimming is needed.
function getLogOutput(spy: jest.SpyInstance): LogEntry {
  const calls = spy.mock.calls as unknown as string[][];
  return JSON.parse(calls[0][0]) as LogEntry;
}

// Helper to read the raw (unparsed) string a spy was called with.
function getRawOutput(spy: jest.SpyInstance): string {
  const calls = spy.mock.calls as unknown as string[][];
  return calls[0][0];
}

describe('LoggerService', () => {
  let logger: LoggerService;
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new LoggerService();
    logger.setContext('TestContext');
    // Pin JSON so structured-output assertions are deterministic regardless of TTY/LOG_FORMAT.
    LoggerService.setLogFormat(LogFormat.JSON);
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    LoggerService.setLogFormat(null);
    LoggerService.setLogLevel(LogLevel.INFO);
  });

  describe('log', () => {
    it('should log info messages with context', () => {
      logger.log('Test message');

      expect(stdoutSpy).toHaveBeenCalled();
      const output = getLogOutput(stdoutSpy);
      expect(output.level).toBe('info');
      expect(output.message).toBe('Test message');
      expect(output.context).toBe('TestContext');
      expect(output.timestamp).toBeDefined();
    });

    it('should log with additional metadata', () => {
      logger.log('Test message', { sessionId: '123', action: 'test' });

      const output = getLogOutput(stdoutSpy);
      expect(output.sessionId).toBe('123');
      expect(output.action).toBe('test');
    });
  });

  describe('secret redaction', () => {
    it('redacts the values of secret-named keys in the metadata', () => {
      logger.log('auth', { password: 'hunter2', apiKey: 'abc123', userId: 'u1' });

      const output = getLogOutput(stdoutSpy) as unknown as Record<string, unknown>;
      expect(output.password).toBe('[REDACTED]');
      expect(output.apiKey).toBe('[REDACTED]');
      expect(output.userId).toBe('u1');
    });

    it('redacts secret-named keys nested inside the metadata', () => {
      logger.log('cfg', { config: { redisPassword: 'p', host: 'h' } });

      const output = getLogOutput(stdoutSpy) as unknown as { config: { redisPassword: string; host: string } };
      expect(output.config.redisPassword).toBe('[REDACTED]');
      expect(output.config.host).toBe('h');
    });
  });

  describe('error', () => {
    it('should log error messages to stderr', () => {
      logger.error('Error message', 'stack trace');

      expect(stderrSpy).toHaveBeenCalled();
      const output = getLogOutput(stderrSpy);
      expect(output.level).toBe('error');
      expect(output.message).toBe('Error message');
      expect(output.trace).toBe('stack trace');
    });
  });

  describe('warn', () => {
    it('should log warning messages to stderr', () => {
      logger.warn('Warning message');

      expect(stderrSpy).toHaveBeenCalled();
      const output = getLogOutput(stderrSpy);
      expect(output.level).toBe('warn');
      expect(output.message).toBe('Warning message');
    });
  });

  describe('log levels', () => {
    it('should not log debug when level is INFO', () => {
      LoggerService.setLogLevel(LogLevel.INFO);
      logger.debug('Debug message');

      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('should log debug when level is DEBUG', () => {
      LoggerService.setLogLevel(LogLevel.DEBUG);
      logger.debug('Debug message');

      expect(stdoutSpy).toHaveBeenCalled();
    });
  });

  describe('pretty format', () => {
    beforeEach(() => {
      LoggerService.setLogFormat(LogFormat.PRETTY);
    });

    it('should render a NestJS-style human-readable line instead of JSON', () => {
      logger.log('Test message');

      const output = getRawOutput(stdoutSpy);
      // Not JSON.
      expect(() => {
        JSON.parse(output);
      }).toThrow();
      // NestJS-style prefix, level label, context and message all present.
      expect(output).toContain('[OpenWA]');
      expect(output).toContain('LOG');
      expect(output).toContain('[TestContext]');
      expect(output).toContain('Test message');
    });

    it('should append metadata as key=value pairs', () => {
      logger.log('Test message', { sessionId: '123', action: 'test' });

      const output = getRawOutput(stdoutSpy);
      expect(output).toContain('sessionId=123');
      expect(output).toContain('action=test');
    });

    it('should append the stack trace on a new line for errors', () => {
      logger.error('Error message', 'stack trace line');

      const output = getRawOutput(stderrSpy);
      expect(output).toContain('Error message');
      expect(output).toContain('\nstack trace line');
    });
  });

  describe('createLogger', () => {
    it('should create logger with context', () => {
      const testLogger = createLogger('MyContext');
      testLogger.log('Test');

      const output = getLogOutput(stdoutSpy);
      expect(output.context).toBe('MyContext');
    });
  });
});
