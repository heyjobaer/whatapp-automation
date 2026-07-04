import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/database.module';
import { createLogger } from '../shared/logger.service';
import { CreatePropertyDto, UpdatePropertyDto } from './dto/property.dto';
import { Property, PropertyPage } from './entities/property.entity';

const TABLE = 'properties';

// Columns are camelCase and prices/ROI are `double precision`, so pg returns plain JS numbers —
// rows can be returned to the API as-is with no snake_case↔camelCase or numeric→string mapping.
const COLUMNS: Array<keyof CreatePropertyDto> = [
  'name',
  'area',
  'type',
  'bedrooms',
  'priceAed',
  'priceUsd',
  'roiPercent',
  'status',
  'handoverDate',
  'isOffplan',
  'developer',
  'description',
  'brochureUrl',
  'imageUrl',
];

function toRow(dto: Partial<CreatePropertyDto>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const key of COLUMNS) {
    // Skip undefined AND null so a cleared numeric field falls back to the column default
    // (the NOT NULL numeric columns would otherwise reject a null).
    if (dto[key] !== undefined && dto[key] !== null) row[key] = dto[key];
  }
  return row;
}

@Injectable()
export class PropertiesService {
  private readonly logger = createLogger('PropertiesService');

  constructor(@Inject(KNEX_CONNECTION) private readonly knex: Knex) {}

  /** Server-side pagination: one page of rows plus the total count for the table. */
  async findAll(limit = 100, offset = 0, search?: string): Promise<PropertyPage> {
    const query = this.knex<Property>(TABLE);

    if (search) {
      const term = `%${search}%`;
      query.where(b =>
        b.whereILike('name', term).orWhereILike('area', term).orWhereILike('developer', term),
      );
    }

    const [{ count }] = await query.clone().count<{ count: string }[]>('* as count');
    const rows = await query.orderBy('createdAt', 'desc').limit(limit).offset(offset);

    return { data: rows as Property[], total: Number(count) };
  }

  /** Used by AI/automation consumers — only listings that are still available, best ROI first. */
  async findAvailable(): Promise<Property[]> {
    return this.knex<Property>(TABLE).where({ status: 'available' }).orderBy('roiPercent', 'desc');
  }

  async findOne(id: string): Promise<Property> {
    const row = await this.knex<Property>(TABLE).where({ id }).first();
    if (!row) throw new NotFoundException('Property not found');
    return row;
  }

  async create(dto: CreatePropertyDto): Promise<Property> {
    const [row] = await this.knex<Property>(TABLE).insert(toRow(dto)).returning('*');
    this.logger.log('Property created', { id: row.id, name: row.name });
    return row;
  }

  async update(id: string, dto: UpdatePropertyDto): Promise<Property> {
    const [row] = await this.knex<Property>(TABLE)
      .where({ id })
      .update({ ...toRow(dto), updatedAt: this.knex.fn.now() })
      .returning('*');
    if (!row) throw new NotFoundException('Property not found');
    return row;
  }

  async updateStatus(id: string, status: string): Promise<Property> {
    const [row] = await this.knex<Property>(TABLE)
      .where({ id })
      .update({ status, updatedAt: this.knex.fn.now() })
      .returning('*');
    if (!row) throw new NotFoundException('Property not found');
    return row;
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const count = await this.knex(TABLE).where({ id }).del();
    if (!count) throw new NotFoundException('Property not found');
    return { success: true };
  }
}
