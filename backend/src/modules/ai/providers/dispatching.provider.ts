import { Logger } from '@nestjs/common';
import { ChatMessage, LlmProvider } from './llm-provider';
import { GroqProvider } from './groq.provider';
import { AnthropicProvider } from './anthropic.provider';
import { ZaiProvider } from './zai.provider';
import { AiSettingsService } from '../ai-settings.service';

/**
 * Picks the concrete LLM provider per call based on `settings.provider`, so an admin can switch
 * between Groq, Claude, and Z.ai from the AI Settings page without a restart. Each concrete provider
 * caches its own client and reads its key/model from AiSettingsService.
 */
export class DispatchingLlmProvider implements LlmProvider {
  private readonly logger = new Logger(DispatchingLlmProvider.name);
  private readonly groq: GroqProvider;
  private readonly anthropic: AnthropicProvider;
  private readonly zai: ZaiProvider;

  constructor(private readonly settings: AiSettingsService) {
    this.groq = new GroqProvider(settings);
    this.anthropic = new AnthropicProvider(settings);
    this.zai = new ZaiProvider(settings);
  }

  async complete(system: string, messages: ChatMessage[], maxTokens: number): Promise<string> {
    const { provider } = await this.settings.get();
    const key = (provider || 'groq').toLowerCase();
    // 'claude' and 'anthropic' both map to the Anthropic provider.
    if (key === 'anthropic' || key === 'claude') {
      return this.anthropic.complete(system, messages, maxTokens);
    }
    // 'zai', 'z-ai', 'z.ai', and 'glm' all map to the Z.ai provider.
    if (key === 'zai' || key === 'z-ai' || key === 'z.ai' || key === 'glm') {
      return this.zai.complete(system, messages, maxTokens);
    }
    return this.groq.complete(system, messages, maxTokens);
  }
}
