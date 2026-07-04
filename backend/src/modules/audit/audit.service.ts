import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/database.module';
import { jsonb } from '../../common/utils/pg.util';
import { AuditLog, AuditAction, AuditSeverity } from './entities/audit-log.entity';
import { AuthUser } from '../auth/entities/user.entity';
import { createLogger } from '../shared/logger.service';

/** Upper bound on a single audit-log page, so a large `limit` can't load the whole table at once. */
export const MAX_AUDIT_PAGE_SIZE = 200;

interface AuditContext {
  user?: Pick<AuthUser, 'id' | 'email'>;
  sessionId?: string;
  sessionName?: string;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

export interface AuditQueryOptions {
  action?: AuditAction;
  userId?: string;
  sessionId?: string;
  severity?: AuditSeverity;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = createLogger('AuditService');
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(@Inject(KNEX_CONNECTION) private readonly knex: Knex) {}

  /**
   * Periodically prune audit logs older than AUDIT_RETENTION_DAYS (default 90; set <= 0 to disable).
   * Runs once at startup, then daily. Without this the audit_logs table grows without bound — the
   * existing cleanup() method was never scheduled or called anywhere.
   */
  onModuleInit(): void {
    const parsed = Number.parseInt(process.env.AUDIT_RETENTION_DAYS ?? '', 10);
    const retentionDays = Number.isInteger(parsed) ? Math.max(0, parsed) : 90;
    if (retentionDays <= 0) {
      this.logger.log('Audit-log retention disabled (AUDIT_RETENTION_DAYS <= 0)');
      return;
    }
    const runCleanup = (): void => {
      this.cleanup(retentionDays)
        .then(n => {
          if (n > 0) this.logger.log(`Pruned ${n} audit log(s) older than ${retentionDays} day(s)`);
        })
        .catch(err => this.logger.error('Audit-log cleanup failed', err instanceof Error ? err.stack : String(err)));
    };
    runCleanup(); // prune once at startup
    this.cleanupTimer = setInterval(runCleanup, 24 * 60 * 60 * 1000);
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  async log(
    action: AuditAction,
    context: AuditContext = {},
    severity: AuditSeverity = AuditSeverity.INFO,
  ): Promise<AuditLog | null> {
    // Audit logging is best-effort: a failed insert must never turn a succeeded operation into a 500
    // (callers await this after the primary side-effect). Log and swallow.
    try {
      const [row] = await this.knex('audit_logs')
        .insert({
          action,
          severity,
          userId: context.user?.id || null,
          userEmail: context.user?.email || null,
          sessionId: context.sessionId || null,
          sessionName: context.sessionName || null,
          ipAddress: context.ipAddress || null,
          userAgent: context.userAgent || null,
          method: context.method || null,
          path: context.path || null,
          statusCode: context.statusCode || null,
          metadata: jsonb(context.metadata || null),
          errorMessage: context.errorMessage || null,
        })
        .returning('*');
      return row as AuditLog;
    } catch (error) {
      this.logger.error(
        `Failed to write audit log for ${String(action)}`,
        error instanceof Error ? error.stack : String(error),
        { action: String(action) },
      );
      return null;
    }
  }

  async logInfo(action: AuditAction, context: AuditContext = {}): Promise<AuditLog | null> {
    return this.log(action, context, AuditSeverity.INFO);
  }

  async logWarn(action: AuditAction, context: AuditContext = {}): Promise<AuditLog | null> {
    return this.log(action, context, AuditSeverity.WARN);
  }

  async logError(action: AuditAction, context: AuditContext = {}): Promise<AuditLog | null> {
    return this.log(action, context, AuditSeverity.ERROR);
  }

  async findAll(options: AuditQueryOptions = {}): Promise<{
    data: AuditLog[];
    total: number;
  }> {
    const where: Record<string, unknown> = {};

    if (options.action) where.action = options.action;
    if (options.userId) where.userId = options.userId;
    if (options.sessionId) where.sessionId = options.sessionId;
    if (options.severity) where.severity = options.severity;

    // Clamp the page size so an arbitrarily large `limit` can't load the whole table into one response.
    const requested = options.limit && options.limit > 0 ? options.limit : 50;
    const take = Math.min(requested, MAX_AUDIT_PAGE_SIZE);
    // Clamp to a non-negative skip: a negative offset (e.g. from an unvalidated `?offset=-5`) would
    // otherwise reach the query driver verbatim.
    const skip = options.offset && options.offset > 0 ? options.offset : 0;

    const dataQuery = this.knex('audit_logs').where(where).orderBy('createdAt', 'desc').limit(take).offset(skip);
    const countQuery = this.knex('audit_logs').where(where).count<{ count: string }[]>('* as count');

    if (options.startDate && options.endDate) {
      dataQuery.andWhereBetween('createdAt', [options.startDate, options.endDate]);
      countQuery.andWhereBetween('createdAt', [options.startDate, options.endDate]);
    }

    const data = (await dataQuery) as AuditLog[];
    const [{ count }] = await countQuery;

    return { data, total: Number(count) };
  }

  async getRecentByUser(userId: string, limit = 10): Promise<AuditLog[]> {
    return this.knex('audit_logs')
      .where({ userId })
      .orderBy('createdAt', 'desc')
      .limit(limit) as Promise<AuditLog[]>;
  }

  async getRecentBySession(sessionId: string, limit = 10): Promise<AuditLog[]> {
    return this.knex('audit_logs')
      .where({ sessionId })
      .orderBy('createdAt', 'desc')
      .limit(limit) as Promise<AuditLog[]>;
  }

  async cleanup(olderThanDays = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const affected = await this.knex('audit_logs').where('createdAt', '<', cutoffDate).del();

    return affected || 0;
  }
}
