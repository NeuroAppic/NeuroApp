"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  applyPreferencesToDocument,
  DEFAULT_PREFERENCES,
  parsePreferences,
  PREFERENCES_STORAGE_KEY,
  toDbRow,
  type Preferences,
} from "./preferences";

interface PreferencesContextValue {
  preferences: Preferences;
  update: (patch: Partial<Preferences>) => void;
  reset: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function readStored(): Preferences {
  try {
    return parsePreferences(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);

  // Carrega do navegador na montagem (o script de boot já aplicou o visual).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do armazenamento local
    setPreferences(readStored());
  }, []);

  // Acompanha mudanças de tema do sistema quando a pessoa escolheu "sistema".
  useEffect(() => {
    applyPreferencesToDocument(preferences, document.documentElement);
    if (preferences.theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyPreferencesToDocument(preferences, document.documentElement);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preferences]);

  const persist = useCallback((next: Preferences) => {
    try {
      localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // armazenamento indisponível (modo privado): preferências valem só nesta aba
    }
    if (!isSupabaseConfigured()) return;
    void (async () => {
      const supabase = getBrowserSupabase();
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      await supabase.from("user_preferences").upsert({ user_id: data.user.id, ...toDbRow(next) });
    })();
  }, []);

  const update = useCallback(
    (patch: Partial<Preferences>) => {
      setPreferences((current) => {
        const next = { ...current, ...patch };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const reset = useCallback(() => {
    setPreferences({ ...DEFAULT_PREFERENCES });
    persist({ ...DEFAULT_PREFERENCES });
  }, [persist]);

  const value = useMemo(() => ({ preferences, update, reset }), [preferences, update, reset]);
  return <PreferencesContext value={value}>{children}</PreferencesContext>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = use(PreferencesContext);
  if (!ctx) throw new Error("usePreferences precisa estar dentro de PreferencesProvider");
  return ctx;
}

/** Envia as preferências locais ao banco logo após a criação da sessão. */
export async function syncPreferencesToAccount(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getBrowserSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await supabase.from("user_preferences").upsert({ user_id: data.user.id, ...toDbRow(readStored()) });
}
