"use client";

import { useEffect, useState } from "react";

/** Estado persistido no navegador (sem conta, sem servidor). Tolerante a falhas. */
export function useLocalState<T>(key: string, initial: T, validate: (raw: unknown) => T | null) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const parsed = validate(JSON.parse(localStorage.getItem(key) ?? "null"));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única do armazenamento local
      if (parsed !== null) setValue(parsed);
    } catch {
      // ignora dados corrompidos
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carregar apenas uma vez
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // armazenamento indisponível
    }
  }, [key, value, loaded]);

  return [value, setValue] as const;
}
