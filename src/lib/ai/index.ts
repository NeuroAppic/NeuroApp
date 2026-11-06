import "server-only";

import { AnthropicProvider } from "./providers/anthropic";
import { MockProvider } from "./providers/mock";
import { OpenAIProvider, type OpenAIReasoningEffort } from "./providers/openai";
import { AIProviderError, type ChatProvider } from "./types";

export const AI_DEFAULTS = {
  anthropicModel: "claude-opus-5-5",
  timeoutMs: 45_000,
  // Inclui o raciocínio interno do modelo; a brevidade é controlada pelo prompt.
  maxOutputTokens: 4_000,
} as const;

let cached: ChatProvider | null = null;

/**
 * Seleciona o provedor por AI_PROVIDER (anthropic | openai | mock).
 * Sem configuração, cai no provedor simulado — sempre identificado na interface.
 * As credenciais só existem no servidor.
 */
export function getChatProvider(): ChatProvider {
  if (cached) return cached;
  const provider = (process.env.AI_PROVIDER ?? "mock").toLowerCase();

  switch (provider) {
    case "anthropic": {
      if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
        throw new AIProviderError("ANTHROPIC_API_KEY não configurada.", "config");
      }
      const effort = parseEffort(process.env.ANTHROPIC_EFFORT);
      cached = new AnthropicProvider({
        model: process.env.ANTHROPIC_MODEL || AI_DEFAULTS.anthropicModel,
        effort,
      });
      break;
    }
    case "openai": {
      if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
        throw new AIProviderError("OPENAI_API_KEY e OPENAI_MODEL são obrigatórias.", "config");
      }
      cached = new OpenAIProvider({
        model: process.env.OPENAI_MODEL,
        reasoningEffort: parseOpenAIEffort(process.env.OPENAI_REASONING_EFFORT),
      });
      break;
    }
    case "mock":
      cached = new MockProvider();
      break;
    default:
      throw new AIProviderError(`AI_PROVIDER desconhecido: ${provider}`, "config");
  }
  return cached;
}

export function getAITimeoutMs(): number {
  const value = Number(process.env.AI_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 5_000 ? value : AI_DEFAULTS.timeoutMs;
}

function parseEffort(raw: string | undefined): "low" | "medium" | "high" | "xhigh" | "max" {
  const allowed = ["low", "medium", "high", "xhigh", "max"] as const;
  return (allowed as readonly string[]).includes(raw ?? "")
    ? (raw as (typeof allowed)[number])
    : "medium";
}

/** Sem valor: o parâmetro não é enviado (modelos sem raciocínio o recusam). */
function parseOpenAIEffort(raw: string | undefined): OpenAIReasoningEffort | undefined {
  const allowed: OpenAIReasoningEffort[] = ["none", "minimal", "low", "medium", "high"];
  return allowed.find((v) => v === raw);
}

export { AIProviderError } from "./types";
export type { ChatProvider } from "./types";
