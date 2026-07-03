import { ConflictException, Injectable, NotFoundException, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../../database/database.module';
import { Template } from './entities/template.entity';
import { CreateTemplateDto, UpdateTemplateDto } from './dto';
import { createLogger } from '../../common/services/logger.service';
import { isUniqueConstraintError } from '../../common/utils/unique-constraint.util';

@Injectable()
export class TemplateService {
  private readonly logger = createLogger('TemplateService');

  constructor(@Inject(KNEX_CONNECTION) private readonly knex: Knex) {}

  async create(sessionId: string, dto: CreateTemplateDto): Promise<Template> {
    try {
      const [row] = await this.knex('templates')
        .insert({
          sessionId,
          name: dto.name,
          body: dto.body,
          header: dto.header ?? null,
          footer: dto.footer ?? null,
        })
        .returning('*');
      const saved = row as Template;
      this.logger.log('Template created', { sessionId, templateId: saved.id, name: saved.name });
      return saved;
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictException(`A template named '${dto.name}' already exists for this session`);
      }
      throw err;
    }
  }

  async findBySession(sessionId: string): Promise<Template[]> {
    return this.knex('templates').where({ sessionId }).orderBy('createdAt', 'desc') as Promise<Template[]>;
  }

  async findOne(sessionId: string, id: string): Promise<Template> {
    const template = (await this.knex('templates').where({ id, sessionId }).first()) as Template | undefined;
    if (!template) {
      throw new NotFoundException(`Template with id '${id}' not found`);
    }
    return template;
  }

  /**
   * Resolve a template for a session by id or by name. Throws NotFoundException
   * when neither identifier matches. Used by the send-template message flow.
   */
  async resolve(sessionId: string, identifier: { templateId?: string; templateName?: string }): Promise<Template> {
    const { templateId, templateName } = identifier;

    if (templateId) {
      return this.findOne(sessionId, templateId);
    }

    if (templateName) {
      // Order by createdAt ASC so resolution is deterministic if more than one row shares a name
      // (possible only on a DB predating the unique index); the migration keeps the earliest too.
      const template = (await this.knex('templates')
        .where({ name: templateName, sessionId })
        .orderBy('createdAt', 'asc')
        .first()) as Template | undefined;
      if (!template) {
        throw new NotFoundException(`Template with name '${templateName}' not found`);
      }
      return template;
    }

    throw new NotFoundException('Either templateId or templateName must be provided');
  }

  async update(sessionId: string, id: string, dto: UpdateTemplateDto): Promise<Template> {
    const template = await this.findOne(sessionId, id);

    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.body !== undefined) patch.body = dto.body;
    if (dto.header !== undefined) patch.header = dto.header;
    if (dto.footer !== undefined) patch.footer = dto.footer;

    try {
      const [row] = await this.knex('templates')
        .where({ id })
        .update({ ...patch, updatedAt: this.knex.fn.now() })
        .returning('*');
      return row as Template;
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictException(
          `A template named '${dto.name ?? template.name}' already exists for this session`,
        );
      }
      throw err;
    }
  }

  async delete(sessionId: string, id: string): Promise<void> {
    await this.findOne(sessionId, id);
    await this.knex('templates').where({ id }).del();
    this.logger.log('Template deleted', { sessionId, templateId: id });
  }
}
