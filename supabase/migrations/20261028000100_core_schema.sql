-- =============================================================================
-- Acolher — esquema principal
-- Convenções:
--   * UUID em todas as entidades de domínio; bigint identity em logs append-only.
--   * timestamptz sempre em UTC (default now()).
--   * Nenhuma tabela exposta fica sem RLS (habilitada na migração seguinte).
--   * Conteúdo sensível (mensagens) só existe em public.messages.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.conversation_status as enum (
  'ai_active',      -- assistente virtual responde
  'waiting_human',  -- pessoa pediu atendimento humano; IA continua disponível até alguém assumir
  'human_active',   -- profissional assumiu; IA bloqueada
  'closed',         -- encerrada (pela pessoa ou pelo profissional)
  'archived'        -- encerrada e fora das filas operacionais
);

create type public.message_sender as enum ('user', 'ai', 'staff', 'system');
create type public.message_input_source as enum ('typed', 'quick', 'guided');
create type public.staff_role as enum ('superadmin', 'admin', 'psychologist');
create type public.staff_availability as enum ('offline', 'available', 'busy', 'away');
create type public.credential_status as enum ('pending', 'verified', 'rejected');
-- A ordem importa: greatest() compara enums pela ordem de declaração.
create type public.risk_level as enum ('none', 'attention', 'high', 'critical');
create type public.support_request_status as enum ('open', 'claimed', 'cancelled');
create type public.support_request_reason as enum ('user_request', 'risk_detected');
create type public.audio_category as enum (
  'brown_noise', 'white_noise', 'pink_noise', 'rain', 'nature', 'fan', 'water', 'ambient'
);
create type public.deletion_request_status as enum ('pending', 'completed', 'rejected');

-- ---------------------------------------------------------------------------
-- Utilitário de updated_at
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Perfis de usuários do portal (inclui visitantes anônimos do Supabase Auth)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
comment on table public.profiles is 'Dados mínimos de quem usa o portal. Nenhum diagnóstico é solicitado.';

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create table public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  low_stimulus boolean not null default false,
  reduce_motion boolean not null default false,
  text_scale numeric(3, 2) not null default 1.00 check (text_scale between 0.9 and 1.6),
  reduce_decor boolean not null default false,
  short_answers boolean not null default false,
  literal_communication boolean not null default false,
  sounds_enabled boolean not null default true,
  reduce_notifications boolean not null default false,
  -- A pessoa decide se as preferências de comunicação aparecem para o profissional.
  share_with_professionals boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger user_preferences_touch before update on public.user_preferences
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Equipe
-- ---------------------------------------------------------------------------
create table public.staff_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  -- Nome exibido para quem é atendido (ex.: "Ana").
  display_name text not null check (char_length(display_name) between 2 and 60),
  professional_title text check (professional_title is null or char_length(professional_title) <= 60),
  -- Registro profissional (ex.: CRP 06/123456). Obrigatório para psicólogos (validado em função).
  professional_registry text check (professional_registry is null or char_length(professional_registry) <= 40),
  credential_status public.credential_status not null default 'pending',
  credential_verified_by uuid references auth.users (id) on delete set null,
  credential_verified_at timestamptz,
  is_active boolean not null default true,
  availability public.staff_availability not null default 'offline',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger staff_profiles_touch before update on public.staff_profiles
  for each row execute function public.touch_updated_at();

create table public.staff_roles (
  user_id uuid not null references public.staff_profiles (user_id) on delete cascade,
  role public.staff_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ---------------------------------------------------------------------------
-- Consentimentos (append-only)
-- ---------------------------------------------------------------------------
create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  consent_type text not null check (consent_type in ('chat_terms', 'account_terms')),
  policy_version text not null check (char_length(policy_version) <= 20),
  granted boolean not null,
  created_at timestamptz not null default now()
);
create index consent_records_user_idx on public.consent_records (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Conversas e mensagens
-- ---------------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- Nulo apenas quando a conta foi excluída e a conversa está sob retenção obrigatória (pseudonimizada).
  user_id uuid references public.profiles (id) on delete set null,
  status public.conversation_status not null default 'ai_active',
  -- Incrementado a cada mudança de estado. Respostas de IA só são gravadas se a versão não mudou.
  state_version integer not null default 0,
  assigned_staff_id uuid references public.staff_profiles (user_id) on delete set null,
  -- Rótulo do profissional mostrado à pessoa (snapshot no momento em que assumiu).
  assigned_label text,
  risk_level public.risk_level not null default 'none',
  priority boolean not null default false,
  legal_hold boolean not null default false,
  legal_hold_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint human_active_requires_staff check (status <> 'human_active' or assigned_staff_id is not null)
);

create trigger conversations_touch before update on public.conversations
  for each row execute function public.touch_updated_at();

create index conversations_user_idx on public.conversations (user_id, created_at desc);
create index conversations_queue_idx on public.conversations (status, priority desc, last_message_at)
  where status in ('ai_active', 'waiting_human', 'human_active');
create index conversations_assigned_idx on public.conversations (assigned_staff_id)
  where assigned_staff_id is not null;
