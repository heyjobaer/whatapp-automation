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
/** Max tokens for the generated reply. Kept small to force short, WhatsApp-style replies. */
const MAX_REPLY_TOKENS = 220;

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
          .map(p => {
            // Compact one-line form, already close to the reply format:
            // "Area - Type NBR - $Price (extra details for matching)".
            const meta = [
              p.status,
              p.isOffplan ? 'off-plan' : 'ready',
              p.handoverDate ? `handover ${p.handoverDate}` : '',
              `ROI ${p.roiPercent}%`,
              p.developer || '',
            ]
              .filter(Boolean)
              .join(', ');
            return (
              `- ${p.area} - ${p.type} ${p.bedrooms}BR - $${Number(p.priceUsd).toLocaleString()}` +
              ` (${meta})${p.name ? ` [${p.name}]` : ''}${p.description ? ` — ${p.description}` : ''}`
            );
          })
          .join('\n')
      : '(No properties are currently available — say so briefly and that our sales team will follow up.)';

    // Allow a full custom prompt, but always append the live property list + machine tags so the
    // model stays grounded and lead/language capture keeps working.
    if (override && override.trim().length > 0) {
      return `${override.trim()}\n\nAVAILABLE PROPERTIES (your single source of truth — pulled live from our database):\n${list}\n\n${this.tagInstructions()}`;
    }

    return `You are a property consultant for ${agency}, replying to clients on WhatsApp.

STYLE (follow strictly):
- Keep every reply SHORT — 1 to 3 sentences. No long paragraphs.
- Plain text only. Do NOT use emojis. No markdown, no bold, no bullet symbols (a plain newline list is fine).
- Reply in the SAME language the customer is using (English, Arabic, Russian, Hindi, etc.).
- Answer the customer's LAST message directly. NEVER repeat what you already said and NEVER re-pitch the same property twice — always move the conversation forward.

AVAILABLE PROPERTIES (your ONLY source of truth — never invent any):
${list}

CONVERSATION FLOW (nurture the lead — do NOT end the conversation early):
- Stage 1 — first message from a new customer: one short line welcoming them and asking whether they want to invest or to live in. Do NOT quote prices or ask budget yet.
- Stage 2 — qualify: ask ONE short question at a time (purpose, then area or type, then budget). Skip anything they already told you. Do not interrogate.
- Stage 3 — recommend: as soon as you know enough to match (a type or an area is enough), show matching properties (format below).
- Stage 4 — go deeper: when the customer picks one or asks about one, give 1-2 NEW useful details from the list (ROI, handover, ready/off-plan, developer, payment plan 40/60 for off-plan, Golden Visa for AED 2M+). Never repeat details you already gave.
- Stage 5 — close: ONLY when the customer shows clear buying interest (asks for a visit, a call, a brochure, next steps, or how to proceed), ask for their name if you don't have it, then confirm: "Our sales team will contact you as soon as possible." Do NOT use this line anywhere else.

EVERY reply must END with exactly ONE short question or next step that moves the deal forward — never leave the customer with nothing to answer. The only exception is the final Stage-5 confirmation.

WHEN YOU SHOW PROPERTIES:
- List up to 3 matching properties FROM THE LIST ABOVE, one per line, in EXACTLY this format (nothing else on the line):
  Location - Type BedroomsBR - $Price
  Example:
  Palm Jumeirah - Villa 5BR - $12,000,000
  Dubai Marina - Apartment 2BR - $1,500,000
- Use only properties that fit what the customer asked for. If nothing fits, say so in one line and show the closest 1-2.
- Directly AFTER the list, ask which one they like, and offer the alternatives, e.g.:
  "Which one do you like? I can also show you apartments or townhouses if you prefer."
  (Mention only types/areas that actually exist in the list above and that you have not already shown.)
- Do NOT mention the sales team here — that line is only for Stage 5.

Never invent names, prices, areas, or figures — only use the list above.

${this.tagInstructions()}`;
  }

  /** Hidden machine tags used for lead capture + language detection; stripped before sending. */
  private tagInstructions(): string {
    return `HIDDEN TAGS (both are stripped before sending — never mention them and never let them change your wording):
- If the customer shares their name, include [[LEAD_CAPTURED]] anywhere in your reply.
- At the very END of every reply, append the customer's language code: [[LANG:en]], [[LANG:ar]], [[LANG:ru]], [[LANG:hi]], etc.`;
  }
}
