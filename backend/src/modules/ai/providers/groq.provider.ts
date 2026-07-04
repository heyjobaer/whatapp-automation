import { Logger } from '@nestjs/common';
import Groq from 'groq-sdk';
import { ChatMessage, LlmProvider } from './llm-provider';
import { AiSettingsService } from '../ai-settings.service';

/**
 * Groq (OpenAI-compatible) provider. The API key + model come from the DB-backed AiSettingsService
 * (not env), so an admin can change them at runtime. The client is rebuilt when the key changes.
 */
export class GroqProvider implements LlmProvider {
  private readonly logger = new Logger(GroqProvider.name);
  private client: Groq | null = null;
  private clientKey: string | null = null;

  constructor(private readonly settings: AiSettingsService) {}

  async complete(system: string, messages: ChatMessage[], maxTokens: number): Promise<string> {
    const config = await this.settings.get();
    const apiKey = config.apiKey?.trim();
    if (!apiKey) throw new Error('AI API key is not configured (set it in AI settings)');

    if (!this.client || this.clientKey !== apiKey) {
      this.client = new Groq({ apiKey });
      this.clientKey = apiKey;
    }
    const model = config.model?.trim() || 'llama-3.3-70b-versatile';

    this.logger.log(`Groq call (${model})`);
    // Groq is OpenAI-compatible: the system prompt is the first message.
    const response = await this.client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
    });
    return response.choices[0]?.message?.content ?? '';
  }
}
