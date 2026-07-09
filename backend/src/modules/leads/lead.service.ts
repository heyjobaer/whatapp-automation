import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/database.module';

export interface ChatLead {
  id: string;
  sessionId: string;
  chatId: string;
  phone: string | null;
  name: string | null;
  language: string;
  budget: string | null;
  purpose: string | null;
  propType: string | null;
  isLead: boolean;
  leadScore: number;
  createdAt: string;
  updatedAt: string;
}

const TABLE = 'chat_leads';

/**
 * Per-chat lead qualification (port of the AI-automation ConversationsService scoring). The AI
 * calls updateAfterMessage() after each auto-reply; the dashboard reads listForSession() to show a
 * Hot/Warm/Cold badge. Score model: base 10 + budget 25 + type 15 + purpose 20 + name 30 (cap 100),
 * so a named, fully-qualified lead lands at 100 and "hot" (>= 70) means most signals are present.
 */
@Injectable()
export class LeadService {
  constructor(@Inject(KNEX_CONNECTION) private readonly knex: Knex) {}

  async getOrCreate(sessionId: string, chatId: string): Promise<ChatLead> {
    const existing = await this.knex<ChatLead>(TABLE).where({ sessionId, chatId }).first();
    if (existing) return existing;
    // Race-safe insert: two near-simultaneous first messages for the same chat must not throw on
    // the UNIQUE(sessionId, chatId) constraint. onConflict().ignore() returns [] for the loser,
    // which then re-selects the row the winner created.
    const [row] = await this.knex<ChatLead>(TABLE)
      .insert({ sessionId, chatId })
      .onConflict(['sessionId', 'chatId'])
      .ignore()
      .returning('*');
    if (row) return row;
    return (await this.knex<ChatLead>(TABLE).where({ sessionId, chatId }).first()) as ChatLead;
  }

  async get(sessionId: string, chatId: string): Promise<ChatLead | undefined> {
    return this.knex<ChatLead>(TABLE).where({ sessionId, chatId }).first();
  }

  async listForSession(sessionId: string): Promise<ChatLead[]> {
    return this.knex<ChatLead>(TABLE).where({ sessionId }).orderBy('leadScore', 'desc');
  }

  /**
   * Heuristic slot-filling from the client's message text (UK mortgage signals). The three
   * qualification columns are reused for mortgage data:
   *  - `budget`   -> property value / deposit band
   *  - `purpose`  -> what they need (First-time buyer / Home mover / Remortgage / Buy-to-let)
   *  - `propType` -> employment type (Employed / Self-employed), a key affordability signal
   */
  private extractInfo(userMessage: string): Partial<ChatLead> {
    const msg = userMessage.toLowerCase();
    const update: Partial<ChatLead> = {};

    // Property value / borrowing size band (rough — a £ figure or a "k"/"m" amount).
    const money = msg.match(/£?\s?(\d[\d,]*)\s?(k|m|,000)?/);
    if (msg.includes('deposit')) update.budget = 'Deposit discussed';
    if (money) {
      const n = Number(money[1].replace(/,/g, ''));
      const unit = money[2];
      const value = unit === 'm' ? n * 1_000_000 : unit === 'k' ? n * 1_000 : n;
      if (value >= 1000) {
        if (value < 250_000) update.budget = 'Under £250k';
        else if (value < 500_000) update.budget = '£250k–£500k';
        else if (value < 1_000_000) update.budget = '£500k–£1m';
        else update.budget = 'Over £1m';
      }
    }

    if (msg.includes('first time') || msg.includes('first-time') || msg.includes('ftb') || msg.includes('first home'))
      update.purpose = 'First-time buyer';
    else if (msg.includes('remortgage') || msg.includes('switch') || msg.includes('deal ending') || msg.includes('renew'))
      update.purpose = 'Remortgage';
    else if (msg.includes('buy to let') || msg.includes('buy-to-let') || msg.includes('btl') || msg.includes('landlord') || msg.includes('rent it out'))
      update.purpose = 'Buy-to-let';
    else if (msg.includes('moving') || msg.includes('move home') || msg.includes('next home') || msg.includes('new house'))
      update.purpose = 'Home mover';

    if (msg.includes('self employed') || msg.includes('self-employed') || msg.includes('sole trader') || msg.includes('contractor') || msg.includes('freelance') || msg.includes('company director'))
      update.propType = 'Self-employed';
    else if (msg.includes('employed') || msg.includes('salary') || msg.includes('payslip') || msg.includes('full time') || msg.includes('full-time') || msg.includes('permanent job'))
      update.propType = 'Employed';

    return update;
  }

  private calcScore(lead: Partial<ChatLead>): number {
    let score = 10;
    if (lead.budget) score += 25;
    if (lead.propType) score += 15;
    if (lead.purpose) score += 20;
    if (lead.name) score += 30;
    return Math.min(score, 100);
  }

  /**
   * Recompute + persist a chat's lead state after a turn. `leadCaptured` comes from the model's
   * [[LEAD_CAPTURED]] tag (fired when the customer shares their name); `language` from [[LANG:xx]].
   */
  async updateAfterMessage(
    sessionId: string,
    chatId: string,
    userMessage: string,
    leadCaptured: boolean,
    language = 'en',
    phone?: string | null,
  ): Promise<ChatLead> {
    const current = await this.getOrCreate(sessionId, chatId);
    const extracted = this.extractInfo(userMessage);

    const nameUpdate: Partial<ChatLead> = {};
    if (leadCaptured && !current.name) {
      const words = userMessage.trim().split(/\s+/);
      if (words.length >= 1 && words.length <= 3) nameUpdate.name = userMessage.trim();
    }

    // Only set the phone once (don't overwrite a good value with a later null resolution).
    const phoneUpdate: Partial<ChatLead> = phone && !current.phone ? { phone } : {};

    const merged: Partial<ChatLead> = { ...current, ...extracted, ...nameUpdate };
    const [updated] = await this.knex<ChatLead>(TABLE)
      .where({ sessionId, chatId })
      .update({
        ...extracted,
        ...nameUpdate,
        ...phoneUpdate,
        language,
        isLead: leadCaptured || current.isLead,
        leadScore: this.calcScore(merged),
        updatedAt: this.knex.fn.now(),
      })
      .returning('*');

    return updated;
  }
}
