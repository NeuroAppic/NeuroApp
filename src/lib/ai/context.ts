import type { ChatMessage } from "@/types/domain";
import type { ChatTurn } from "./types";

/** Quantas mensagens recentes vão para o modelo (controle de custo e contexto). */
export const HISTORY_WINDOW = 30;

/**
 * Converte o histórico persistido em turnos para o modelo.
 * - Mensagens de profissionais e do sistema entram como contexto rotulado
 *   (dentro de um turno "user"), nunca como fala do assistente.
 * - Turnos consecutivos do mesmo papel são fundidos.
 * - O primeiro turno é sempre "user" (exigência dos provedores).
 */
export function buildTurns(history: ChatMessage[], window = HISTORY_WINDOW): ChatTurn[] {
  const recent = history.slice(-window);
  const turns: ChatTurn[] = [];

  for (const message of recent) {
    let role: ChatTurn["role"];
    let content: string;
    switch (message.sender) {
      case "user":
        role = "user";
        content = message.content;
        break;
      case "ai":
        role = "assistant";
        content = message.content;
        break;
      case "staff":
        role = "user";
        content = `[Mensagem anterior de um profissional da plataforma, apenas para contexto]: ${message.content}`;
        break;
      case "system":
        role = "user";
        content = `[Aviso do sistema, apenas para contexto]: ${message.content}`;
        break;
    }
    const last = turns.at(-1);
    if (last && last.role === role) {
      last.content = `${last.content}\n\n${content}`;
    } else {
      turns.push({ role, content });
    }
  }

  while (turns.length > 0 && turns[0]!.role !== "user") turns.shift();
  return turns;
}
