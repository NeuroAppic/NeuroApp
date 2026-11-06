#!/usr/bin/env node
/**
 * Cria o PRIMEIRO superadministrador. Rode no seu terminal (nunca em CI público):
 *
 *   node --env-file=.env.local scripts/create-superadmin.mjs admin@exemplo.org "Nome Completo" "Nome exibido"
 *
 * - Se o e-mail ainda não tem conta, a senha é digitada aqui (não aparece na tela)
 *   e a conta é criada já confirmada — não depende de envio de e-mail.
 * - Se o e-mail já tem conta (ex.: criada em /dashboard/cadastro), ela é promovida.
 * - O banco recusa a operação se já existir um superadministrador
 *   (função bootstrap_superadmin), então não serve para escalar privilégios.
 */
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";

const [email, fullName, displayName] = process.argv.slice(2);
if (!email || !fullName) {
  console.error('Uso: node --env-file=.env.local scripts/create-superadmin.mjs <email> "<nome completo>" ["<nome exibido>"]');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY em .env.local.");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

/** Lê a senha sem mostrar os caracteres digitados. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => {
      if (text.includes(question)) process.stdout.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function findUserByEmail(target) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

let user = await findUserByEmail(email);
if (user) {
  console.log("Conta existente encontrada: ela será promovida a superadministrador.");
} else {
  const password = await askHidden("Crie uma senha (mínimo 12 caracteres): ");
  const again = await askHidden("Repita a senha: ");
  if (password.length < 12 || password !== again) {
    console.error("As senhas não conferem ou têm menos de 12 caracteres.");
    process.exit(1);
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    console.error("Falha ao criar a conta:", error?.message);
    process.exit(1);
  }
  user = data.user;
}

const { error } = await admin.rpc("bootstrap_superadmin", {
  p_user_id: user.id,
  p_full_name: fullName,
  p_display_name: displayName ?? fullName.split(" ")[0],
});
if (error) {
  console.error("Falha ao registrar superadministrador:", error.message);
  process.exit(1);
}

console.log(`Pronto: ${email} é superadministrador. Entre em /dashboard/entrar e ative a verificação em duas etapas em /dashboard/conta.`);
