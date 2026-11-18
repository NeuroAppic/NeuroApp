-- =============================================================================
-- Contas de psicólogos criadas diretamente pelo administrador.
--
-- Substitui o autocadastro (20261106000100) e a validação de credencial:
--   * não existe mais registro profissional (CRP) nem credencial pendente;
--   * psicólogo = conta da equipe ATIVA com o papel 'psychologist';
--   * só administradores criam contas da equipe (admin_register_staff);
--   * o gatilho de novos usuários volta a criar apenas o perfil do portal —
--     metadados enviados por quem se cadastra nunca viram conta da equipe.
-- =============================================================================

-- Novos usuários do Auth: só perfil e preferências do portal.
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

-- Profissional clínico: conta ativa com papel de psicólogo.
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
      and sr.role = 'psychologist'
  );
$$;

create or replace function public.available_clinicians_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.staff_profiles sp
  where sp.availability = 'available'
    and sp.is_active
    and sp.last_seen_at > now() - interval '3 minutes'
    and exists (
      select 1 from public.staff_roles r where r.user_id = sp.user_id and r.role = 'psychologist'
    );
$$;

-- A validação manual de credencial deixa de existir.
drop function if exists public.admin_set_credential_status(uuid, public.credential_status);

-- Registro da conta da equipe, chamado com a sessão do administrador depois que
-- o servidor criou o usuário (já confirmado) no Auth.
drop function if exists public.admin_register_staff(uuid, text, text, text, text, public.staff_role[]);
create or replace function public.admin_register_staff(
  p_user_id uuid,
  p_display_name text,
  p_roles public.staff_role[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.staff_role;
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_roles is null or cardinality(p_roles) = 0 then
    raise exception 'roles_required' using errcode = '22023';
  end if;
  if ('superadmin' = any(p_roles) or 'admin' = any(p_roles)) and not public.is_superadmin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;

  insert into public.staff_profiles (user_id, full_name, display_name)
  values (p_user_id, v_name, v_name);

  foreach v_role in array p_roles loop
    insert into public.staff_roles (user_id, role, granted_by) values (p_user_id, v_role, v_uid)
    on conflict do nothing;
  end loop;

  perform public.write_audit('staff.register', 'staff', p_user_id, jsonb_build_object('roles', to_jsonb(p_roles)));
end;
$$;

drop function if exists public.admin_update_staff_profile(uuid, text, text, text, text);
create or replace function public.admin_update_staff_profile(
  p_user_id uuid,
  p_display_name text,
  p_professional_title text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if not (public.is_admin() or p_user_id = (select auth.uid())) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 60 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;
  update public.staff_profiles
     set full_name = v_name,
         display_name = v_name,
         professional_title = nullif(btrim(coalesce(p_professional_title, '')), '')
   where user_id = p_user_id;
  if not found then
    raise exception 'staff_not_found' using errcode = 'P0002';
  end if;
  perform public.write_audit('staff.update_profile', 'staff', p_user_id);
end;
$$;

create or replace function public.admin_set_roles(p_user_id uuid, p_roles public.staff_role[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role public.staff_role;
  v_current public.staff_role[];
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_roles is null or cardinality(p_roles) = 0 then
    raise exception 'roles_required' using errcode = '22023';
  end if;
  select coalesce(array_agg(role), '{}') into v_current from public.staff_roles where user_id = p_user_id;

  -- Apenas superadministradores mexem em papéis administrativos.
  if not public.is_superadmin() and (
       'superadmin' = any(p_roles) or 'admin' = any(p_roles)
       or 'superadmin' = any(v_current) or 'admin' = any(v_current)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Não remover o último superadministrador.
  if 'superadmin' = any(v_current) and not ('superadmin' = any(p_roles))
     and (select count(*) from public.staff_roles where role = 'superadmin') <= 1 then
    raise exception 'last_superadmin' using errcode = 'P0001';
  end if;

  delete from public.staff_roles where user_id = p_user_id and not (role = any(p_roles));
  foreach v_role in array p_roles loop
    insert into public.staff_roles (user_id, role, granted_by) values (p_user_id, v_role, v_uid)
    on conflict do nothing;
  end loop;

  perform public.write_audit('staff.set_roles', 'staff', p_user_id,
    jsonb_build_object('from', to_jsonb(v_current), 'to', to_jsonb(p_roles)));
end;
$$;

-- Métricas: a contagem de credenciais pendentes sai; o resto é igual.
create or replace function public.dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text := coalesce(public.setting('public.locale') ->> 'timezone', 'America/Sao_Paulo');
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with active as (
    select m.sender_user_id as uid, max(m.created_at) as last_at
    from public.messages m
    where m.sender = 'user' and m.created_at > now() - interval '30 days'
    group by m.sender_user_id
  ),
  active_typed as (
    select a.*, coalesce(u.is_anonymous, true) as is_anonymous
    from active a left join auth.users u on u.id = a.uid
  )
  select jsonb_build_object(
    'generated_at', now(),
    'active_users', jsonb_build_object(
      'now', (select count(*) from active_typed where last_at > now() - interval '5 minutes'),
      'last_24h', (select count(*) from active_typed where last_at > now() - interval '24 hours'),
      'last_7d', (select count(*) from active_typed where last_at > now() - interval '7 days'),
      'last_30d', (select count(*) from active_typed),
      'last_30d_visitors', (select count(*) from active_typed where is_anonymous),
      'last_30d_registered', (select count(*) from active_typed where not is_anonymous)
    ),
    'conversations', jsonb_build_object(
      'started_24h', (select count(*) from public.conversations where created_at > now() - interval '24 hours'),
      'started_7d', (select count(*) from public.conversations where created_at > now() - interval '7 days'),
      'started_30d', (select count(*) from public.conversations where created_at > now() - interval '30 days'),
      'in_progress', (select count(*) from public.conversations where status in ('ai_active', 'waiting_human', 'human_active')),
      'waiting_human', (select count(*) from public.conversations where status = 'waiting_human'),
      'human_active', (select count(*) from public.conversations where status = 'human_active'),
      'priority_open', (select count(*) from public.conversations where priority and status in ('ai_active', 'waiting_human')),
      'closed_30d', (select count(*) from public.conversations where closed_at > now() - interval '30 days'),
      'human_sessions_closed_30d', (select count(*) from public.conversation_assignments
                                    where release_reason = 'closed' and released_at > now() - interval '30 days')
    ),
    'staff', jsonb_build_object(
      'available_clinicians', public.available_clinicians_count(),
      'active_clinicians', (select count(*) from public.staff_profiles sp
                            join public.staff_roles r on r.user_id = sp.user_id and r.role = 'psychologist'
                            where sp.is_active)
    ),
    'ai', jsonb_build_object(
      'requests_24h', (select count(*) from public.ai_usage where created_at > now() - interval '24 hours'),
      'requests_7d', (select count(*) from public.ai_usage where created_at > now() - interval '7 days'),
      'errors_24h', (select count(*) from public.ai_usage where created_at > now() - interval '24 hours'
                     and outcome in ('error', 'timeout')),
      'tokens_24h', (select coalesce(sum(input_tokens + output_tokens), 0) from public.ai_usage
                     where created_at > now() - interval '24 hours'),
      'tokens_30d', (select coalesce(sum(input_tokens + output_tokens), 0) from public.ai_usage
                     where created_at > now() - interval '30 days')
    ),
    'usage_by_hour_7d', (
      select jsonb_agg(coalesce(x.n, 0) order by h.hour)
      from generate_series(0, 23) as h(hour)
      left join (
        select extract(hour from (m.created_at at time zone v_tz))::integer as hour, count(*) as n
        from public.messages m
        where m.sender = 'user' and m.created_at > now() - interval '7 days'
        group by 1
      ) x on x.hour = h.hour
    ),
    'conversations_by_day_14d', (
      select jsonb_agg(jsonb_build_object('day', d.day::date, 'count', coalesce(x.n, 0)) order by d.day)
      from generate_series(
        (now() at time zone v_tz)::date - 13, (now() at time zone v_tz)::date, interval '1 day'
      ) as d(day)
      left join (
        select (c.created_at at time zone v_tz)::date as day, count(*) as n
        from public.conversations c
        where c.created_at > now() - interval '15 days'
        group by 1
      ) x on x.day = d.day::date
    ),
    'pending_deletion_requests', (select count(*) from public.deletion_requests where status = 'pending')
  ) into v_result;

  return v_result;
end;
$$;

-- Remove de vez o registro profissional e o estado da credencial.
alter table public.staff_profiles
  drop column if exists professional_registry,
  drop column if exists credential_status,
  drop column if exists credential_verified_by,
  drop column if exists credential_verified_at;
drop type if exists public.credential_status;

-- Permissões das funções recriadas (privilégios padrão do esquema estão revogados).
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.admin_register_staff(uuid, text, public.staff_role[]) from public, anon;
revoke execute on function public.admin_update_staff_profile(uuid, text, text) from public, anon;
grant execute on function public.admin_register_staff(uuid, text, public.staff_role[]) to authenticated, service_role;
grant execute on function public.admin_update_staff_profile(uuid, text, text) to authenticated, service_role;
grant execute on function public.is_clinician(uuid) to authenticated, service_role;
grant execute on function public.available_clinicians_count() to anon, authenticated, service_role;
grant execute on function public.admin_set_roles(uuid, public.staff_role[]) to authenticated, service_role;
grant execute on function public.dashboard_metrics() to authenticated, service_role;