create index conversations_last_message_idx on public.conversations (last_message_at);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender public.message_sender not null,
  -- Autor humano (pessoa ou profissional). Não é exposto ao portal (ver privilégios de coluna).
  sender_user_id uuid references auth.users (id) on delete set null,
  -- Rótulo exibido para mensagens de profissionais (ex.: "Ana · Psicóloga").
  sender_label text,
  content text not null check (char_length(content) between 1 and 4000),
  -- Chave de idempotência gerada pelo cliente: reenvios não duplicam mensagens.
  client_message_id uuid,
  input_source public.message_input_source,
  -- Para respostas da IA: a mensagem da pessoa que está sendo respondida.
  reply_to_id uuid references public.messages (id) on delete cascade,
  risk_level public.risk_level,
  ai_provider text,
  ai_model text,
  created_at timestamptz not null default now(),
  constraint messages_client_id_unique unique (conversation_id, client_message_id),
  constraint ai_messages_reply check (sender <> 'ai' or reply_to_id is not null)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_created_idx on public.messages (created_at);
-- No máximo uma resposta da IA por mensagem da pessoa.
create unique index messages_one_ai_reply_idx on public.messages (reply_to_id) where sender = 'ai';

create table public.conversation_assignments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  staff_id uuid references public.staff_profiles (user_id) on delete set null,
  assigned_at timestamptz not null default now(),
  released_at timestamptz,
  release_reason text check (
    release_reason is null
    or release_reason in ('closed', 'transferred', 'returned_to_ai', 'staff_deactivated')
  )
);
create index conversation_assignments_conv_idx on public.conversation_assignments (conversation_id);
create index conversation_assignments_staff_idx on public.conversation_assignments (staff_id, assigned_at desc);
-- Apenas uma atribuição ativa por conversa.
create unique index conversation_assignments_active_idx
  on public.conversation_assignments (conversation_id) where released_at is null;

-- Eventos de ciclo de vida. Nunca armazenam conteúdo de mensagens.
create table public.conversation_events (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  event_type text not null check (char_length(event_type) <= 60),
  from_status public.conversation_status,
  to_status public.conversation_status,
  actor_type text not null check (actor_type in ('user', 'staff', 'system')),
  actor_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index conversation_events_conv_idx on public.conversation_events (conversation_id, created_at);
create index conversation_events_type_idx on public.conversation_events (event_type, created_at);

create table public.human_support_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  status public.support_request_status not null default 'open',
  reason public.support_request_reason not null,
  priority boolean not null default false,
  claimed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
-- Impede pedidos duplicados abertos para a mesma conversa.
create unique index human_support_requests_open_idx
  on public.human_support_requests (conversation_id) where status = 'open';
create index human_support_requests_created_idx on public.human_support_requests (created_at);

-- ---------------------------------------------------------------------------
-- Conteúdo configurável
-- ---------------------------------------------------------------------------
create table public.quick_messages (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('essenciais', 'sentimentos', 'pedidos')),
  label text not null check (char_length(label) between 1 and 80),
  message text not null check (char_length(message) between 1 and 200),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint quick_messages_label_unique unique (category, label)
);
create index quick_messages_order_idx on public.quick_messages (category, sort_order);

create table public.audio_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  description text check (description is null or char_length(description) <= 240),
  category public.audio_category not null,
  storage_path text check (storage_path is null or char_length(storage_path) <= 300),
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes > 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  -- Registros demonstrativos tocam sons gerados no navegador (sem arquivo).
  is_demo boolean not null default false,
  demo_generator text check (
    demo_generator is null or demo_generator in ('white', 'pink', 'brown', 'rain', 'fan', 'water', 'wind')
  ),
  color text not null default '#9CB4A0' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon text not null default 'waves' check (char_length(icon) <= 30),
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint audio_source_present check (
    (is_demo and demo_generator is not null and storage_path is null)
    or (not is_demo and storage_path is not null)
  )
);
create index audio_tracks_order_idx on public.audio_tracks (is_published, sort_order);
create unique index audio_tracks_demo_title_idx on public.audio_tracks (title) where is_demo;

create trigger audio_tracks_touch before update on public.audio_tracks
  for each row execute function public.touch_updated_at();

create table public.app_settings (
  key text primary key check (key ~ '^[a-z0-9_.]+$'),
  value jsonb not null,
  description text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
comment on column public.app_settings.key is 'Chaves com prefixo "public." podem ser lidas pelo portal.';

create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Observabilidade e conformidade
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_kind text not null check (actor_kind in ('user', 'staff', 'system')),
  action text not null check (char_length(action) <= 80),
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id);

-- Uso da IA: apenas metadados (sem conteúdo), para custos, limites e métricas.
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  latency_ms integer not null default 0,
  outcome text not null check (outcome in ('ok', 'error', 'timeout', 'discarded', 'rate_limited')),
  created_at timestamptz not null default now()
);
create index ai_usage_created_idx on public.ai_usage (created_at);
create index ai_usage_user_idx on public.ai_usage (user_id, created_at);

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  -- Mantido como referência simples (sem FK) para sobreviver à exclusão da conta.
  user_id uuid,
  scope text not null check (scope in ('conversation', 'account')),
  conversation_id uuid references public.conversations (id) on delete set null,
  status public.deletion_request_status not null default 'pending',
  pending_reason text,
  reviewed_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
create index deletion_requests_status_idx on public.deletion_requests (status, requested_at);
