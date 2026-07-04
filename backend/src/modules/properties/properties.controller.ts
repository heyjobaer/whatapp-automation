import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto, UpdatePropertyDto, UpdateStatusDto } from './dto/property.dto';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { UserRole } from '../auth/entities/role.entity';

/**
 * Property/listing CRUD (the "product list"). Auth is enforced by the global RolesGuard:
 * READONLY can read, but any mutating request (POST/PUT/PATCH/DELETE) requires ADMIN+.
 */
@ApiTags('properties')
@Controller('properties')
export class PropertiesController {
  constructor(private readonly service: PropertiesService) {}

  @Get()
  @RequireRole(UserRole.READONLY)
  @ApiOperation({ summary: 'List properties (server-side paginated + searchable)' })
  findAll(@Query('limit') limit?: string, @Query('offset') offset?: string, @Query('search') search?: string) {
    return this.service.findAll(
      limit ? parseInt(limit, 10) : 100,
      offset ? parseInt(offset, 10) : 0,
      search?.trim() || undefined,
    );
  }

  @Get(':id')
  @RequireRole(UserRole.READONLY)
  @ApiOperation({ summary: 'Get a property by id' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequireRole(UserRole.READONLY)
  @ApiOperation({ summary: 'Create a property' })
  create(@Body() dto: CreatePropertyDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequireRole(UserRole.READONLY)
  @ApiOperation({ summary: 'Update a property' })
  update(@Param('id') id: string, @Body() dto: UpdatePropertyDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  @RequireRole(UserRole.READONLY)
  @ApiOperation({ summary: 'Update a property status' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.service.updateStatus(id, dto.status);
  }

  @Delete(':id')
  @RequireRole(UserRole.READONLY)
  @ApiOperation({ summary: 'Delete a property' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
