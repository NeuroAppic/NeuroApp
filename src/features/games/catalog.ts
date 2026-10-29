export interface GameInfo {
  slug: "jardim" | "cores" | "bolhas" | "desenho" | "respiracao";
  title: string;
  summary: string;
  tone: string;
}

export const GAMES: GameInfo[] = [
  { slug: "jardim", title: "Jardim tranquilo", summary: "Plante flores, regue e veja crescer, no seu tempo.", tone: "bg-primary-soft" },
  { slug: "cores", title: "Organizar cores", summary: "Troque peças de lugar até ficar do jeito que você gosta.", tone: "bg-lavender-soft" },
  { slug: "bolhas", title: "Bolhas tranquilas", summary: "Bolhas sobem devagar. Toque nelas se quiser.", tone: "bg-sky-soft" },
  { slug: "desenho", title: "Desenho livre", summary: "Desenhe com cores suaves. Desfazer e limpar quando quiser.", tone: "bg-primary-soft" },
  { slug: "respiracao", title: "Respiração guiada", summary: "Um círculo calmo para acompanhar, se fizer bem. Pare quando quiser.", tone: "bg-lavender-soft" },
];

/** Cores suaves usadas pelos jogos (boas nos temas claro e escuro). */
export const SOFT_COLORS = [
  "#9cb4a0", "#b8a9d9", "#8fa4b8", "#e2b6a3", "#e8d49c", "#a9c7c2", "#d4a5b8", "#a7b39a",
] as const;
