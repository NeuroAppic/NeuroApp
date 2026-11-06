import "server-only";

/**
 * MODO DE TESTE do cadastro de profissionais (STAFF_OPEN_SIGNUP=true):
 * qualquer pessoa cria uma conta de psicólogo só com e-mail e senha e já pode
 * ver a fila e assumir conversas — sem CRP, sem confirmação de e-mail e sem
 * validação administrativa.
 *
 * NUNCA ative com pessoas reais usando o portal: qualquer cadastro passaria a
 * ler conversas de quem pediu ajuda. Desligado, vale o cadastro profissional
 * com CRP e validação por um administrador.
 */
export function isOpenStaffSignup(): boolean {
  return process.env.STAFF_OPEN_SIGNUP === "true";
}

/** "ana.souza92@gmail.com" → "Ana Souza" (nome exibido a quem é atendido). */
export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local
    .replace(/[0-9]+/g, " ")
    .split(/[._\-+\s]+/)
    .filter((w) => w.length > 0)
    .slice(0, 3)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  const name = words.join(" ").slice(0, 60).trim();
  return name.length >= 2 ? name : "Profissional";
}
