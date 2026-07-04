// Provider-agnostic LLM contract. Concrete providers (Groq, …) implement `complete()`;
// AiService stays unaware of which one is wired in.

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmProvider {
  /** Send a system prompt + message history, return the raw assistant text. */
  complete(system: string, messages: ChatMessage[], maxTokens: number): Promise<string>;
}

/** DI token used to inject whichever provider was selected via the `AI` env var. */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
