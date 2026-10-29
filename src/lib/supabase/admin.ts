import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

/**
 * Cliente com a chave secreta (service_role). Ignora RLS.
 * Uso restrito a operações do servidor que já validaram o chamador:
 * gravar mensagens da pessoa/IA, gerar URLs assinadas, convidar equipe,
 * excluir contas. NUNCA importe este módulo em código de cliente.
 */
export function getAdminSupabase(): SupabaseClient {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) {
    throw new Error("SUPABASE_SECRET_KEY não configurada (ver .env.example).");
  }
  adminClient = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}
