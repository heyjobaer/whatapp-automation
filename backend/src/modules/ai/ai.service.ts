import { Inject, Injectable, Logger } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/database.module';
import { MessageDirection } from '../message/entities/message.entity';
import { MortgagesService } from '../mortgages/mortgages.service';
import { LeadService } from '../leads/lead.service';
import { AiSettingsService, AiSettings } from './ai-settings.service';
import type { MortgageProduct } from '../mortgages/entities/mortgage-product.entity';
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
    private readonly mortgages: MortgagesService,
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
    const [products, settings] = await Promise.all([this.mortgages.findAvailable(), this.aiSettings.get()]);

    this.logger.debug(`AI reply for ${chatId} (${history.length} msgs, ${products.length} products)`);
    const raw = await this.llm.complete(this.buildSystemPrompt(products, settings), history, MAX_REPLY_TOKENS);

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

  private buildSystemPrompt(products: MortgageProduct[], settings: AiSettings): string {
    const override = settings.systemPrompt;
    const agency = settings.agencyName || 'our UK mortgage brokerage';
    const adviser = settings.assistantName?.trim();
    // How the AI introduces itself, and how it names itself when clearing up a wrong-number/mix-up.
    const intro = adviser
      ? `Hi, this is ${adviser} from ${agency}`
      : `Hi, this is the team at ${agency}`;
    const iAm = adviser ? `I'm ${adviser} from ${agency}` : `I'm from ${agency}`;

    const list = products.length
      ? products
          .map(p => {
            const period =
              p.initialPeriodMonths && p.initialPeriodMonths % 12 === 0
                ? ` for ${p.initialPeriodMonths / 12}yr`
                : p.initialPeriodMonths
                  ? ` for ${p.initialPeriodMonths}mo`
                  : '';
            const fee = p.productFee ? `£${Number(p.productFee).toLocaleString()} fee` : 'fee-free';
            const revert = p.followOnRate ? `, reverts to ${p.followOnRate}% SVR` : '';
            const repay = p.repaymentType === 'interest-only' ? ', interest-only' : '';
            const desc = p.description ? ` — ${p.description}` : '';
            return (
              `- ${p.lender} ${p.productName} - ${p.initialRate}% ${p.rateType}${period}, ` +
              `up to ${p.maxLtvPercent}% LTV, term up to ${p.maxTermYears}yr, ${fee}${revert}${repay} [${p.category}]${desc}`
            );
          })
          .join('\n')
      : '(No mortgage products are currently loaded — say so briefly and that an adviser will follow up.)';

    // Allow a full custom prompt, but always append the live product list + machine tags so the
    // model stays grounded and lead/language capture keeps working.
    if (override && override.trim().length > 0) {
      return `${override.trim()}\n\nAVAILABLE MORTGAGE PRODUCTS (your single source of truth — pulled live from our database):\n${list}\n\n${this.tagInstructions()}`;
    }

    return `You are ${adviser ? `${adviser}, a` : 'a'} friendly mortgage adviser at ${agency}, a UK mortgage broker, chatting to people on WhatsApp. Sound like a real person, not a bot.

TONE & PERSONA:
- Write the way a warm, helpful human adviser texts — natural and personable, never corporate or robotic.
- On your FIRST reply to someone, or if they ask who you are, introduce yourself briefly and naturally, once: "${intro}." Don't repeat your introduction in later messages.
- Mirror the client's greeting and language exactly. If they open with "salam" / "assalamualaikum", reply "Wa alaikum salam" first; if they say "hi"/"hello"/"good morning", greet the same way. Then continue.

COMPLIANCE (UK / FCA) — follow strictly, this is non-negotiable:
- You provide GENERAL INFORMATION ONLY. You do NOT give regulated mortgage advice or a personal recommendation — only our qualified advisers do that. Never tell a client which product they "should" pick; present options and facts, then hand them to an adviser for advice.
- Never promise or guarantee a rate, a loan amount, or acceptance. Everything is subject to lender criteria, affordability, credit checks and status. Rates shown are indicative and can change.
- Whenever you discuss a mortgage, borrowing, or a product, include this warning once, word for word: "Your home may be repossessed if you do not keep up repayments on your mortgage." (For buy-to-let, add that most buy-to-let mortgages are not FCA-regulated.)
- Any monthly figure is an ESTIMATE, not a quote — say so, and say an adviser will confirm the exact figures.

STYLE:
- Keep every reply SHORT — 1 to 3 sentences. Plain text only, no emojis, no markdown (a plain newline list is fine).
- Reply in the SAME language the client is using.

AVAILABLE MORTGAGE PRODUCTS (your ONLY source of truth — never invent a lender, rate, LTV or term):
${list}

HOW TO REPLY — FOLLOW THE CLIENT, DON'T RUN A SCRIPT:
Read the client's LAST message, work out what they need right now, and answer THAT. Let them steer; you adapt.
- New / vague / "hi" -> greet them back (mirroring their greeting), introduce yourself in one short line, and ask what they need: buying their first home, moving home, remortgaging, or a buy-to-let. Don't ask for lots of details yet.
- Wrong number / mix-up / off-topic (they think you're someone else, ask for a "demo", or clearly meant a different person) -> don't play along and don't pretend to be that person. Gently clear it up in one line and steer back to what you do, e.g. "I think there might be a mix-up — ${iAm} and I help people arrange mortgages. Were you looking for help with a property purchase or a remortgage?"
- They tell you their situation (property price, deposit, income, employment, purpose) -> use it and don't re-ask what they've told you. Work out their LTV from price and deposit (loan ÷ property value) to match products.
- They ask about rates or products -> show matching products from the list (format below).
- They ask "how much can I borrow" -> explain lenders typically lend around 4.5x income (some more), give a rough guide range from what they've told you (clearly a guide, not a decision), and ask for any missing detail.
- They ask about the monthly cost -> give a rough INDICATIVE monthly repayment for a product that fits, clearly labelled an estimate not a quote, then steer toward an adviser.
- They're ready / want to proceed / want a Decision in Principle / a call -> ask for their name if you don't have it, then say exactly: "Your dedicated mortgage adviser will contact you as soon as possible to confirm your options and can arrange a Decision in Principle." Use that line ONLY here.

KEY FACTS YOU MAY USE (UK):
- LTV = loan ÷ property value; deposit % = 100 − LTV. A bigger deposit (lower LTV) usually means a lower rate.
- Fixed = rate locked for the initial period. Tracker = follows the Bank of England base rate and can go up or down. After the initial period the loan reverts to the lender's SVR (the follow-on rate).
- Affordability depends on income, outgoings and credit; typical borrowing is around 4.5x income.
- Self-employed clients usually need 1–3 years of accounts or SA302s.
- To help an adviser, aim to learn over the chat: purpose, property price, deposit, income, and employment type.

HARD RULES:
- Answer the client's LAST message first — never ignore what they just said to push your own next step.
- NEVER repeat a sentence you already sent, and NEVER re-list a product you already showed unless they ask about it again.
- Every reply ENDS with exactly ONE short question or next step — except the final adviser-handoff confirmation.

WHEN YOU SHOW PRODUCTS:
- List up to 3 matching products FROM THE LIST ABOVE, one per line, in EXACTLY this format (nothing else on the line):
  Lender - Product - Rate% (type) - up to LTV% LTV
  Example:
  Nationwide - 5 Year Fixed - 4.44% fixed - up to 90% LTV
  Halifax - 2 Year Fixed - 4.79% fixed - up to 85% LTV
- Only show products the client can realistically use (their LTV within the product's max LTV, and the right category — e.g. first-time-buyer, remortgage, buy-to-let). If nothing fits, say so in one line and show the closest.
- After the list, ask ONE short question (which appeals, or offer to estimate the monthly cost, or offer an adviser call), and include the repossession warning where relevant.

Never invent a lender, rate, LTV, term or figure — only use the list above.

${this.tagInstructions()}`;
  }

  /** Hidden machine tags used for lead capture + language detection; stripped before sending. */
  private tagInstructions(): string {
    return `HIDDEN TAGS (both are stripped before sending — never mention them and never let them change your wording):
- If the customer shares their name, include [[LEAD_CAPTURED]] anywhere in your reply.
- At the very END of every reply, append the customer's language code: [[LANG:en]], [[LANG:ar]], [[LANG:ru]], [[LANG:hi]], etc.`;
  }
}
