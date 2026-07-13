import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { LeadService } from './lead.service';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { UserRole } from '../auth/entities/role.entity';

class SetDisableAiReplyDto {
  @IsBoolean()
  disableAiReply!: boolean;
}

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

  @Put(':chatId/disable-ai-reply')
  @RequireRole(UserRole.ADMIN)
  @ApiOperation({ summary: 'Toggle "Disable AI reply" for a single chat' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiParam({ name: 'chatId', description: 'Chat ID (WhatsApp JID)' })
  setDisableAiReply(
    @Param('sessionId') sessionId: string,
    @Param('chatId') chatId: string,
    @Body() dto: SetDisableAiReplyDto,
  ) {
    return this.leads.setDisableAiReply(sessionId, chatId, dto.disableAiReply);
  }
}
