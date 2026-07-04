import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { ChatMessage, LlmProvider } from './llm-provider';

export class GroqProvider implements LlmProvider {
  private readonly logger = new Logger(GroqProvider.name);
  private readonly client: Groq;
  private readonly model: string;

  constructor(config: ConfigService) {
    this.client = new Groq({ apiKey: config.get<string>('GROQ_API_KEY') });
    this.model = config.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
  }

  async complete(system: string, messages: ChatMessage[], maxTokens: number): Promise<string> {
    this.logger.debug(`Groq call (${this.model})`);
    // Groq is OpenAI-compatible: the system prompt is the first message.
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
    });
    return response.choices[0]?.message?.content ?? '';
  }
}
