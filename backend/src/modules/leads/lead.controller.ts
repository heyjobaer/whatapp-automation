import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { LeadService } from './lead.service';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { UserRole } from '../auth/entities/role.entity';

@ApiTags('leads')
@Controller('sessions/:sessionId/leads')
export class LeadController {
  constructor(private readonly leads: LeadService) {}

  @Get()
  @RequireRole(UserRole.READONLY)
  @ApiOperation({ summary: 'AI lead-qualification state for every chat in the session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  list(@Param('sessionId') sessionId: string) {
    return this.leads.listForSession(sessionId);
  }
}
