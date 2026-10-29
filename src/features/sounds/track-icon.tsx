import { CloudRain, Droplets, Fan, Leaf, Moon, Music, Waves, Wind, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  waves: Waves,
  "cloud-rain": CloudRain,
  fan: Fan,
  droplets: Droplets,
  wind: Wind,
  leaf: Leaf,
  moon: Moon,
  music: Music,
};

export const TRACK_ICON_NAMES = Object.keys(ICONS);

export function TrackIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Waves;
  return <Icon className={className} aria-hidden />;
}
