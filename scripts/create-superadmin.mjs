#!/usr/bin/env node
/**
 * Cria o PRIMEIRO superadministrador com segurança.
 *
 * Uso (no seu terminal, nunca em CI público):
 *   node --env-file=.env.local scripts/create-superadmin.mjs admin@exemplo.org "Nome Completo" "Nome exibido"
 *
 * - Usa a chave secreta do Supabase (SUPABASE_SECRET_KEY) apenas localmente.
 * - Envia um convite por e-mail: a senha é definida pela própria pessoa.
 * - O banco recusa a operação se já existir um superadministrador
 *   (função bootstrap_superadmin), então não serve para escalar privilégios.
 */
import { createClient } from "@supabase/supabase-js";

const [email, fullName, displayName] = process.argv.slice(2);
if (!email || !fullName) {
  console.error('Uso: node --env-file=.env.local scripts/create-superadmin.mjs <email> "<nome completo>" ["<nome exibido>"]');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
if (!url || !secret) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
  redirectTo: `${site}/auth/confirm?next=/dashboard/conta`,
});
if (inviteError || !invited.user) {
  console.error("Falha ao convidar:", inviteError?.message);
  process.exit(1);
}

const { error } = await admin.rpc("bootstrap_superadmin", {
  p_user_id: invited.user.id,
  p_full_name: fullName,
  p_display_name: displayName ?? fullName.split(" ")[0],
});
if (error) {
  await admin.auth.admin.deleteUser(invited.user.id);
  console.error("Falha ao registrar superadministrador:", error.message);
  process.exit(1);
}

console.log(`Convite enviado para ${email}. Após definir a senha, ative a verificação em duas etapas em /dashboard/conta.`);
