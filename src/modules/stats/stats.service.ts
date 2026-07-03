import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../../database/database.module';
import { Session, SessionStatus } from '../session/entities/session.entity';
import { MessageStatus } from '../message/entities/message.entity';
import { CacheService } from '../../common/cache';

/**
 * SQL for the time-series timestamp bucket, per DB dialect. SQLite has strftime(); Postgres has
 * neither strftime nor a case-insensitive bare `m.createdAt` (unquoted it folds to lowercase and
 * misses the quoted "createdAt" column) — so it needs to_char() with a quoted column. The hour
 * format yields an identical zero-padded, chronologically-sortable label on both engines, so the
 * GROUP BY/ORDER BY on the alias and the downstream map() are unchanged.
 */
export function timeSeriesTimestampSql(dbType: string, interval: 'hour' | 'day'): string {
  if (dbType === 'postgres') {
    const fmt = interval === 'hour' ? 'YYYY-MM-DD HH24:00:00' : 'YYYY-MM-DD';
    return `to_char(m."createdAt", '${fmt}')`;
  }
  const fmt = interval === 'hour' ? '%Y-%m-%d %H:00:00' : '%Y-%m-%d';
  return `strftime('${fmt}', m.createdAt)`;
}

/** SQL for the integer hour-of-day (0-23) bucket, per DB dialect. */
export function hourBucketSql(dbType: string): string {
  return dbType === 'postgres'
    ? `CAST(EXTRACT(HOUR FROM m."createdAt") AS INTEGER)`
    : `CAST(strftime('%H', m.createdAt) AS INTEGER)`;
}

/**
 * SQL for the most-recent-activity timestamp (MAX of createdAt) as an identical text format on both
 * engines. SQLite's MAX over a `datetime` column returns the stored text; Postgres returns a timestamp
 * the driver hydrates to a JS Date (serialized to a different ISO string). to_char/strftime pin both
 * to `YYYY-MM-DD HH:MM:SS`, matching the format the time-series buckets already use, so the lastActive
 * field is stable regardless of the backing database.
 */
export function maxCreatedAtSql(dbType: string): string {
  return dbType === 'postgres'
    ? `to_char(MAX(m."createdAt"), 'YYYY-MM-DD HH24:MI:SS')`
    : `strftime('%Y-%m-%d %H:%M:%S', MAX(m.createdAt))`;
}

export interface OverviewStats {
  sessions: {
    active: number;
    total: number;
    byStatus: Record<string, number>;
  };
  messages: {
    sent: number;
    received: number;
    failed: number;
    today: { sent: number; received: number };
  };
}

export interface TimeSeriesPoint {
  timestamp: string;
  sent: number;
  received: number;
}

export interface MessageStats {
  timeSeries: TimeSeriesPoint[];
  byType: Record<string, number>;
  bySession: Array<{ sessionId: string; name: string; sent: number; received: number }>;
  topChats: Array<{ chatId: string; messageCount: number }>;
}

export interface SessionStats {
  session: { id: string; name: string; status: string };
  messages: { sent: number; received: number; today: number; failed: number };
  topChats: Array<{ chatId: string; count: number; lastActive: string }>;
  hourlyActivity: Array<{ hour: number; sent: number; received: number }>;
}

