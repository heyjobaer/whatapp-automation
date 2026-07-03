export default () => ({
  port: parseInt(process.env.PORT || '2785', 10),

  // Redis configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    connectTimeoutMs: parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '5000', 10),
  },

  // Queue configuration
  queue: {
    enabled: process.env.QUEUE_ENABLED === 'true',
  },

  // Cache configuration
  cache: {
    enabled: process.env.CACHE_ENABLED === 'true',
  },

  // Database configuration — a SINGLE PostgreSQL database for ALL tables (sessions, messages,
  // api_keys, audit_logs, …). SQLite support and the former main/data connection split are gone.
  database: {
    type: 'postgres' as const,
    // Postgres connection (these knobs are also read by src/database/database.module.ts / the CLI knexfile).
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    name: process.env.DATABASE_NAME || 'openwa',
    logging: process.env.DATABASE_LOGGING === 'true',
    // Run pending Knex migrations automatically at boot (zero-config first run). Set
    // DATABASE_AUTO_MIGRATE=false to manage schema out-of-band via `npm run migrate` / `migrate:prod`.
    autoMigrate: process.env.DATABASE_AUTO_MIGRATE !== 'false',
    // Connection pooling.
    poolSize: parseInt(process.env.DATABASE_POOL_SIZE || '10', 10),
    // Pool/query timeouts. statement_timeout is server-side per query; idle/connection are pool-side.
    statementTimeoutMs: parseInt(process.env.DATABASE_STATEMENT_TIMEOUT_MS || '30000', 10),
    idleTimeoutMs: parseInt(process.env.DATABASE_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeoutMs: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT_MS || '10000', 10),
    // SSL configuration.
    ssl: process.env.DATABASE_SSL === 'true',
    sslRejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false',
  },

  // WhatsApp engine configuration
  engine: {
    type: process.env.ENGINE_TYPE || 'whatsapp-web.js',
    puppeteer: {
      headless: process.env.PUPPETEER_HEADLESS !== 'false',
      // Accept either delimiter: .env/compose use commas, the dashboard Infrastructure form
      // persists space-separated. Splitting on both keeps each flag a discrete argv token —
      // a single glued token like "--no-sandbox --disable-gpu" silently neuters --no-sandbox.
      args: (process.env.PUPPETEER_ARGS || '--no-sandbox,--disable-setuid-sandbox').split(/[\s,]+/).filter(Boolean),
      // Optional path to a system Chromium/Chrome binary. When unset, whatsapp-web.js
      // uses Puppeteer's bundled Chromium. Required on hosts where the bundled binary
      // is missing or incompatible (Alpine, ARM, custom base images).
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    },
    sessionDataPath: process.env.SESSION_DATA_PATH || './data/sessions',
    // Baileys engine (used when ENGINE_TYPE=baileys). Multi-file auth state base dir; each session
    // gets its own subdirectory. Read by the Baileys plugin from the opaque engine config blob.
    baileys: {
      authDir: process.env.BAILEYS_AUTH_DIR || './data/baileys',
    },
  },

  sessions: {
    // 0 = unlimited/backwards-compatible. Set to a positive integer to cap concurrently running or
    // initializing WhatsApp engines, which protects memory/Chromium-constrained deployments.
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '0', 10),
  },

  // Webhook configuration
  webhook: {
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '10000', 10),
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '3', 10),
    retryDelay: parseInt(process.env.WEBHOOK_RETRY_DELAY || '5000', 10),
  },

  // API configuration
  api: {
    rateLimit: {
      // Short burst protection: 10 requests per second
      shortTtl: parseInt(process.env.RATE_LIMIT_SHORT_TTL || '1000', 10),
      shortLimit: parseInt(process.env.RATE_LIMIT_SHORT_LIMIT || '10', 10),
      // Medium protection: 100 requests per minute
      mediumTtl: parseInt(process.env.RATE_LIMIT_MEDIUM_TTL || '60000', 10),
      mediumLimit: parseInt(process.env.RATE_LIMIT_MEDIUM_LIMIT || '100', 10),
      // Long protection: 1000 requests per hour
      longTtl: parseInt(process.env.RATE_LIMIT_LONG_TTL || '3600000', 10),
      longLimit: parseInt(process.env.RATE_LIMIT_LONG_LIMIT || '1000', 10),
    },
  },

  // Authentication (email + password, JWT)
  auth: {
    // Secret used to sign/verify JWTs. MUST be set to a strong random value in production.
    jwtSecret: process.env.JWT_SECRET,
    // Token lifetime (e.g. "7d", "12h", "3600s").
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // Security configuration
  security: {
    // Comma-separated IPs/CIDRs of reverse proxies whose X-Forwarded-For header
    // may be trusted for client-IP resolution. Empty by default: X-Forwarded-For
    // is ignored and the direct socket address is used, preventing spoofing of
    // the API-key allowedIps whitelist.
    trustedProxies: (process.env.TRUSTED_PROXIES || '')
      .split(',')
      .map(proxy => proxy.trim())
      .filter(Boolean),
  },

  // Plugin platform configuration
  plugins: {
    // Where installed plugins live on disk (matches the plugin loader's default).
    dir: process.env.PLUGINS_DIR || './plugins',
    // Remote catalog of installable plugins (JSON array; the OpenWA-plugins repo's plugins.json).
    // Fetched through the SSRF guard — add its host to SSRF_ALLOWED_HOSTS if it is not publicly resolvable.
    catalogUrl:
      process.env.PLUGIN_CATALOG_URL || 'https://raw.githubusercontent.com/rmyndharis/OpenWA-plugins/main/plugins.json',
    // Cap on a plugin .zip downloaded by install-from-URL (matches the 5 MB upload limit). Fail-safe:
    // a non-numeric or non-positive value (parseInt → NaN/0/-n) falls back to the default rather than
    // silently disabling the cap (a downstream `??` would not catch NaN).
    downloadMaxBytes: (() => {
      const n = parseInt(process.env.PLUGIN_DOWNLOAD_MAX_BYTES ?? '', 10);
      return Number.isFinite(n) && n > 0 ? n : 5 * 1024 * 1024;
    })(),
  },

  // Storage configuration
  storage: {
    type: process.env.STORAGE_TYPE || 'local',
    localPath: process.env.STORAGE_LOCAL_PATH || './data/media',
    s3: {
      bucket: process.env.S3_BUCKET,
      region: process.env.S3_REGION,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      endpoint: process.env.S3_ENDPOINT,
    },
  },
});
