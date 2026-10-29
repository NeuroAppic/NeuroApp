import "server-only";

import { NextResponse, type NextRequest } from "next/server";

/** Resposta de erro sem detalhes internos. */
export function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Proteção CSRF para rotas que mudam estado e usam cookies de sessão:
 * exige corpo JSON e Origin igual ao host atendido.
 */
export function assertSameOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return jsonError(403, "forbidden_origin", "Origem não permitida.");
  try {
    if (new URL(origin).host !== host) {
      return jsonError(403, "forbidden_origin", "Origem não permitida.");
    }
  } catch {
    return jsonError(403, "forbidden_origin", "Origem não permitida.");
  }
  const type = request.headers.get("content-type") ?? "";
  if (request.method !== "GET" && request.method !== "DELETE" && !type.includes("application/json")) {
    return jsonError(415, "unsupported_media_type", "Envie JSON.");
  }
  return null;
}

/** Traduz erros conhecidos das funções do banco (RAISE EXCEPTION) para HTTP. */
export function mapDbError(error: { message?: string } | null): NextResponse {
  const message = error?.message ?? "";
  if (message.includes("conversation_not_found")) {
    return jsonError(404, "conversation_not_found", "Conversa não encontrada.");
  }
  if (message.includes("conversation_closed")) {
    return jsonError(409, "conversation_closed", "Esta conversa foi encerrada.");
  }
  if (message.includes("forbidden") || message.includes("not_assigned")) {
    return jsonError(403, "forbidden", "Você não tem permissão para esta ação.");
  }
  if (message.includes("already_claimed")) {
    return jsonError(409, "already_claimed", "Outro profissional já assumiu esta conversa.");
  }
  return jsonError(500, "internal_error", "Algo não funcionou. Tente novamente.");
}
