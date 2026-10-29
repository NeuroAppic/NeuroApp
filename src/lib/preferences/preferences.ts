/**
 * Preferências sensoriais e de comunicação.
 * Guardadas no navegador (funciona sem conta) e sincronizadas com
 * public.user_preferences quando há sessão — o servidor usa as preferências
 * de comunicação ao montar o prompt da IA.
 */

export const TEXT_SCALES = [0.95, 1, 1.125, 1.25, 1.5] as const;

export interface Preferences {
  theme: "system" | "light" | "dark";
  lowStimulus: boolean;
  reduceMotion: boolean;
  textScale: number;
  reduceDecor: boolean;
  shortAnswers: boolean;
  literalCommunication: boolean;
  soundsEnabled: boolean;
  reduceNotifications: boolean;
  shareWithProfessionals: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  lowStimulus: false,
  reduceMotion: false,
  textScale: 1,
  reduceDecor: false,
  shortAnswers: false,
  literalCommunication: false,
  soundsEnabled: true,
  reduceNotifications: false,
  shareWithProfessionals: true,
};

export const PREFERENCES_STORAGE_KEY = "acolher:preferencias:v1";

export function parsePreferences(raw: unknown): Preferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFERENCES };
  const r = raw as Record<string, unknown>;
  const bool = (key: keyof Preferences) =>
    typeof r[key] === "boolean" ? (r[key] as boolean) : (DEFAULT_PREFERENCES[key] as boolean);
  const theme = r.theme === "light" || r.theme === "dark" || r.theme === "system" ? r.theme : "system";
  const scale = typeof r.textScale === "number" && r.textScale >= 0.9 && r.textScale <= 1.6 ? r.textScale : 1;
  return {
    theme,
    textScale: scale,
    lowStimulus: bool("lowStimulus"),
    reduceMotion: bool("reduceMotion"),
    reduceDecor: bool("reduceDecor"),
    shortAnswers: bool("shortAnswers"),
    literalCommunication: bool("literalCommunication"),
    soundsEnabled: bool("soundsEnabled"),
    reduceNotifications: bool("reduceNotifications"),
    shareWithProfessionals: bool("shareWithProfessionals"),
  };
}

export function resolveTheme(theme: Preferences["theme"], systemDark: boolean): "light" | "dark" {
  if (theme === "system") return systemDark ? "dark" : "light";
  return theme;
}

/** Aplica as preferências como atributos no <html> (lidos pelo CSS). */
export function applyPreferencesToDocument(prefs: Preferences, root: HTMLElement): void {
  const systemDark =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = resolveTheme(prefs.theme, Boolean(systemDark));
  toggle(root, "lowStimulus", prefs.lowStimulus);
  toggle(root, "reduceMotion", prefs.reduceMotion);
  toggle(root, "reduceDecor", prefs.reduceDecor);
  root.style.setProperty("--text-scale", String(prefs.textScale));
}

function toggle(root: HTMLElement, key: string, on: boolean) {
  if (on) root.dataset[key] = "";
  else delete root.dataset[key];
}

/** Conversões para a tabela user_preferences. */
export function toDbRow(prefs: Preferences) {
  return {
    theme: prefs.theme,
    low_stimulus: prefs.lowStimulus,
    reduce_motion: prefs.reduceMotion,
    text_scale: prefs.textScale,
    reduce_decor: prefs.reduceDecor,
    short_answers: prefs.shortAnswers,
    literal_communication: prefs.literalCommunication,
    sounds_enabled: prefs.soundsEnabled,
    reduce_notifications: prefs.reduceNotifications,
    share_with_professionals: prefs.shareWithProfessionals,
  };
}

/**
 * Script executado antes da primeira pintura (evita "piscar" de tema e
 * tamanho de texto). Mantido mínimo e sem dependências.
 */
export const PREFERENCES_BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  PREFERENCES_STORAGE_KEY,
)})||"{}");var r=document.documentElement;var d=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;var t=p.theme==="light"||p.theme==="dark"?p.theme:(d?"dark":"light");r.dataset.theme=t;if(p.lowStimulus)r.dataset.lowStimulus="";if(p.reduceMotion)r.dataset.reduceMotion="";if(p.reduceDecor)r.dataset.reduceDecor="";if(typeof p.textScale==="number"&&p.textScale>=0.9&&p.textScale<=1.6)r.style.setProperty("--text-scale",String(p.textScale));}catch(e){}})();`;
