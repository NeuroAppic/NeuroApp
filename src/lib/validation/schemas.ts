import { z } from "zod";

export const MAX_MESSAGE_LENGTH = 2000;

/** Remove caracteres de controle (exceto quebra de linha) e espaços nas pontas. */
export function cleanText(value: string): string {
  return value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim();
}

export const messageContentSchema = z
  .string()
  .transform(cleanText)
  .pipe(
    z
      .string()
      .min(1, "Escreva uma mensagem.")
      .max(MAX_MESSAGE_LENGTH, `Use até ${MAX_MESSAGE_LENGTH} caracteres.`),
  );

export const postMessageSchema = z.object({
  content: messageContentSchema,
  clientMessageId: z.uuid(),
  source: z.enum(["typed", "quick", "guided"]).default("typed"),
});
export type PostMessageInput = z.infer<typeof postMessageSchema>;

export const uuidParamSchema = z.uuid();

export const staffInviteSchema = z
  .object({
    email: z.email("E-mail inválido.").max(200),
    fullName: z.string().trim().min(2, "Informe o nome completo.").max(120),
    displayName: z.string().trim().min(2, "Informe como a pessoa será chamada.").max(60),
    professionalTitle: z.string().trim().max(60).optional().default(""),
    professionalRegistry: z.string().trim().max(40).optional().default(""),
    roles: z.array(z.enum(["superadmin", "admin", "psychologist"])).min(1, "Escolha ao menos um papel."),
  })
  .refine((v) => !v.roles.includes("psychologist") || v.professionalRegistry.length >= 3, {
    message: "Psicólogos precisam de registro profissional (ex.: CRP 06/123456).",
    path: ["professionalRegistry"],
  });
export type StaffInviteInput = z.input<typeof staffInviteSchema>;

export const staffSignupSchema = z
  .object({
    fullName: z.string().trim().min(2, "Informe o nome completo.").max(120),
    displayName: z.string().trim().min(2, "Informe como as pessoas vão chamar você.").max(60),
    professionalTitle: z.string().trim().max(60).optional().default("Psicóloga(o)"),
    professionalRegistry: z
      .string()
      .trim()
      .min(3, "Informe o registro profissional (ex.: CRP 06/123456).")
      .max(40),
    email: z.email("E-mail inválido."),
    password: z.string().min(10, "Use pelo menos 10 caracteres.").max(72, "Use até 72 caracteres."),
    passwordConfirm: z.string(),
    declaration: z.literal(true, { error: "Confirme a declaração para continuar." }),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "As senhas não são iguais.",
    path: ["passwordConfirm"],
  });
export type StaffSignupInput = z.input<typeof staffSignupSchema>;

export const staffLoginSchema = z.object({
  email: z.email("E-mail inválido."),
  password: z.string().min(8, "A senha tem pelo menos 8 caracteres."),
});

export const accountSchema = z.object({
  email: z.email("E-mail inválido."),
  password: z
    .string()
    .min(10, "Use pelo menos 10 caracteres.")
    .max(72, "Use até 72 caracteres."),
});

export const AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/flac",
] as const;
export const AUDIO_MAX_BYTES = 50 * 1024 * 1024;

export const audioTrackSchema = z.object({
  title: z.string().trim().min(1, "Informe um nome.").max(80),
  description: z.string().trim().max(240).optional().default(""),
  category: z.enum([
    "brown_noise",
    "white_noise",
    "pink_noise",
    "rain",
    "nature",
    "fan",
    "water",
    "ambient",
  ]),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida."),
  icon: z.enum(["waves", "cloud-rain", "fan", "droplets", "wind", "leaf", "moon", "music"]),
});
export type AudioTrackInput = z.input<typeof audioTrackSchema>;

export function validateAudioFile(file: { type: string; size: number }): string | null {
  if (!(AUDIO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "Formato não suportado. Use MP3, OGG, WAV, WEBM, M4A, AAC ou FLAC.";
  }
  if (file.size > AUDIO_MAX_BYTES) return "O arquivo passa de 50 MB.";
  if (file.size === 0) return "O arquivo está vazio.";
  return null;
}
