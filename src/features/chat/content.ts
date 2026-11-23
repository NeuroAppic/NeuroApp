/**
 * Sugestões para começar: poucas, curtas e só antes da primeira mensagem.
 * O campo de texto continua sendo o caminho principal.
 */
export interface QuickSuggestion {
  label: string;
  message: string;
}

export const QUICK_SUGGESTIONS: QuickSuggestion[] = [
  { label: "Estou ansioso(a)", message: "Estou ansioso(a) e queria conversar." },
  { label: "Só quero desabafar", message: "Só quero desabafar um pouco." },
];

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