@Injectable()
export class StatsService {
  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    private readonly cacheService: CacheService,
  ) {}

  /** Single database is always PostgreSQL now; kept as a field so the portable date SQL helpers work. */
  private readonly dataDbType = 'postgres';

  async getOverview(): Promise<OverviewStats> {
    // Get session stats
    const sessions = (await this.knex('sessions').select('*')) as Session[];
    const byStatus: Record<string, number> = {};
    let active = 0;

    for (const session of sessions) {
      byStatus[session.status] = (byStatus[session.status] || 0) + 1;
      if (session.status === SessionStatus.READY) active++;
    }

    // Get message stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const messageStats = (await this.knex('messages as m')
      .select('m.direction as direction')
      .count('* as count')
      .groupBy('m.direction')) as Array<{ direction: string; count: string }>;

    const todayStats = (await this.knex('messages as m')
      .select('m.direction as direction')
      .count('* as count')
      .where('m.createdAt', '>=', todayStart)
      .groupBy('m.direction')) as Array<{ direction: string; count: string }>;

    const sent = parseInt(messageStats.find(m => m.direction === 'outgoing')?.count || '0');
    const received = parseInt(messageStats.find(m => m.direction === 'incoming')?.count || '0');
    const todaySent = parseInt(todayStats.find(m => m.direction === 'outgoing')?.count || '0');
    const todayReceived = parseInt(todayStats.find(m => m.direction === 'incoming')?.count || '0');

    // Count failed messages
    const failed = Number(
      (await this.knex('messages').where({ status: MessageStatus.FAILED }).count<{ count: string }[]>('* as count'))[0]
        .count,
    );

    // Cache session stats
    await this.cacheService.setSessionsStats({
      active,
      total: sessions.length,
      byStatus,
    });

    return {
      sessions: {
        active,
        total: sessions.length,
        byStatus,
      },
      messages: {
        sent,
        received,
        failed,
        today: { sent: todaySent, received: todayReceived },
      },
    };
  }

  async getMessageStats(period: '24h' | '7d' | '30d'): Promise<MessageStats> {
    const since = this.getPeriodStart(period);
    const interval = period === '24h' ? 'hour' : 'day';

    // Time series - using raw query for SQLite compatibility
    const timeSeries = await this.getTimeSeries(since, interval);

    // By type
    const byTypeRaw = (await this.knex('messages as m')
      .select('m.type as type')
      .count('* as count')
      .where('m.createdAt', '>=', since)
      .groupBy('m.type')) as Array<{ type: string; count: string }>;

    const byType: Record<string, number> = {};
    for (const row of byTypeRaw) {
      byType[row.type || 'unknown'] = parseInt(row.count);
    }

    // By session
    const bySessionRaw = (await this.knex('messages as m')
      .select('m.sessionId as sessionId')
      .select('m.direction as direction')
      .count('* as count')
      .where('m.createdAt', '>=', since)
      .groupBy('m.sessionId', 'm.direction')) as Array<{ sessionId: string; direction: string; count: string }>;

    const sessionMap = new Map<string, { sent: number; received: number }>();
    for (const row of bySessionRaw) {
      if (!sessionMap.has(row.sessionId)) {
        sessionMap.set(row.sessionId, { sent: 0, received: 0 });
      }
      const entry = sessionMap.get(row.sessionId)!;
      if (row.direction === 'outgoing') entry.sent = parseInt(row.count);
      else entry.received = parseInt(row.count);
    }

    const sessions = (await this.knex('sessions').select('*')) as Session[];
    const sessionNames = new Map(sessions.map(s => [s.id, s.name]));

    const bySession = Array.from(sessionMap.entries()).map(([sessionId, stats]) => ({
      sessionId,
      name: sessionNames.get(sessionId) || 'Unknown',
      ...stats,
    }));

    // Top chats. Order by the aggregate expression (COUNT(*)), not the alias.
    const topChats = (await this.knex('messages as m')
      .select('m.chatId as chatId')
      .count('* as messageCount')
      .where('m.createdAt', '>=', since)
      .groupBy('m.chatId')
      .orderByRaw('COUNT(*) DESC')
      .limit(10)) as Array<{ chatId: string; messageCount: string }>;

    return {
      timeSeries,
      byType,
      bySession,
      topChats: topChats.map(c => ({
        chatId: c.chatId,
        messageCount: parseInt(c.messageCount),
      })),
    };
  }

  async getSessionStats(sessionId: string): Promise<SessionStats> {
    const session = (await this.knex('sessions').where({ id: sessionId }).first()) as Session | undefined;
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Message counts
    const stats = (await this.knex('messages as m')
      .select('m.direction as direction')
      .count('* as count')
      .where('m.sessionId', sessionId)
      .groupBy('m.direction')) as Array<{ direction: string; count: string }>;

    const todayCount = Number(
      (
        await this.knex('messages')
          .where({ sessionId })
          .where('createdAt', '>=', todayStart)
          .count<{ count: string }[]>('* as count')
      )[0].count,
    );

    const sent = parseInt(stats.find(s => s.direction === 'outgoing')?.count || '0');
    const received = parseInt(stats.find(s => s.direction === 'incoming')?.count || '0');

    // Count failed messages for this session
    const failed = Number(
      (
        await this.knex('messages')
          .where({ sessionId, status: MessageStatus.FAILED })
          .count<{ count: string }[]>('* as count')
      )[0].count,
    );

    // Top chats for this session
    const topChats = (await this.knex('messages as m')
      .select('m.chatId as chatId')
      .count('* as count')
      .select(this.knex.raw(`${maxCreatedAtSql(this.dataDbType)} as "lastActive"`))
      .where('m.sessionId', sessionId)
      .groupBy('m.chatId')
      .orderByRaw('COUNT(*) DESC')
      .limit(10)) as Array<{ chatId: string; count: string; lastActive: string }>;

    // Hourly activity (last 24h)
    const hourlyActivity = await this.getHourlyActivity(sessionId);

    return {
      session: { id: session.id, name: session.name, status: session.status },
      messages: { sent, received, today: todayCount, failed },
      topChats: topChats.map(c => ({
        chatId: c.chatId,
        count: parseInt(c.count),
        lastActive: c.lastActive,
      })),
      hourlyActivity,
    };
  }

  private getPeriodStart(period: '24h' | '7d' | '30d'): Date {
    const now = new Date();
    switch (period) {
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  private async getTimeSeries(since: Date, interval: 'hour' | 'day'): Promise<TimeSeriesPoint[]> {
    // Alias the bucket as `bucket`, not `timestamp`: `timestamp` is a reserved type keyword in
    // PostgreSQL, so `GROUP BY timestamp` is not read as the output alias and the query 500s
    // ("column m.createdAt must appear in the GROUP BY"). SQLite tolerates it, hence the dialect-only
    // bug. The API field stays `timestamp` (mapped below).
    const raw = (await this.knex('messages as m')
      .select(this.knex.raw(`${timeSeriesTimestampSql(this.dataDbType, interval)} as bucket`))
      .select(this.knex.raw(`SUM(CASE WHEN m.direction = 'outgoing' THEN 1 ELSE 0 END) as sent`))
      .select(this.knex.raw(`SUM(CASE WHEN m.direction = 'incoming' THEN 1 ELSE 0 END) as received`))
      .where('m.createdAt', '>=', since)
      .groupByRaw('bucket')
      .orderByRaw('bucket ASC')) as Array<{ bucket: string; sent: string; received: string }>;

    return raw.map(r => ({
      timestamp: r.bucket,
      sent: parseInt(r.sent || '0'),
      received: parseInt(r.received || '0'),
    }));
  }

  private async getHourlyActivity(sessionId: string): Promise<Array<{ hour: number; sent: number; received: number }>> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const raw = (await this.knex('messages as m')
      .select(this.knex.raw(`${hourBucketSql(this.dataDbType)} as hour`))
      .select(this.knex.raw(`SUM(CASE WHEN m.direction = 'outgoing' THEN 1 ELSE 0 END) as sent`))
      .select(this.knex.raw(`SUM(CASE WHEN m.direction = 'incoming' THEN 1 ELSE 0 END) as received`))
      .where('m.sessionId', sessionId)
      .andWhere('m.createdAt', '>=', since)
      .groupByRaw('hour')
      .orderByRaw('hour ASC')) as Array<{ hour: string; sent: string; received: string }>;

    // Fill in missing hours
    const result: Array<{ hour: number; sent: number; received: number }> = [];
    const hourMap = new Map(raw.map(r => [parseInt(r.hour), r]));

    for (let h = 0; h < 24; h++) {
      const data = hourMap.get(h);
      result.push({
        hour: h,
        sent: data ? parseInt(data.sent || '0') : 0,
        received: data ? parseInt(data.received || '0') : 0,
      });
    }

    return result;
  }
}
