import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class UpdateAiSettingsDto {
  @ApiPropertyOptional({ description: 'LLM provider', example: 'groq' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  provider?: string;

  @ApiPropertyOptional({ description: 'API key. Leave empty to keep the existing key.' })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional({ description: 'Model id', example: 'llama-3.3-70b-versatile' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @ApiPropertyOptional({ description: 'Enable/disable the AI auto-reply' })
  @IsOptional()
  @IsBoolean()
  autoReplyEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Minimum reply delay (ms)', example: 20000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  replyDelayMinMs?: number;

  @ApiPropertyOptional({ description: 'Maximum reply delay (ms)', example: 30000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  replyDelayMaxMs?: number;

  @ApiPropertyOptional({ description: 'Agency name used in the AI persona' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  agencyName?: string;

  @ApiPropertyOptional({ description: 'Human first name the AI introduces itself with', example: 'Sarah' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  assistantName?: string;

  @ApiPropertyOptional({ description: 'Full system-prompt override (optional)' })
  @IsOptional()
  @IsString()
  systemPrompt?: string;
}
