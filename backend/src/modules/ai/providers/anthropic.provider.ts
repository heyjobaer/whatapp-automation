import { Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ChatMessage, LlmProvider } from './llm-provider';
import { AiSettingsService } from '../ai-settings.service';

/** Used when the admin selected the Claude provider but left a non-Claude model string in settings. */
const DEFAULT_CLAUDE_MODEL = 'claude-opus-4-8';

/**
 * Anthropic (Claude) provider. Like GroqProvider, the API key + model come from the DB-backed
 * AiSettingsService so an admin can change them at runtime; the client is rebuilt when the key
 * changes. The system prompt (which carries the full property list) is sent as a cached block so
 * repeated replies only pay ~0.1x for that prefix.
 */
export class AnthropicProvider implements LlmProvider {
  private readonly logger = new Logger(AnthropicProvider.name);
  private client: Anthropic | null = null;
  private clientKey: string | null = null;

  constructor(private readonly settings: AiSettingsService) {}

  async complete(system: string, messages: ChatMessage[], maxTokens: number): Promise<string> {
    const config = await this.settings.get();
    const apiKey = config.apiKey?.trim();
    if (!apiKey) throw new Error('AI API key is not configured (set it in AI settings)');

    if (!this.client || this.clientKey !== apiKey) {
      this.client = new Anthropic({ apiKey });
      this.clientKey = apiKey;
    }

    // Claude requires the first message to be from the user; drop any leading assistant turns
    // (can happen when the oldest message in the window is one of ours).
    let turns = messages;
    const firstUser = turns.findIndex(m => m.role === 'user');
    if (firstUser > 0) turns = turns.slice(firstUser);
    if (turns.length === 0) return '';

    // Only use a Claude model here; if the stored model is a Groq/other string, fall back.
    const configured = config.model?.trim();
    const model = configured && /^claude-/i.test(configured) ? configured : DEFAULT_CLAUDE_MODEL;

    this.logger.log(`Anthropic call (${model})`);
    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      // Cache the system prompt (it carries the full property list, identical across replies).
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: turns.map(m => ({ role: m.role, content: m.content })),
    });

    return response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();
  }
}
