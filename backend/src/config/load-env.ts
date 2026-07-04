import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { clearBlankEnv, BLANK_SHADOWED_ENV_KEYS } from './env-precedence';

/**
 * Load configuration into process.env BEFORE any application module is imported.
 *
 * Loading order (later sources do NOT override earlier ones):
 *   1. Process env (Docker, shell, systemd) — highest priority
 *   2. .env (the single config file, in the backend root next to package.json)
 *
 * All configuration comes from `.env` (or real process env). There is no generated/data-folder
 * config file — the app never creates a `data/` directory just to boot.
 *
 * This runs as a side effect on import (see the call at the bottom), and main.ts imports this module
 * first — so values from `.env` are present before any module that reads process.env at import time
 * is evaluated. A statement in main.ts's body would run too late: ES imports are hoisted and the whole
 * module graph evaluates before the body.
 */
export function loadEnvironment(): void {
  const userEnvPath = path.resolve(process.cwd(), '.env');

  // A compose `- KEY=${KEY:-}` line forwards a real operator value into the container but renders an
  // empty value when none is set. An empty process.env.KEY would still block `.env` (loaded below
  // with override:false) from supplying one — so treat a blank value as unset for every
  // blank-forwarded key before loading the file.
  clearBlankEnv(process.env, BLANK_SHADOWED_ENV_KEYS);

  // User-managed .env (does not override real process env).
  if (fs.existsSync(userEnvPath)) {
    console.log('[Bootstrap] Loading .env from:', userEnvPath);
    dotenv.config({ path: userEnvPath, override: false });
  } else {
    console.log('[Bootstrap] No .env found at', userEnvPath, '— relying on process env only.');
  }
}

// Run immediately on import so process.env is populated before any other module is evaluated.
loadEnvironment();
