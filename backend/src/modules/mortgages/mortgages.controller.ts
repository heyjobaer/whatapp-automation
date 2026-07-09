import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MortgagesService } from './mortgages.service';
import { CreateMortgageProductDto, UpdateMortgageProductDto, UpdateStatusDto } from './dto/mortgage-product.dto';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { UserRole } from '../auth/entities/role.entity';

/**
 * Mortgage product CRUD (the broker's "product list"). Auth is enforced by the global RolesGuard:
 * READONLY can read, but any mutating request (POST/PUT/PATCH/DELETE) requires ADMIN+.
 */
@ApiTags('mortgages')
@Controller('mortgages')
export class MortgagesController {
  constructor(private readonly service: MortgagesService) {}

  @Get()
  @RequireRole(UserRole.READONLY)
  @ApiOperation({ summary: 'List mortgage products (server-side paginated + searchable)' })
  findAll(@Query('limit') limit?: string, @Query('offset') offset?: string, @Query('search') search?: string) {
    return this.service.findAll(
      limit ? parseInt(limit, 10) : 100,
      offset ? parseInt(offset, 10) : 0,
      search?.trim() || undefined,
    );
  }

  @Get(':id')
  @RequireRole(UserRole.READONLY)
  @ApiOperation({ summary: 'Get a mortgage product by id' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequireRole(UserRole.READONLY)
  @ApiOperation({ summary: 'Create a mortgage product' })
  create(@Body() dto: CreateMortgageProductDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequireRole(UserRole.READONLY)
  @ApiOperation({ summary: 'Update a mortgage product' })
  update(@Param('id') id: string, @Body() dto: UpdateMortgageProductDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  @RequireRole(UserRole.READONLY)
  @ApiOperation({ summary: 'Update a mortgage product status' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.service.updateStatus(id, dto.status);
  }

  @Delete(':id')
  @RequireRole(UserRole.READONLY)
  @ApiOperation({ summary: 'Delete a mortgage product' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
