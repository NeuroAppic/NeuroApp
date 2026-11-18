import "server-only";

import { parseAIEnv } from "./config";
import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";
import { MockProvider } from "./providers/mock";
import { OpenAIProvider } from "./providers/openai";
import { AIProviderError, type ChatProvider } from "./types";

export const AI_DEFAULTS = {
  // Inclui o raciocínio interno do modelo; a brevidade é controlada pelo prompt.
  maxOutputTokens: 4_000,
} as const;

let cached: ChatProvider | null = null;

/**
 * Seleciona o provedor por AI_PROVIDER (mock | openai | anthropic | gemini),
 * depois de validar as variáveis (lib/ai/config.ts). Sem configuração, usa o
 * provedor simulado — sempre identificado na interface. As credenciais só
 * existem no servidor.
 */
export function getChatProvider(): ChatProvider {
  if (cached) return cached;
  const parsed = parseAIEnv();
  if (!parsed.ok) throw new AIProviderError(parsed.message, "config");
  const env = parsed.env;

  switch (env.AI_PROVIDER) {
    case "anthropic":
      cached = new AnthropicProvider({ model: env.ANTHROPIC_MODEL, effort: env.ANTHROPIC_EFFORT });
      break;
    case "openai":
      cached = new OpenAIProvider({ model: env.OPENAI_MODEL!, reasoningEffort: env.OPENAI_REASONING_EFFORT });
      break;
    case "gemini":
      cached = new GeminiProvider({
        apiKey: env.GEMINI_API_KEY!,
        model: env.GEMINI_MODEL,
        fallbackModel: env.GEMINI_FALLBACK_MODEL === "none" ? undefined : env.GEMINI_FALLBACK_MODEL,
        thinkingLevel: env.GEMINI_THINKING_LEVEL === "none" ? undefined : env.GEMINI_THINKING_LEVEL,
      });
      break;
    case "mock":
      cached = new MockProvider();
      break;
  }
  return cached;
}

export function getAITimeoutMs(): number {
  const parsed = parseAIEnv();
  return parsed.ok ? parsed.env.AI_TIMEOUT_MS : 45_000;
}

export { AIProviderError } from "./types";
export type { ChatProvider } from "./types";
