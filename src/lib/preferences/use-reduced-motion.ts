"use client";

import { useSyncExternalStore } from "react";
import { usePreferences } from "./preferences-provider";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

/** Movimento reduzido: preferência do sistema OU do portal (inclui baixo estímulo). */
export function useReducedMotion(): boolean {
  const system = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
  const { preferences } = usePreferences();
  return system || preferences.reduceMotion || preferences.lowStimulus;
}
