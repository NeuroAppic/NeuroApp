import type { EmergencyContacts, RiskLevel } from "@/types/domain";

/**
 * Contatos padrão (Brasil). A fonte oficial em produção é a configuração
 * `public.emergency_contacts` no banco, editável pelo superadministrador.
 * Este valor só é usado se o banco estiver indisponível.
 */
export const DEFAULT_EMERGENCY_CONTACTS: EmergencyContacts = {
  country: "BR",
  contacts: [
    {
      id: "cvv",
      name: "CVV — Centro de Valorização da Vida",
      phone: "188",
      description: "Apoio emocional e prevenção do suicídio. Ligação gratuita, 24 horas.",
      url: "https://cvv.org.br",
    },
    {
      id: "samu",
      name: "SAMU",
      phone: "192",
      description: "Emergências médicas, inclusive crises de saúde mental com risco imediato.",
    },
  ],
};

/**
 * Mensagens de segurança exibidas pelo sistema (não pela IA).
 * DEVEM ser revisadas por profissionais responsáveis antes do lançamento.
 * Nunca afirmam que alguém está monitorando ou virá ajudar.
 */
export const SAFETY_COPY = {
  elevatedTitle: "Você não precisa passar por isso sozinho(a).",
  elevatedBody:
    "Se você está em perigo agora ou pode se machucar, ligue para um destes serviços. Eles atendem pessoas de verdade.",
  escalatedNote:
    "Sua conversa foi marcada como prioritária para a equipe de profissionais. Isso não garante atendimento imediato.",
  noStaffNote:
    "Neste momento não há profissionais da plataforma disponíveis. Os serviços acima podem ajudar agora.",
  disclaimer: "Esta plataforma não é um serviço de emergência.",
} as const;

/**
 * Resposta segura e determinística usada quando a IA está indisponível e há
 * sinais de risco. Revisar com a equipe clínica.
 */
export function fallbackSafetyReply(level: RiskLevel): string {
  if (level === "critical" || level === "high") {
    return [
      "Sinto muito que você esteja passando por isso. O que você sente importa.",
      "Se você pode se machucar agora, ligue para o SAMU (192) ou para o CVV (188). O CVV atende 24 horas e é gratuito.",
      "Se puder, procure ficar perto de alguém de confiança.",
    ].join("\n\n");
  }
  return "Não consegui responder agora, mas sua mensagem foi guardada. Você pode tentar de novo, pedir para falar com uma pessoa ou ver os contatos de ajuda.";
}
