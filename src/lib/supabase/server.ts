import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabasePublicConfig, SupabaseNotConfiguredError } from "./config";

/**
 * Cliente Supabase do servidor, autenticado com a sessão (cookies) da pessoa.
 * Respeita RLS. Use em Server Components, Route Handlers e Server Actions.
 */
export async function getServerSupabase(): Promise<SupabaseClient> {
  const config = getSupabasePublicConfig();
  if (!config) throw new SupabaseNotConfiguredError();
  const cookieStore = await cookies();

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components não podem gravar cookies; o proxy renova a sessão.
        }
      },
    },
  });
}
