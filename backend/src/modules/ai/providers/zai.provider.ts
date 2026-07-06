import { Logger } from '@nestjs/common';
import { ChatMessage, LlmProvider } from './llm-provider';
import { AiSettingsService } from '../ai-settings.service';

/** Z.ai (Zhipu GLM) OpenAI-compatible chat-completions endpoint. Overridable via ZAI_BASE_URL. */
const ZAI_BASE_URL = (process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4').replace(/\/+$/, '');
const DEFAULT_ZAI_MODEL = 'glm-4.6';

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string } | string;
}

/**
 * Z.ai (GLM) provider. Z.ai exposes an OpenAI-compatible /chat/completions endpoint, so we call it
 * over HTTP (no dedicated SDK). Key + model come from the DB-backed AiSettingsService like the other
 * providers, so an admin can change them at runtime.
 */
export class ZaiProvider implements LlmProvider {
  private readonly logger = new Logger(ZaiProvider.name);

  constructor(private readonly settings: AiSettingsService) {}

  async complete(system: string, messages: ChatMessage[], maxTokens: number): Promise<string> {
    const config = await this.settings.get();
    const apiKey = config.apiKey?.trim();
    if (!apiKey) throw new Error('AI API key is not configured (set it in AI settings)');

    const model = config.model?.trim() || DEFAULT_ZAI_MODEL;

    this.logger.log(`Z.ai call (${model})`);
    // OpenAI-compatible: system prompt is the first message.
    const response = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Z.ai request failed (${response.status}): ${text.slice(0, 300)}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    if (data.error) {
      const msg = typeof data.error === 'string' ? data.error : data.error.message;
      throw new Error(`Z.ai error: ${msg ?? 'unknown error'}`);
    }
    return (data.choices?.[0]?.message?.content ?? '').trim();
  }
}
