"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig, SupabaseNotConfiguredError } from "./config";

let browserClient: SupabaseClient | null = null;

/** Cliente do navegador (singleton). Respeita RLS; nunca usa credenciais secretas. */
export function getBrowserSupabase(): SupabaseClient {
  if (browserClient) return browserClient;
  const config = getSupabasePublicConfig();
  if (!config) throw new SupabaseNotConfiguredError();
  browserClient = createBrowserClient(config.url, config.key);
  return browserClient;
}

/**
 * Garante uma sessão para o portal. Se não houver, cria uma sessão anônima
 * (Supabase Auth). Chamado apenas depois que a pessoa leu o aviso do chat.
 */
export async function ensureVisitorSession(): Promise<string> {
  const supabase = getBrowserSupabase();
  const { data } = await supabase.auth.getUser();
  if (data.user) return data.user.id;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error || !anon.user) {
    throw new Error("Não foi possível iniciar uma sessão de visitante.");
  }
  return anon.user.id;
}
