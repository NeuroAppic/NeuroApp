/**
 * Destinos internos aceitos depois de links de e-mail e logins.
 * Evita redirecionamento aberto (ex.: ?next=https://site-malicioso).
 */
const ALLOWED_PREFIXES = ["/dashboard", "/conta", "/conversar", "/redefinir-senha"];

export function safeNext(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  let pathname: string;
  try {
    pathname = new URL(raw, "http://localhost").pathname;
  } catch {
    return fallback;
  }
  return ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ? raw : fallback;
}

/** Para onde vai quem abriu um convite ou pediu nova senha: definir a senha primeiro. */
export function passwordSetupPath(next: string): string {
  return `/redefinir-senha?next=${encodeURIComponent(next)}`;
}
