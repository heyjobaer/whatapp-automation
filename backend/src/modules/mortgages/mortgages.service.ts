import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { KNEX_CONNECTION } from '../database/database.module';
import { createLogger } from '../shared/logger.service';
import { CreateMortgageProductDto, UpdateMortgageProductDto } from './dto/mortgage-product.dto';
import { MortgageProduct, MortgageProductPage } from './entities/mortgage-product.entity';

const TABLE = 'mortgage_products';

// Columns are camelCase and rates/fees are `double precision`, so pg returns plain JS numbers —
// rows can be returned to the API as-is with no snake_case↔camelCase or numeric→string mapping.
const COLUMNS: Array<keyof CreateMortgageProductDto> = [
  'lender',
  'productName',
  'category',
  'rateType',
  'initialRate',
  'initialPeriodMonths',
  'followOnRate',
  'maxLtvPercent',
  'maxTermYears',
  'productFee',
  'repaymentType',
  'ercApplies',
  'status',
  'description',
];

function toRow(dto: Partial<CreateMortgageProductDto>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const key of COLUMNS) {
    // Skip undefined AND null so a cleared numeric field falls back to the column default
    // (the NOT NULL numeric columns would otherwise reject a null).
    if (dto[key] !== undefined && dto[key] !== null) row[key] = dto[key];
  }
  return row;
}

@Injectable()
export class MortgagesService {
  private readonly logger = createLogger('MortgagesService');

  constructor(@Inject(KNEX_CONNECTION) private readonly knex: Knex) {}

  /** Server-side pagination: one page of rows plus the total count for the table. */
  async findAll(limit = 100, offset = 0, search?: string): Promise<MortgageProductPage> {
    const query = this.knex<MortgageProduct>(TABLE);

    if (search) {
      const term = `%${search}%`;
      query.where(b =>
        b.whereILike('lender', term).orWhereILike('productName', term).orWhereILike('category', term),
      );
    }

    const [{ count }] = await query.clone().count<{ count: string }[]>('* as count');
    const rows = await query.orderBy('createdAt', 'desc').limit(limit).offset(offset);

    return { data: rows as MortgageProduct[], total: Number(count) };
  }

  /** Used by AI/automation consumers — only products that are still available, lowest rate first. */
  async findAvailable(): Promise<MortgageProduct[]> {
    return this.knex<MortgageProduct>(TABLE).where({ status: 'available' }).orderBy('initialRate', 'asc');
  }

  async findOne(id: string): Promise<MortgageProduct> {
    const row = await this.knex<MortgageProduct>(TABLE).where({ id }).first();
    if (!row) throw new NotFoundException('Mortgage product not found');
    return row;
  }

  async create(dto: CreateMortgageProductDto): Promise<MortgageProduct> {
    const [row] = await this.knex<MortgageProduct>(TABLE).insert(toRow(dto)).returning('*');
    this.logger.log('Mortgage product created', { id: row.id, lender: row.lender });
    return row;
  }

  async update(id: string, dto: UpdateMortgageProductDto): Promise<MortgageProduct> {
    const [row] = await this.knex<MortgageProduct>(TABLE)
      .where({ id })
      .update({ ...toRow(dto), updatedAt: this.knex.fn.now() })
      .returning('*');
    if (!row) throw new NotFoundException('Mortgage product not found');
    return row;
  }

  async updateStatus(id: string, status: string): Promise<MortgageProduct> {
    const [row] = await this.knex<MortgageProduct>(TABLE)
      .where({ id })
      .update({ status, updatedAt: this.knex.fn.now() })
      .returning('*');
    if (!row) throw new NotFoundException('Mortgage product not found');
    return row;
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const count = await this.knex(TABLE).where({ id }).del();
    if (!count) throw new NotFoundException('Mortgage product not found');
    return { success: true };
  }
}
