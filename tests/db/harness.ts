/**
 * Harness de banco para testes de migrações e RLS sem Docker.
 *
 * Usa PGlite (PostgreSQL 17 compilado para WebAssembly) e cria stubs mínimos
 * dos esquemas que o Supabase fornece (auth, realtime, storage), reproduzindo
 * o comportamento relevante para os testes:
 *   - auth.uid() lê o claim "sub" do JWT, como no Supabase;
 *   - papéis anon / authenticated / service_role;
 *   - realtime.send grava em realtime.messages e realtime.topic() lê o tópico.
 *
 * Limitação conhecida: PGlite tem uma única conexão, então disputas
 * verdadeiramente simultâneas (dois profissionais no mesmo milissegundo) são
 * testadas de forma sequencial. O bloqueio FOR UPDATE garante a serialização
 * no PostgreSQL real.
 */
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

const SUPABASE_STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  is_anonymous boolean not null default false,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  ), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema realtime;
create table realtime.messages (
  id bigserial primary key,
  topic text not null,
  extension text not null default 'broadcast',
  event text,
  payload jsonb,
  private boolean not null default true,
  inserted_at timestamptz not null default now()
);
create function realtime.topic() returns text language sql stable as $$
  select current_setting('realtime.topic', true)
$$;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language sql security definer as $$
  insert into realtime.messages (topic, event, payload, private) values (topic, event, payload, private)
$$;
alter table realtime.messages enable row level security;
grant usage on schema realtime to anon, authenticated, service_role;
grant select on realtime.messages to authenticated;
grant execute on function realtime.topic() to anon, authenticated;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
  name text, owner uuid
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;

-- Privilégios padrão concedidos pelo Supabase em projetos novos.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export type Role = "anon" | "authenticated" | "service_role";
export type Db = PGlite;
export type Tx = Transaction;

export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);

  const migrationsDir = path.join(ROOT, "supabase", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
    } catch (error) {
      throw new Error(`Falha ao aplicar ${file}: ${(error as Error).message}`);
    }
  }
  await db.exec(readFileSync(path.join(ROOT, "supabase", "seed.sql"), "utf8"));
  return db;
}

/** Executa `fn` como um papel/usuário, dentro de uma transação. */
export async function as<T>(
  db: PGlite,
  identity: { role: Role; uid?: string; topic?: string },
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [identity.uid ?? ""]);
    await tx.query("select set_config('realtime.topic', $1, true)", [identity.topic ?? ""]);
    await tx.exec(`set local role ${identity.role}`);
    return fn(tx);
  });
}

export async function createAuthUser(
  db: PGlite,
  opts: { email?: string; anonymous?: boolean; metadata?: Record<string, unknown> } = {},
): Promise<string> {
  const res = await db.query<{ id: string }>(
    "insert into auth.users (email, is_anonymous, raw_user_meta_data) values ($1, $2, $3) returning id",
    [opts.email ?? null, opts.anonymous ?? !opts.email, JSON.stringify(opts.metadata ?? {})],
  );
  return res.rows[0]!.id;
}

export async function createStaff(
  db: PGlite,
  opts: {
    roles: ("superadmin" | "admin" | "psychologist")[];
    verified?: boolean;
    available?: boolean;
    name?: string;
  },
): Promise<string> {
  const id = await createAuthUser(db, { email: `${crypto.randomUUID()}@equipe.test` });
  const name = opts.name ?? "Profissional";
  await db.query(
    `insert into public.staff_profiles
       (user_id, full_name, display_name, professional_title, professional_registry,
        credential_status, availability, last_seen_at)
     values ($1, $2, $3, $4, $5, $6, $7, now())`,
    [
      id,
      `${name} Teste`,
      name,
      opts.roles.includes("psychologist") ? "Psicóloga" : null,
      opts.roles.includes("psychologist") ? "CRP 00/000000" : null,
      opts.verified === false ? "pending" : "verified",
      opts.available ? "available" : "offline",
    ],
  );
  for (const role of opts.roles) {
    await db.query("insert into public.staff_roles (user_id, role) values ($1, $2)", [id, role]);
  }
  return id;
}
