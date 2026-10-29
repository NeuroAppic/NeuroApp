import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { AIProviderError, type ChatProvider, type ChatRequest, type StreamEvent } from "../types";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AnthropicProviderOptions {
  apiKey?: string;
  model: string;
  effort: Effort;
}

/**
 * Adaptador Anthropic (SDK oficial @anthropic-ai/sdk).
 * - Streaming com `messages.stream` e cancelamento via AbortSignal.
 * - Fallback de recusa no servidor (`fallbacks: "default"`): se o modelo
 *   recusar por política, a própria API tenta um modelo alternativo.
 * - O raciocínio interno não é exibido; só os blocos de texto vão à pessoa.
 */
export class AnthropicProvider implements ChatProvider {
  readonly name = "anthropic" as const;
  readonly isSimulated = false;
  readonly model: string;
  private readonly client: Anthropic;
  private readonly effort: Effort;

  constructor(options: AnthropicProviderOptions) {
    this.model = options.model;
    this.effort = options.effort;
    this.client = new Anthropic({ apiKey: options.apiKey, maxRetries: 1 });
  }

  async *stream(request: ChatRequest): AsyncIterable<StreamEvent> {
    try {
      const stream = this.client.beta.messages.stream(
        {
          model: this.model,
          // Inclui o raciocínio adaptativo; a brevidade é pedida no prompt.
          max_tokens: request.maxOutputTokens,
          system: [{ type: "text", text: request.system, cache_control: { type: "ephemeral" } }],
          messages: request.turns.map((t) => ({ role: t.role, content: t.content })),
          output_config: { effort: this.effort },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal: request.signal },
      );

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text", text: event.delta.text };
        }
      }

      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        throw new AIProviderError("O modelo recusou a resposta.", "refused");
      }
      yield {
        type: "done",
        stopReason: final.stop_reason,
        model: final.model,
        usage: {
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
        },
      };
    } catch (error) {
      throw normalizeAnthropicError(error, request.signal);
    }
  }
}

function normalizeAnthropicError(error: unknown, signal: AbortSignal): unknown {
  if (error instanceof AIProviderError) return error;
  if (signal.aborted || error instanceof Anthropic.APIUserAbortError) {
    return new AIProviderError("Geração cancelada ou expirada.", "timeout", error);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AIProviderError("Limite do provedor atingido.", "rate_limited", error);
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AIProviderError("Credencial do provedor inválida.", "config", error);
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AIProviderError("Tempo esgotado no provedor.", "timeout", error);
  }
  if (error instanceof Anthropic.APIError || error instanceof Anthropic.APIConnectionError) {
    return new AIProviderError("Provedor indisponível.", "unavailable", error);
  }
  return new AIProviderError("Falha inesperada no provedor.", "unavailable", error);
}
