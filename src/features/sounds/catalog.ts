import type { AudioCategory, PlayableTrack } from "@/types/domain";

export const CATEGORY_LABEL: Record<AudioCategory, string> = {
  brown_noise: "Ruído marrom",
  white_noise: "Ruído branco",
  pink_noise: "Ruído rosa",
  rain: "Chuva",
  nature: "Natureza",
  fan: "Ventilador",
  water: "Água corrente",
  ambient: "Ambiente suave",
};

/**
 * Faixas DEMONSTRATIVAS (mesmas do seed). Usadas quando o banco não está
 * configurado. Tocam sons gerados no navegador — não há arquivos nem links.
 */
export const DEMO_TRACKS: PlayableTrack[] = [
  { id: "demo-brown", title: "Ruído marrom", description: "Som grave e contínuo. Demonstração gerada no navegador.", category: "brown_noise", demo_generator: "brown", color: "#A68A7B", icon: "waves", sort_order: 10 },
  { id: "demo-pink", title: "Ruído rosa", description: "Som equilibrado e suave. Demonstração gerada no navegador.", category: "pink_noise", demo_generator: "pink", color: "#C9A9B8", icon: "waves", sort_order: 20 },
  { id: "demo-white", title: "Ruído branco", description: "Som uniforme, ajuda a mascarar ruídos. Demonstração gerada no navegador.", category: "white_noise", demo_generator: "white", color: "#B9C2CC", icon: "waves", sort_order: 30 },
  { id: "demo-rain", title: "Chuva leve", description: "Aproximação de chuva gerada no navegador. Demonstração.", category: "rain", demo_generator: "rain", color: "#8FA4B8", icon: "cloud-rain", sort_order: 40 },
  { id: "demo-fan", title: "Ventilador", description: "Zumbido baixo e constante. Demonstração gerada no navegador.", category: "fan", demo_generator: "fan", color: "#9AAFA2", icon: "fan", sort_order: 50 },
  { id: "demo-water", title: "Água corrente", description: "Aproximação de água corrente. Demonstração gerada no navegador.", category: "water", demo_generator: "water", color: "#87A9A6", icon: "droplets", sort_order: 60 },
  { id: "demo-wind", title: "Vento suave", description: "Vento ao longe. Demonstração gerada no navegador.", category: "nature", demo_generator: "wind", color: "#A9B79B", icon: "wind", sort_order: 70 },
].map((t) => ({
  ...t,
  is_demo: true,
  is_published: true,
  storage_path: null,
  mime_type: null,
  size_bytes: null,
  url: null,
})) as PlayableTrack[];
