import type { QuickMessage } from "@/types/domain";

/**
 * Mensagens rápidas padrão — usadas se o banco estiver indisponível.
 * A fonte oficial é a tabela public.quick_messages (editável no painel).
 */
export const FALLBACK_QUICK_MESSAGES: QuickMessage[] = [
  { id: "f1", category: "essenciais", label: "Preciso de ajuda", message: "Preciso de ajuda.", sort_order: 10 },
  { id: "f2", category: "essenciais", label: "Estou em crise", message: "Estou em crise.", sort_order: 20 },
  { id: "f3", category: "essenciais", label: "Não consigo escrever agora", message: "Não consigo escrever agora.", sort_order: 30 },
  { id: "f4", category: "essenciais", label: "Quero falar com uma pessoa", message: "Quero falar com uma pessoa.", sort_order: 40 },
  { id: "f5", category: "essenciais", label: "Preciso me acalmar", message: "Preciso me acalmar.", sort_order: 50 },
  { id: "f6", category: "essenciais", label: "Quero conversar", message: "Quero conversar.", sort_order: 60 },
  { id: "f7", category: "sentimentos", label: "Estou com medo", message: "Estou com medo.", sort_order: 10 },
  { id: "f8", category: "sentimentos", label: "Estou muito ansioso(a)", message: "Estou muito ansioso(a).", sort_order: 20 },
  { id: "f9", category: "sentimentos", label: "Estou sobrecarregado(a)", message: "Estou sobrecarregado(a).", sort_order: 30 },
  { id: "f10", category: "sentimentos", label: "Estou triste", message: "Estou triste.", sort_order: 40 },
  { id: "f11", category: "sentimentos", label: "Não sei explicar o que sinto", message: "Não consigo explicar o que estou sentindo.", sort_order: 50 },
  { id: "f12", category: "pedidos", label: "Quero ficar em silêncio", message: "Quero ficar em silêncio por um momento.", sort_order: 10 },
  { id: "f13", category: "pedidos", label: "Só quero que me escute", message: "Prefiro que você apenas me escute agora.", sort_order: 20 },
  { id: "f14", category: "pedidos", label: "Me dê uma sugestão", message: "Você pode me dar uma sugestão simples?", sort_order: 30 },
];

export const QUICK_CATEGORIES: { id: QuickMessage["category"]; label: string }[] = [
  { id: "essenciais", label: "Principais" },
  { id: "sentimentos", label: "Como me sinto" },
  { id: "pedidos", label: "O que prefiro" },
];

/** Frase da mensagem rápida que também dispara o pedido de atendimento humano. */
export const HUMAN_REQUEST_PHRASE = "Quero falar com uma pessoa.";

/**
 * Comunicação alternativa: poucas perguntas, respostas com um toque.
 * Cada resposta acrescenta uma frase; a pessoa pode enviar a qualquer momento.
 */
export interface GuidedOption {
  label: string;
  sentence: string;
  next: GuidedStepId | "send" | "pause" | "human";
}
export type GuidedStepId = "start" | "feeling" | "support";
export interface GuidedStep {
  id: GuidedStepId;
  question: string;
  options: GuidedOption[];
}

export const GUIDED_STEPS: Record<GuidedStepId, GuidedStep> = {
  start: {
    id: "start",
    question: "Você prefere conversar ou fazer uma pausa?",
    options: [
      { label: "Conversar", sentence: "Quero conversar.", next: "feeling" },
      { label: "Fazer uma pausa", sentence: "Quero fazer uma pausa agora.", next: "pause" },
      { label: "Falar com uma pessoa", sentence: "Quero falar com uma pessoa.", next: "human" },
    ],
  },
  feeling: {
    id: "feeling",
    question: "Como você está agora?",
    options: [
      { label: "Com medo", sentence: "Estou com medo.", next: "support" },
      { label: "Ansioso(a)", sentence: "Estou ansioso(a).", next: "support" },
      { label: "Triste", sentence: "Estou triste.", next: "support" },
      { label: "Sobrecarregado(a)", sentence: "Estou sobrecarregado(a).", next: "support" },
      { label: "Não sei dizer", sentence: "Não sei dizer o que estou sentindo.", next: "support" },
    ],
  },
  support: {
    id: "support",
    question: "Você gostaria de receber uma sugestão ou prefere que eu apenas escute?",
    options: [
      { label: "Uma sugestão", sentence: "Gostaria de uma sugestão.", next: "send" },
      { label: "Só me escute", sentence: "Prefiro que você apenas me escute.", next: "send" },
    ],
  },
};
