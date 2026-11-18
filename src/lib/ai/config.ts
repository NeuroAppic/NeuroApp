import { z } from "zod";

/**
 * Esquema das variáveis de ambiente da IA (somente servidor).
 * Validar aqui evita que um erro de digitação vire uma falha silenciosa no chat.
 */

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalText = z.preprocess(emptyToUndefined, z.string().trim().optional());

export const AI_PROVIDERS = ["mock", "openai", "anthropic", "gemini"] as const;
export type AIProviderName = (typeof AI_PROVIDERS)[number];

export const DEFAULT_MODELS = {
  anthropic: "claude-opus-5-5",
  // Alias que sempre aponta para o Flash atual (o gemini-2.5-flash não é mais oferecido a contas novas).
  gemini: "gemini-flash-latest",
  // Usado quando o modelo principal está sobrecarregado (503).
  geminiFallback: "gemini-flash-lite-latest",
} as const;

export const aiEnvSchema = z
  .object({
    AI_PROVIDER: z.preprocess(
      (v) => (typeof v === "string" && v.trim() !== "" ? v.trim().toLowerCase() : "mock"),
      z.enum(AI_PROVIDERS),
    ),
    AI_TIMEOUT_MS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(5_000).max(120_000).default(45_000)),

    ANTHROPIC_API_KEY: optionalText,
    ANTHROPIC_AUTH_TOKEN: optionalText,
    ANTHROPIC_MODEL: z.preprocess(emptyToUndefined, z.string().trim().default(DEFAULT_MODELS.anthropic)),
    ANTHROPIC_EFFORT: z.preprocess(emptyToUndefined, z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium")),

    OPENAI_API_KEY: optionalText,
    OPENAI_MODEL: optionalText,
    // Vazio = não enviar (modelos sem raciocínio recusam o parâmetro).
    OPENAI_REASONING_EFFORT: z.preprocess(emptyToUndefined, z.enum(["none", "minimal", "low", "medium", "high"]).optional()),

    GEMINI_API_KEY: optionalText,
    GEMINI_MODEL: z.preprocess(emptyToUndefined, z.string().trim().default(DEFAULT_MODELS.gemini)),
    // Segunda opção se o principal estiver sobrecarregado. "none" = repetir o mesmo modelo.
    GEMINI_FALLBACK_MODEL: z.preprocess(emptyToUndefined, z.string().trim().default(DEFAULT_MODELS.geminiFallback)),
    // Modelos Gemini 3.x: minimal | low | medium | high. "none" = não enviar (modelos 2.5).
    GEMINI_THINKING_LEVEL: z.preprocess(
      (v) => (typeof v === "string" && v.trim() !== "" ? v.trim().toLowerCase() : "low"),
      z.enum(["none", "minimal", "low", "medium", "high"]),
    ),
  })
  .superRefine((env, ctx) => {
    const missing = (key: string) =>
      ctx.addIssue({ code: "custom", path: [key], message: `${key} é obrigatória com AI_PROVIDER=${env.AI_PROVIDER}.` });
    if (env.AI_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) missing("ANTHROPIC_API_KEY");
    if (env.AI_PROVIDER === "openai") {
      if (!env.OPENAI_API_KEY) missing("OPENAI_API_KEY");
      if (!env.OPENAI_MODEL) missing("OPENAI_MODEL");
    }
    if (env.AI_PROVIDER === "gemini" && !env.GEMINI_API_KEY) missing("GEMINI_API_KEY");
  });

export type AIEnv = z.infer<typeof aiEnvSchema>;

export type AIEnvResult = { ok: true; env: AIEnv } | { ok: false; message: string };

/** Lê e valida as variáveis; nunca inclui valores de chaves na mensagem de erro. */
export function parseAIEnv(source: Record<string, string | undefined> = process.env): AIEnvResult {
  const parsed = aiEnvSchema.safeParse(source);
  if (parsed.success) return { ok: true, env: parsed.data };
  return { ok: false, message: parsed.error.issues.map((i) => i.message).join(" ") };
}
