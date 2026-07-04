import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AiSettingsService, AiSettings, AiSettingsUpdate } from './ai-settings.service';
import { UpdateAiSettingsDto } from './dto/ai-settings.dto';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { UserRole } from '../auth/entities/role.entity';

/** Admin-facing view: never returns the raw API key, only whether one is set + a masked preview. */
interface AiSettingsView {
  provider: string;
  model: string;
  autoReplyEnabled: boolean;
  replyDelayMinMs: number;
  replyDelayMaxMs: number;
  agencyName: string | null;
  systemPrompt: string | null;
  apiKeySet: boolean;
  apiKeyPreview: string | null;
  updatedAt: string;
}

function toView(s: AiSettings): AiSettingsView {
  const key = s.apiKey?.trim() || '';
  return {
    provider: s.provider,
    model: s.model,
    autoReplyEnabled: s.autoReplyEnabled,
    replyDelayMinMs: s.replyDelayMinMs,
    replyDelayMaxMs: s.replyDelayMaxMs,
    agencyName: s.agencyName,
    systemPrompt: s.systemPrompt,
    apiKeySet: key.length > 0,
    apiKeyPreview: key ? `${'•'.repeat(Math.max(0, key.length - 4))}${key.slice(-4)}` : null,
    updatedAt: s.updatedAt,
  };
}

@ApiTags('ai-settings')
@Controller('ai/settings')
export class AiSettingsController {
  constructor(private readonly settings: AiSettingsService) {}

  @Get()
  @RequireRole(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get the AI configuration (API key masked)' })
  async get(): Promise<AiSettingsView> {
    return toView(await this.settings.get());
  }

  @Put()
  @RequireRole(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update the AI configuration' })
  async update(@Body() dto: UpdateAiSettingsDto): Promise<AiSettingsView> {
    const patch: AiSettingsUpdate = { ...dto };
    // An empty/whitespace apiKey means "keep the existing key" — never wipe it by accident.
    if (patch.apiKey == null || patch.apiKey.trim() === '') delete patch.apiKey;
    return toView(await this.settings.update(patch));
  }
}
