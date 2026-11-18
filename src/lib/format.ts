const numberFormat = new Intl.NumberFormat("pt-BR");

/** Formata números no padrão brasileiro (1.234). Usável no servidor e no cliente. */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}
