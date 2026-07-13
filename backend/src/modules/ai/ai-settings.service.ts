import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/database.module';
import { createLogger } from '../shared/logger.service';

export interface AiSettings {
  id: string;
  provider: string;
  apiKey: string | null;
  model: string;
  autoReplyEnabled: boolean;
  replyDelayMinMs: number;
  replyDelayMaxMs: number;
  agencyName: string | null;
  assistantName: string | null;
  systemPrompt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields an admin may change via the settings page. */
export type AiSettingsUpdate = Partial<
  Pick<
    AiSettings,
    | 'provider'
    | 'apiKey'
    | 'model'
    | 'autoReplyEnabled'
    | 'replyDelayMinMs'
    | 'replyDelayMaxMs'
    | 'agencyName'
    | 'assistantName'
    | 'systemPrompt'
  >
>;

const TABLE = 'ai_settings';

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Single-row AI configuration store. The first read seeds the row from env (so an existing .env
 * migrates in), after which the DB row is the runtime source of truth. Cached in memory and
 * invalidated on update so the message hot-path doesn't hit the DB on every reply.
 */
@Injectable()
export class AiSettingsService {
  private readonly logger = createLogger('AiSettingsService');
  private cache: AiSettings | null = null;

  constructor(@Inject(KNEX_CONNECTION) private readonly knex: Knex) {}

  private seedFromEnv(): Omit<AiSettings, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      provider: (process.env.AI || 'groq').toLowerCase(),
      apiKey: process.env.GROQ_API_KEY?.trim() || null,
      model: process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile',
      autoReplyEnabled: process.env.AI_AUTO_REPLY !== 'false',
      replyDelayMinMs: num(process.env.AI_REPLY_DELAY_MIN_MS, 20000),
      replyDelayMaxMs: num(process.env.AI_REPLY_DELAY_MAX_MS, 30000),
      agencyName: process.env.AGENCY_NAME?.trim() || null,
      assistantName: process.env.ASSISTANT_NAME?.trim() || null,
      systemPrompt: process.env.AI_SYSTEM_PROMPT?.trim() || null,
    };
  }

  /** Current settings (cached). Creates the row seeded from env on first use. */
  async get(): Promise<AiSettings> {
    if (this.cache) return this.cache;
    let row = await this.knex<AiSettings>(TABLE).orderBy('createdAt', 'asc').first();
    console.log('row', row);
    if (!row) {
      [row] = await this.knex<AiSettings>(TABLE).insert(this.seedFromEnv()).returning('*');
      this.logger.log('Seeded ai_settings from environment');
    }
    this.cache = row;
    return row;
  }

  async update(patch: AiSettingsUpdate): Promise<AiSettings> {
    const current = await this.get();
    // Clamp the delay window so min never exceeds max.
    const next: AiSettingsUpdate = { ...patch };
    if (next.replyDelayMinMs !== undefined && next.replyDelayMinMs < 0) next.replyDelayMinMs = 0;
    if (
      next.replyDelayMaxMs !== undefined &&
      next.replyDelayMaxMs < (next.replyDelayMinMs ?? current.replyDelayMinMs)
    ) {
      next.replyDelayMaxMs = next.replyDelayMinMs ?? current.replyDelayMinMs;
    }

    const [row] = await this.knex<AiSettings>(TABLE)
      .where({ id: current.id })
      .update({ ...next, updatedAt: this.knex.fn.now() })
      .returning('*');
    this.cache = row;
    this.logger.log('AI settings updated', { keys: Object.keys(patch) });
    return row;
  }
}
