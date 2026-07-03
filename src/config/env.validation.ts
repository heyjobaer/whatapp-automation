type EnvConfig = Record<string, unknown>;

/**
 * Fail-fast environment validation. Wired as ConfigModule's `validate` callback so a misconfigured
 * deployment is rejected at BOOT instead of failing on the first query. Hand-rolled to avoid adding
 * a `joi` dependency.
 *
 * The project runs on a SINGLE PostgreSQL database (SQLite support removed), so there is no longer a
 * DATABASE_TYPE / main-vs-data distinction to validate — only that the connection knobs are sane.
 */
export function validateEnv(config: EnvConfig): EnvConfig {
  const errors: string[] = [];

  const str = (key: string): string | undefined => {
    const value = config[key];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  };

  // Whitelist the registered engine/storage ids so a typo fails fast at boot instead of silently
  // falling back to the default (engine.factory swallows an unknown ENGINE_TYPE → legacy wwebjs;
  // STORAGE_TYPE → local). Values must match the ids registered in engine.factory / configuration.
  const checkEnum = (key: string, allowed: string[]): void => {
    const value = str(key);
    if (value !== undefined && !allowed.includes(value)) {
      errors.push(`${key} must be one of ${allowed.map(v => `"${v}"`).join(', ')} (got "${value}")`);
    }
  };
  checkEnum('ENGINE_TYPE', ['whatsapp-web.js', 'baileys']);
  checkEnum('STORAGE_TYPE', ['local', 's3']);

  const checkPort = (key: string): void => {
    const raw = str(key);
    if (raw === undefined) return;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      errors.push(`${key} must be an integer port in [1, 65535] (got "${raw}")`);
    }
  };
  checkPort('PORT');
  checkPort('DATABASE_PORT');
  checkPort('REDIS_PORT');

  // Other numeric knobs: a non-integer (e.g. `RATE_LIMIT_SHORT_LIMIT=abc`) parses to NaN downstream,
  // which silently disables the corresponding limit/timeout. Reject at boot instead of coercing.
  const checkNonNegativeInt = (key: string): void => {
    const raw = str(key);
    if (raw === undefined) return;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      errors.push(`${key} must be a non-negative integer (got "${raw}")`);
    }
  };
  for (const key of [
    'RATE_LIMIT_SHORT_TTL',
    'RATE_LIMIT_MEDIUM_TTL',
    'RATE_LIMIT_LONG_TTL',
    'WEBHOOK_MAX_RETRIES',
    'WEBHOOK_RETRY_DELAY',
    'DATABASE_POOL_SIZE',
    'REDIS_CONNECT_TIMEOUT_MS',
    'MAX_CONCURRENT_SESSIONS', // 0 = unlimited
  ]) {
    checkNonNegativeInt(key);
  }

  // Some knobs are nonsensical at 0 and contradict the "non-negative" intent: a rate-limit LIMIT of 0
  // disables that tier's throttling (a self-DoS), and a webhook timeout of 0 aborts every delivery
  // immediately. Require a positive integer for these.
  const checkPositiveInt = (key: string): void => {
    const raw = str(key);
    if (raw === undefined) return;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) {
      errors.push(`${key} must be a positive integer (got "${raw}")`);
    }
  };
  for (const key of ['RATE_LIMIT_SHORT_LIMIT', 'RATE_LIMIT_MEDIUM_LIMIT', 'RATE_LIMIT_LONG_LIMIT', 'WEBHOOK_TIMEOUT']) {
    checkPositiveInt(key);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${errors.join('\n  - ')}`);
  }

  return config;
}
