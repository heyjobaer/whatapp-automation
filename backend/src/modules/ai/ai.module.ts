import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiSettingsService } from './ai-settings.service';
import { AiSettingsController } from './ai-settings.controller';
import { LLM_PROVIDER, LlmProvider } from './providers/llm-provider';
import { DispatchingLlmProvider } from './providers/dispatching.provider';
import { PropertiesModule } from '../properties/properties.module';
import { LeadsModule } from '../leads/leads.module';

// The LLM provider reads its provider/key/model from the DB-backed AiSettingsService at call time,
// so an admin can switch between Groq and Claude from the AI Settings page without a restart.
const llmProvider = {
  provide: LLM_PROVIDER,
  useFactory: (settings: AiSettingsService): LlmProvider => new DispatchingLlmProvider(settings),
  inject: [AiSettingsService],
};

@Module({
  imports: [PropertiesModule, LeadsModule],
  controllers: [AiSettingsController],
  providers: [AiService, AiSettingsService, llmProvider],
  exports: [AiService, AiSettingsService],
})
export class AiModule {}
