import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { LLM_PROVIDER, LlmProvider } from './providers/llm-provider';
import { GroqProvider } from './providers/groq.provider';

// Picks the LLM provider from the `AI` env var (defaults to groq).
const llmProvider = {
  provide: LLM_PROVIDER,
  useFactory: (config: ConfigService): LlmProvider => {
    const choice = (config.get<string>('AI') || 'groq').toLowerCase();
    const logger = new Logger('AiModule');
    switch (choice) {
      case 'groq':
        logger.log('Using Groq as the AI provider');
        return new GroqProvider(config);
      default:
        throw new Error(`Unknown AI provider "${choice}". Set AI=groq.`);
    }
  },
  inject: [ConfigService],
};

@Module({
  providers: [AiService, llmProvider],
  exports: [AiService],
})
export class AiModule {}
