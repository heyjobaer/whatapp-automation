import { Inject, Injectable, Logger } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/database.module';
import { MessageDirection } from '../message/entities/message.entity';
import { PropertiesService } from '../properties/properties.service';
import { LeadService } from '../leads/lead.service';
import { AiSettingsService, AiSettings } from './ai-settings.service';
import type { Property } from '../properties/entities/property.entity';
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
    private readonly aiSettings: AiSettingsService,
    private readonly properties: PropertiesService,
    private readonly leads: LeadService,
  ) {}

  /**
   * Generate an AI reply for a chat, grounded in the live property list. Reads recent history for
   * {sessionId, chatId} from the `messages` table (incoming = the customer, outgoing = us), so no
   * separate conversation store is needed. The just-received message is already persisted by
   * SessionService.onMessage before this runs, so it is the final `user` turn.
   *
   * Side effect: after producing a reply it recomputes the chat's lead score (Hot/Warm/Cold).
   */
  async getReply(sessionId: string, chatId: string, phone?: string | null): Promise<string> {
    const rows = await this.knex('messages')
      .where({ sessionId, chatId })
      .whereNotNull('body')
      .orderBy('timestamp', 'desc')
      .limit(HISTORY_LIMIT);

    // Oldest -> newest, drop blank bodies, map direction to chat roles.
    const history: ChatMessage[] = rows
      .reverse()
      .filter(m => typeof m.body === 'string' && m.body.trim().length > 0)
      .map(m => ({
        role: m.direction === MessageDirection.OUTGOING ? ('assistant' as const) : ('user' as const),
        content: m.body,
      }));

    if (history.length === 0 || history[history.length - 1].role !== 'user') {
      // Nothing to answer (e.g. body-less media, or the latest turn is ours) — skip.
      return '';
    }

    const userMessage = history[history.length - 1].content;
    const [properties, settings] = await Promise.all([this.properties.findAvailable(), this.aiSettings.get()]);

    this.logger.debug(`AI reply for ${chatId} (${history.length} msgs, ${properties.length} properties)`);
    const raw = await this.llm.complete(this.buildSystemPrompt(properties, settings), history, MAX_REPLY_TOKENS);

    // The model marks a captured lead + the customer's language via hidden tags; parse then strip
    // them so the customer never sees them.
    const leadCaptured = raw.includes('[[LEAD_CAPTURED]]');
    const langMatch = raw.match(/\[\[LANG:([a-z]{2})\]\]/i);
    const language = langMatch ? langMatch[1].toLowerCase() : 'en';
    const reply = raw
      .replace('[[LEAD_CAPTURED]]', '')
      .replace(/\[\[LANG:[a-z]{2}\]\]/i, '')
      .trim();

    // Update the Hot/Warm/Cold lead state for this chat (best-effort; never block the reply).
    try {
      await this.leads.updateAfterMessage(sessionId, chatId, userMessage, leadCaptured, language, phone);
    } catch (err) {
      this.logger.error(`Lead update failed for ${sessionId} chat ${chatId}`, String(err));
    }

    return reply;
  }

  private buildSystemPrompt(properties: Property[], settings: AiSettings): string {
    const override = settings.systemPrompt;
    const agency = settings.agencyName || 'our Dubai real estate agency';

    const list = properties.length
      ? properties
          .map((p, i) => {
            const lines = [
              `${i + 1}. ${p.name} — ${p.area}`,
              `   Type: ${p.type}${p.bedrooms ? ` · ${p.bedrooms} BR` : ''}${p.isOffplan ? ' · Off-plan' : ' · Ready'}`,
              `   Price: $${Number(p.priceUsd).toLocaleString()}` +
                (p.priceAed ? ` (AED ${Number(p.priceAed).toLocaleString()})` : '') +
                ` · ROI: ${p.roiPercent}%` +
                (p.handoverDate ? ` · Handover: ${p.handoverDate}` : ''),
              p.developer ? `   Developer: ${p.developer}` : '',
            ].filter(Boolean);
            if (p.description) lines.push(`   Notes: ${p.description}`);
            if (p.brochureUrl) lines.push(`   Brochure available on request.`);
            return lines.join('\n');
          })
          .join('\n\n')
      : '(No properties are currently available — apologise briefly and offer to have an agent follow up with options.)';

    // Allow a full custom prompt, but always append the live property list + machine tags so the
    // model stays grounded and lead/language capture keeps working.
    if (override && override.trim().length > 0) {
      return `${override.trim()}\n\nAVAILABLE PROPERTIES (your single source of truth — pulled live from our database):\n${list}\n\n${this.tagInstructions()}`;
    }

    return `You are a senior property consultant for ${agency}, chatting with clients on WhatsApp.

PERSONALITY & STYLE:
- Warm, consultative, and genuinely knowledgeable about Dubai real estate — a trusted advisor, not a pushy salesperson.
- Mirror the customer's language exactly (English, Arabic, Russian, Hindi). Match their tone and formality.
- WhatsApp-native: short paragraphs that read well on a phone, with a few natural emojis (never spammy).
- Sound human and adaptive. Never read off a script.

AVAILABLE PROPERTIES (your single source of truth — pulled live from our database):
${list}

HOW TO OPEN A NEW CONVERSATION:
- Your FIRST reply to a new customer is a warm, open-ended welcome. Introduce yourself briefly and ask how you can help.
  e.g. "Hello! 👋 I'm your ${agency} consultant. How can I help you today — are you exploring options to invest or to live in?"
- Do NOT lead with "what's your budget" and do NOT quote prices in the first reply. Those come later, only once they fit the conversation.

HOW TO ADVISE (adaptive, not a fixed script):
- Let the customer drive. Answer their actual question first, then gently move things forward.
- Qualify naturally over the conversation — purpose (investment / living / both), preferred area or type, and budget — asking only ONE thing at a time, and only when relevant. Skip anything they already told you.
- When you have enough to suggest, recommend 2–3 best-fit properties FROM THE LIST ABOVE. For each give: name, area, price (USD, add AED if useful), ROI, handover, and one compelling reason it fits THEM.
- If a customer asks about a specific property, answer in depth using its details above. Offer the brochure if one is available.
- ONLY ever reference properties from the list above. Never invent names, prices, or figures. If nothing fits, say so honestly and suggest the closest alternatives or offer a human agent follow-up.

DOMAIN KNOWLEDGE:
- Golden Visa: AED 2M+ (~$544K) qualifies for 10-year UAE residency — mention when relevant to investors.
- Payment plans: 40/60 is common for off-plan (40% during construction, 60% at handover).
- Be helpful and consultative first.

${this.tagInstructions()}`;
  }

  /** Hidden machine tags used for lead capture + language detection; stripped before sending. */
  private tagInstructions(): string {
    return `LEAD CAPTURE: When the conversation is warm, offer to send brochures/details and ask for the customer's name. The moment they share their name, include [[LEAD_CAPTURED]] anywhere in your response.

LANGUAGE TAG: at the very end of EVERY response, append a hidden two-letter language code for the language the CUSTOMER is writing in — [[LANG:en]], [[LANG:ar]], [[LANG:ru]], [[LANG:hi]], etc. Both tags are stripped before sending — never mention them.`;
  }
}
