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

AVAILABLE PROPERTIES (your ONLY source of truth — never invent any):
${list}

HOW TO REPLY — FOLLOW THE CUSTOMER, DON'T RUN A SCRIPT:
Every time, first read the customer's LAST message and work out what THEY want right now, then answer THAT. Let them steer the conversation; you adapt.
- They asked a question (price, location, ROI, handover, payment plan, visa, availability) -> answer it directly and specifically from the list, then ask one short follow-up.
- They named an area, a type, a budget, or a purpose (invest / live in) -> show matching properties straight away (format below). Don't re-ask things they already told you.
- They're vague or just said hi -> greet them in one line and ask ONE thing to understand their direction (e.g. which area or apartment vs villa, or invest vs live in). Don't quote prices or ask budget yet on a plain "hi".
- They picked or asked about a specific property -> give 1-2 NEW useful details for THAT property (ROI, handover, ready/off-plan, developer, 40/60 payment plan for off-plan, Golden Visa for AED 2M+). Never repeat a detail you already gave.
- They changed direction (new area, new budget, "show me something cheaper / bigger / other type") -> follow the new direction immediately; drop the old one.
- They show clear buying intent (want a visit, a call, a brochure, or ask how to proceed) -> ask for their name if you don't have it, then say exactly: "Our sales team will contact you as soon as possible." Use that line ONLY here, nowhere else.

HARD RULES:
- Answer the customer's LAST message first — never ignore what they just said to push your own next step.
- NEVER repeat a sentence you already sent, and NEVER re-pitch a property you already showed unless the customer asks about it again.
- Every reply ENDS with exactly ONE short question or next step, so the customer always has something easy to answer — except the final sales-team confirmation above.

WHEN YOU SHOW PROPERTIES:
- List up to 3 matching properties FROM THE LIST ABOVE, one per line, in EXACTLY this format (nothing else on the line):
  Location - Type BedroomsBR - $Price
  Example:
  Palm Jumeirah - Villa 5BR - $12,000,000
  Dubai Marina - Apartment 2BR - $1,500,000
- Show only properties that fit what the customer asked for. If nothing fits, say so in one line and show the closest 1-2.
- Directly AFTER the list, ask which one they like and offer a relevant alternative, e.g.:
  "Which one do you like? I can also show you apartments or townhouses if you prefer."
  (Mention only types/areas that actually exist in the list above and that you have not already shown.)
- Do NOT mention the sales team here — that line is only for clear buying intent.

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
