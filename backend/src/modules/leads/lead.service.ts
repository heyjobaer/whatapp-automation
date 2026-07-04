import { Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/database.module';

export interface ChatLead {
  id: string;
  sessionId: string;
  chatId: string;
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
    let row = await this.knex<ChatLead>(TABLE).where({ sessionId, chatId }).first();
    if (!row) {
      [row] = await this.knex<ChatLead>(TABLE).insert({ sessionId, chatId }).returning('*');
    }
    return row;
  }

  async get(sessionId: string, chatId: string): Promise<ChatLead | undefined> {
    return this.knex<ChatLead>(TABLE).where({ sessionId, chatId }).first();
  }

  async listForSession(sessionId: string): Promise<ChatLead[]> {
    return this.knex<ChatLead>(TABLE).where({ sessionId }).orderBy('leadScore', 'desc');
  }

  /** Heuristic slot-filling from the customer's message text (mirrors the AI-automation extractor). */
  private extractInfo(userMessage: string): Partial<ChatLead> {
    const msg = userMessage.toLowerCase();
    const update: Partial<ChatLead> = {};

    if (msg.includes('300k') || msg.includes('under 300')) update.budget = 'Under $300K';
    else if (msg.includes('600k') || msg.includes('500k')) update.budget = '$300K-$600K';
    else if (msg.includes('1m') || msg.includes('million')) update.budget = '$600K-$1M';
    else if (msg.includes('above 1') || msg.includes('over 1m')) update.budget = 'Above $1M';

    if (msg.includes('invest')) update.purpose = 'Investment';
    else if (msg.includes('live') || msg.includes('family') || msg.includes('home')) update.purpose = 'Living';
    else if (msg.includes('both')) update.purpose = 'Both';

    if (msg.includes('villa')) update.propType = 'Villa';
    else if (msg.includes('apartment') || msg.includes('flat')) update.propType = 'Apartment';
    else if (msg.includes('penthouse')) update.propType = 'Penthouse';
    else if (msg.includes('townhouse')) update.propType = 'Townhouse';

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
  ): Promise<ChatLead> {
    const current = await this.getOrCreate(sessionId, chatId);
    const extracted = this.extractInfo(userMessage);

    const nameUpdate: Partial<ChatLead> = {};
    if (leadCaptured && !current.name) {
      const words = userMessage.trim().split(/\s+/);
      if (words.length >= 1 && words.length <= 3) nameUpdate.name = userMessage.trim();
    }

    const merged: Partial<ChatLead> = { ...current, ...extracted, ...nameUpdate };
    const [updated] = await this.knex<ChatLead>(TABLE)
      .where({ sessionId, chatId })
      .update({
        ...extracted,
        ...nameUpdate,
        language,
        isLead: leadCaptured || current.isLead,
        leadScore: this.calcScore(merged),
        updatedAt: this.knex.fn.now(),
      })
      .returning('*');

    return updated;
  }
}
