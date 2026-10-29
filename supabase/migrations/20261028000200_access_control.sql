-- =============================================================================
-- Controle de acesso: funções auxiliares, privilégios e Row Level Security.
--
-- Princípios:
--   * Separação entre gestão técnica e conteúdo clínico: "admin" e "superadmin"
--     NÃO leem mensagens. Apenas "psychologist" com credencial verificada e
--     conta ativa acessa conteúdo, e só de conversas elegíveis.
--   * Toda escrita sensível acontece por funções SECURITY DEFINER que validam
--     o chamador, aplicam a máquina de estados e registram auditoria.
--   * O portal nunca escreve diretamente em conversations/messages.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Funções auxiliares (SECURITY DEFINER para evitar recursão de RLS)
-- ---------------------------------------------------------------------------
create or replace function public.try_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.has_staff_role(p_role public.staff_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    join public.staff_roles sr on sr.user_id = sp.user_id
    where sp.user_id = (select auth.uid())
      and sp.is_active
      and sr.role = p_role
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    join public.staff_roles sr on sr.user_id = sp.user_id
    where sp.user_id = (select auth.uid()) and sp.is_active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_staff_role('admin') or public.has_staff_role('superadmin');
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_staff_role('superadmin');
$$;

-- Profissional clínico habilitado: papel de psicólogo, conta ativa e credencial validada.
create or replace function public.is_clinician(p_user uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    join public.staff_roles sr on sr.user_id = sp.user_id
    where sp.user_id = coalesce(p_user, (select auth.uid()))
      and sp.is_active
      and sp.credential_status = 'verified'
      and sr.role = 'psychologist'
  );
$$;

-- Quem pode ler o CONTEÚDO de uma conversa:
--   * a própria pessoa;
--   * profissional clínico, se a conversa estiver na fila (waiting_human),
--     sinalizada como prioritária e ativa, atribuída a ele, ou se ele já a atendeu.
create or replace function public.can_access_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (
        (c.user_id is not null and c.user_id = (select auth.uid()))
        or (
          public.is_clinician()
          and (
            c.assigned_staff_id = (select auth.uid())
            or c.status = 'waiting_human'
            or (c.priority and c.status = 'ai_active')
            or exists (
              select 1 from public.conversation_assignments a
              where a.conversation_id = c.id and a.staff_id = (select auth.uid())
            )
          )
        )
      )
  );
$$;

create or replace function public.write_audit(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_kind text;
begin
  if v_uid is null then
    v_kind := 'system';
  elsif public.is_staff() then
    v_kind := 'staff';
  else
    v_kind := 'user';
  end if;
  insert into public.audit_logs (actor_id, actor_kind, action, target_type, target_id, metadata)
  values (v_uid, v_kind, p_action, p_target_type, p_target_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Perfil criado automaticamente para cada usuário do Auth (inclusive anônimos)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Privilégios de tabela/coluna (camada anterior ao RLS)
-- ---------------------------------------------------------------------------
-- O Supabase concede privilégios amplos por padrão a anon/authenticated.
-- Revertemos e concedemos apenas o necessário.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Permissões de execução de funções: ver 20261028000600_function_grants.sql

grant select, update (display_name, last_seen_at) on public.profiles to authenticated;
grant select, insert, update on public.user_preferences to authenticated;
grant select on public.staff_profiles to authenticated;
grant select on public.staff_roles to authenticated;
grant select on public.consent_records to authenticated;
grant select on public.conversations to authenticated;
-- sender_user_id fica fora: o portal não vê o identificador interno de quem respondeu.
grant select (
  id, conversation_id, sender, sender_label, content, client_message_id, input_source,
  reply_to_id, created_at
) on public.messages to authenticated;
grant select on public.conversation_assignments to authenticated;
grant select on public.conversation_events to authenticated;
grant select on public.human_support_requests to authenticated;
grant select on public.quick_messages to anon, authenticated;
grant select on public.audio_tracks to anon, authenticated;
grant insert, update, delete on public.audio_tracks to authenticated;
grant insert, update, delete on public.quick_messages to authenticated;
grant select on public.app_settings to anon, authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.ai_usage to authenticated;
grant select on public.deletion_requests to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.staff_roles enable row level security;
alter table public.consent_records enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_assignments enable row level security;
alter table public.conversation_events enable row level security;
alter table public.human_support_requests enable row level security;
alter table public.quick_messages enable row level security;
alter table public.audio_tracks enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ai_usage enable row level security;
alter table public.deletion_requests enable row level security;

-- profiles
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- user_preferences
create policy prefs_select_own on public.user_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy prefs_insert_own on public.user_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy prefs_update_own on public.user_preferences
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- staff_profiles / staff_roles: equipe ativa vê a equipe; mutações só por funções auditadas.
create policy staff_profiles_select on public.staff_profiles
  for select to authenticated using (user_id = (select auth.uid()) or public.is_staff());
create policy staff_roles_select on public.staff_roles
  for select to authenticated using (user_id = (select auth.uid()) or public.is_staff());

-- consent_records
create policy consents_select_own on public.consent_records
  for select to authenticated using (user_id = (select auth.uid()));

-- conversations: metadados (sem conteúdo). Administradores gerenciam filas, mas não leem mensagens.
create policy conversations_select on public.conversations
  for select to authenticated using (
    user_id = (select auth.uid())
    or public.is_admin()
    or public.can_access_conversation(id)
  );

-- messages: somente quem pode acessar o conteúdo.
create policy messages_select on public.messages
  for select to authenticated using (public.can_access_conversation(conversation_id));

-- conversation_assignments / events / requests: equipe autorizada.
create policy assignments_select on public.conversation_assignments
  for select to authenticated using (
    public.is_admin()
    or staff_id = (select auth.uid())
    or (public.is_clinician() and public.can_access_conversation(conversation_id))
  );
create policy events_select on public.conversation_events
  for select to authenticated using (
    public.is_admin() or (public.is_clinician() and public.can_access_conversation(conversation_id))
  );
create policy support_requests_select on public.human_support_requests
  for select to authenticated using (
    public.is_admin()
    or public.can_access_conversation(conversation_id)
  );

-- quick_messages: leitura pública das ativas; administração por admins.
create policy quick_messages_select on public.quick_messages
  for select to anon, authenticated using (is_active or public.is_admin());
create policy quick_messages_admin_write on public.quick_messages
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- audio_tracks: publicados são públicos; admins veem e editam tudo.
create policy audio_select on public.audio_tracks
  for select to anon, authenticated using (is_published or public.is_admin());
create policy audio_admin_insert on public.audio_tracks
  for insert to authenticated with check (public.is_admin());
create policy audio_admin_update on public.audio_tracks
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy audio_admin_delete on public.audio_tracks
  for delete to authenticated using (public.is_admin());

-- app_settings: chaves públicas para todos; demais para administradores. Escrita via função.
create policy settings_select on public.app_settings
  for select to anon, authenticated using (key like 'public.%' or public.is_admin());

-- audit_logs: apenas superadministrador.
create policy audit_select on public.audit_logs
  for select to authenticated using (public.is_superadmin());

-- ai_usage: administradores (metadados agregáveis, sem conteúdo).
create policy ai_usage_select on public.ai_usage
  for select to authenticated using (public.is_admin());

-- deletion_requests: a própria pessoa e administradores.
create policy deletion_requests_select on public.deletion_requests
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
