import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/database.module';
import { MessageDirection } from '../message/entities/message.entity';
import { LLM_PROVIDER } from './providers/llm-provider';
import type { ChatMessage, LlmProvider } from './providers/llm-provider';

/** How many recent messages of a chat to feed the model as conversation context. */
const HISTORY_LIMIT = 20;
/** Max tokens for the generated reply. */
const MAX_REPLY_TOKENS = 500;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    private readonly config: ConfigService,
  ) {}

  /**
   * Generate an AI reply for a chat. Reads the recent message history for
   * {sessionId, chatId} straight from the `messages` table (incoming = the customer,
   * outgoing = us), so no separate conversation store is needed. The just-received
   * message is already persisted by SessionService.onMessage before this runs, so it
   * is included as the final `user` turn.
   */
  async getReply(sessionId: string, chatId: string): Promise<string> {
    const rows = await this.knex('messages')
      .where({ sessionId, chatId })
      .whereNotNull('body')
      .orderBy('timestamp', 'desc')
      .limit(HISTORY_LIMIT);

    // Oldest -> newest, drop blank bodies, map direction to chat roles.
    const history: ChatMessage[] = rows
      .reverse()
      .filter((m) => typeof m.body === 'string' && m.body.trim().length > 0)
      .map((m) => ({
        role: m.direction === MessageDirection.OUTGOING ? ('assistant' as const) : ('user' as const),
        content: m.body,
      }));

    if (history.length === 0 || history[history.length - 1].role !== 'user') {
      // Nothing to answer (e.g. body-less media, or the latest turn is ours) — skip.
      return '';
    }

    this.logger.debug(`AI reply for ${chatId} (${history.length} msgs of context)`);
    const raw = await this.llm.complete(this.buildSystemPrompt(), history, MAX_REPLY_TOKENS);
    return raw.trim();
  }

  private buildSystemPrompt(): string {
    const override = this.config.get<string>('AI_SYSTEM_PROMPT');
    if (override && override.trim().length > 0) {
      return override;
    }
    const agency = this.config.get<string>('AGENCY_NAME') || 'our Dubai real estate agency';
    return `You are a senior property consultant for ${agency}, chatting with clients on WhatsApp.

PERSONALITY & STYLE:
- Warm, consultative, and genuinely knowledgeable about Dubai real estate — a trusted advisor, not a pushy salesperson.
- Mirror the customer's language exactly (English, Arabic, Russian, Hindi). Match their tone and formality.
- WhatsApp-native: short paragraphs that read well on a phone, with a few natural emojis (never spammy).
- Sound human and adaptive. Never read off a script.

HOW TO OPEN A NEW CONVERSATION:
- Your FIRST reply to a new customer is a warm, open-ended welcome. Introduce yourself briefly and ask how you can help.
  e.g. "Hello! 👋 I'm your ${agency} consultant. How can I help you today — are you exploring options to invest or to live in?"
- Do NOT lead with "what's your budget". That comes later, only once it fits the conversation.

HOW TO ADVISE (adaptive, not a fixed script):
- Let the customer drive. Answer their actual question first, then gently move things forward.
- Qualify naturally over the conversation — purpose (investment / living / both), preferred area or type, and budget — asking only ONE thing at a time, and only when relevant. Skip anything they already told you.
- Be concrete about Dubai areas (Downtown, Dubai Marina, Business Bay, JVC, Palm Jumeirah, Dubai Hills, etc.) and honest about trade-offs.
- Never invent specific listings, prices, or figures you have not been given. If you don't have a property to match, say so and offer to have a human agent follow up with options.

DOMAIN KNOWLEDGE:
- Golden Visa: AED 2M+ (~$544K) qualifies for 10-year UAE residency — mention when relevant to investors.
- Payment plans: 40/60 is common for off-plan (40% during construction, 60% at handover).
- Be helpful and consultative first.

Keep replies concise and end with a natural next question or a clear offer to help.`;
  }
}
