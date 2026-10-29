/**
 * Classificador textual de sinais de risco — APOIO À TRIAGEM, não diagnóstico.
 *
 * - Regras determinísticas, legíveis e versionadas para revisão por
 *   profissionais qualificados (ver docs/safety/protocolo-de-crise.md).
 * - Falsos negativos são possíveis: o sistema nunca afirma ter "detectado"
 *   ou "descartado" risco para a pessoa; apenas oferece recursos.
 * - Na dúvida, as regras preferem sinalizar (falso positivo) a silenciar.
 * - Nenhum conteúdo é registrado: apenas o nível e os IDs das regras.
 */
import type { RiskLevel } from "@/types/domain";

export const RISK_RULES_VERSION = "2026-10-28.1";

export interface RiskRule {
  id: string;
  level: Exclude<RiskLevel, "none">;
  description: string;
  patterns: RegExp[];
}

// "nao " imediatamente antes indica negação simples ("não quero morrer").
const NOT = "(?<!nao )(?<!nunca )";

export const RISK_RULES: readonly RiskRule[] = [
  // ---- Crítico: intenção com plano, meio ou iminência --------------------
  {
    id: "suicide.imminent",
    level: "critical",
    description: "Intenção de suicídio com iminência, plano ou meio declarado.",
    patterns: [
      /\b(vou|irei|quero) me matar (hoje|agora|ja|esta noite)\b/,
      /\b(tomei|engoli) (todos os|muitos|varios|uma caixa de) (remedios|comprimidos|medicamentos)\b/,
      /\b(estou|to|tô) (na|em cima da) (ponte|janela|beirada|laje)\b.*\b(pular|me jogar)\b/,
      /\bvou (pular|me jogar)\b/,
      /\b(ja|já) (escrevi|deixei) (a|uma|minha) carta( de despedida)?\b/,
      /\b(comprei|tenho|peguei) (uma )?(arma|corda|veneno)\b.*\b(me matar|acabar|morrer)\b/,
      /\b(e|eh) hoje que eu (morro|acabo com tudo)\b/,
    ],
  },
  {
    id: "self_harm.in_progress",
    level: "critical",
    description: "Autolesão acontecendo agora ou ferimento grave.",
    patterns: [
      /\b(estou|to) (me cortando|sangrando muito)\b/,
      /\bme cortei (muito|fundo)\b/,
      /\bnao (para|consigo parar) de sangrar\b/,
    ],
  },
  {
    id: "violence.imminent",
    level: "critical",
    description: "Risco imediato de violência contra si ou terceiros.",
    patterns: [
      /\bvou (matar|esfaquear|atirar em) (ele|ela|alguem|meu|minha|todo mundo)\b/,
      /\b(ele|ela|alguem) (esta|ta) (tentando|querendo) me matar\b/,
      /\b(estou|to) sendo (agredid[oa]|espancad[oa]|ameacad[oa] de morte)\b/,
    ],
  },
  // ---- Alto: ideação, autolesão, violência ---------------------------------
  {
    id: "suicide.ideation",
    level: "high",
    description: "Ideação suicida ou desejo de morrer.",
    patterns: [
      new RegExp(`${NOT}\\bquero morrer\\b`),
      new RegExp(`${NOT}\\b(vou|quero|penso em|pensando em|vontade de) (me matar|tirar (a )?minha (propria )?vida|acabar com (a )?minha vida)\\b`),
      /\bsuicid(io|ar|a)\b/,
      new RegExp(`${NOT}\\bquero (sumir|desaparecer) (pra|para) sempre\\b`),
      /\bnao (quero|aguento) mais viver\b/,
      /\b(seria|era) melhor (se eu (morresse|nao existisse)|eu morrer)\b/,
      /\bacabar com tudo\b/,
      /\bnao vejo (motivo|razao|sentido) (pra|para) (viver|continuar)\b/,
      /\bme despedir de (todos|todo mundo|voces)\b/,
    ],
  },
  {
    id: "self_harm.intent",
    level: "high",
    description: "Intenção ou prática de autolesão.",
    patterns: [
      new RegExp(`${NOT}\\b(vou|quero|vontade de|preciso) me (cortar|machucar|ferir|queimar|bater)\\b`),
      /\bautomutil(acao|ar|o)\b/,
      /\bme (cortei|machuquei|queimei) (de novo|hoje|ontem)\b/,
    ],
  },
  {
    id: "violence.risk",
    level: "high",
    description: "Ameaça ou vivência de violência.",
    patterns: [
      new RegExp(`${NOT}\\b(vou|quero) (matar|machucar) (ele|ela|alguem|meu|minha)\\b`),
      /\b(ele|ela|meu (pai|marido|namorado|companheiro)|minha (mae|esposa|namorada|companheira)) (me bate|me agride|me ameaca)\b/,
      /\b(estou|to) com medo de (ser morta|ser morto|apanhar)\b/,
    ],
  },
  // ---- Atenção: sofrimento intenso, desorientação, emergência física ------
  {
    id: "disorientation",
    level: "attention",
    description: "Desorientação grave ou percepção alterada.",
    patterns: [
      /\bnao sei (onde (eu )?estou|quem eu sou|que dia e hoje)\b/,
      /\b(estou|to) ouvindo vozes\b/,
      /\bas vozes (mandam|dizem|falam)\b/,
      /\bnada (parece|e) real\b/,
    ],
  },
  {
    id: "physical.emergency",
    level: "attention",
    description: "Possível emergência física (pode ser crise de pânico — orientar sem alarmar).",
    patterns: [
      /\bnao consigo respirar\b/,
      /\bdor (forte )?no peito\b/,
      /\b(vou|acho que vou) desmaiar\b/,
      /\b(tomei|usei) (muita|muito|droga|remedio demais)\b/,
    ],
  },
  {
    id: "hopelessness",
    level: "attention",
    description: "Desesperança intensa.",
    patterns: [
      /\bnao aguento mais\b/,
      /\bnao tem (mais )?saida\b/,
      /\bninguem (se importa|ligaria|sentiria falta)\b/,
      /\b(sou|me sinto) um peso\b/,
      /\bnada vai melhorar\b/,
    ],
  },
];

const LEVEL_ORDER: Record<RiskLevel, number> = { none: 0, attention: 1, high: 2, critical: 3 };

export function maxRiskLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return LEVEL_ORDER[a] >= LEVEL_ORDER[b] ? a : b;
}

export function isElevatedRisk(level: RiskLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER.high;
}

/** Minúsculas, sem acentos, sem pontuação e com espaços normalizados. */
export function normalizeForRisk(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface RiskAssessment {
  level: RiskLevel;
  ruleIds: string[];
  version: string;
}

export function assessRisk(text: string): RiskAssessment {
  const normalized = normalizeForRisk(text);
  let level: RiskLevel = "none";
  const ruleIds: string[] = [];
  for (const rule of RISK_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      ruleIds.push(rule.id);
      level = maxRiskLevel(level, rule.level);
    }
  }
  return { level, ruleIds, version: RISK_RULES_VERSION };
}
