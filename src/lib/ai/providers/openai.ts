import "server-only";

import OpenAI from "openai";
import { AIProviderError, type ChatProvider, type ChatRequest, type StreamEvent } from "../types";

export interface OpenAIProviderOptions {
  apiKey?: string;
  model: string;
}

/** Adaptador OpenAI (SDK oficial `openai`), Chat Completions com streaming. */
export class OpenAIProvider implements ChatProvider {
  readonly name = "openai" as const;
  readonly isSimulated = false;
  readonly model: string;
  private readonly client: OpenAI;

  constructor(options: OpenAIProviderOptions) {
    this.model = options.model;
    this.client = new OpenAI({ apiKey: options.apiKey, maxRetries: 1 });
  }

  async *stream(request: ChatRequest): AsyncIterable<StreamEvent> {
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: this.model,
          stream: true,
          stream_options: { include_usage: true },
          max_completion_tokens: request.maxOutputTokens,
          messages: [
            { role: "system", content: request.system },
            ...request.turns.map((t) => ({ role: t.role, content: t.content })),
          ],
        },
        { signal: request.signal },
      );

      let finishReason: string | null = null;
      let usage = { inputTokens: 0, outputTokens: 0 };
      let model = this.model;
      for await (const chunk of stream) {
        model = chunk.model ?? model;
        const choice = chunk.choices[0];
        const text = choice?.delta?.content;
        if (text) yield { type: "text", text };
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          };
        }
      }
      if (finishReason === "content_filter") {
        throw new AIProviderError("O modelo recusou a resposta.", "refused");
      }
      yield { type: "done", stopReason: finishReason, model, usage };
    } catch (error) {
      throw normalizeOpenAIError(error, request.signal);
    }
  }
}

function normalizeOpenAIError(error: unknown, signal: AbortSignal): unknown {
  if (error instanceof AIProviderError) return error;
  if (signal.aborted || error instanceof OpenAI.APIUserAbortError) {
    return new AIProviderError("Geração cancelada ou expirada.", "timeout", error);
  }
  if (error instanceof OpenAI.RateLimitError) {
    return new AIProviderError("Limite do provedor atingido.", "rate_limited", error);
  }
  if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError) {
    return new AIProviderError("Credencial do provedor inválida.", "config", error);
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new AIProviderError("Tempo esgotado no provedor.", "timeout", error);
  }
  return new AIProviderError("Provedor indisponível.", "unavailable", error);
}
