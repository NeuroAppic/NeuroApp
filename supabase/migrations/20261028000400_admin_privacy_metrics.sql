-- =============================================================================
-- Administração da equipe, privacidade (LGPD), métricas e retenção.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Gestão da equipe (sempre auditada)
-- ---------------------------------------------------------------------------

-- Registra um profissional depois que o servidor criou/convidou o usuário no Auth.
-- Chamado com a sessão do administrador (auth.uid() = administrador).
create or replace function public.admin_register_staff(
  p_user_id uuid,
  p_full_name text,
  p_display_name text,
  p_professional_title text,
  p_professional_registry text,
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
  if 'psychologist' = any(p_roles) and coalesce(btrim(p_professional_registry), '') = '' then
    raise exception 'registry_required' using errcode = '22023';
  end if;

  insert into public.staff_profiles (user_id, full_name, display_name, professional_title, professional_registry)
  values (p_user_id, btrim(p_full_name), btrim(p_display_name), nullif(btrim(p_professional_title), ''),
          nullif(btrim(p_professional_registry), ''));

  foreach v_role in array p_roles loop
    insert into public.staff_roles (user_id, role, granted_by) values (p_user_id, v_role, v_uid)
    on conflict do nothing;
  end loop;

  perform public.write_audit('staff.register', 'staff', p_user_id, jsonb_build_object('roles', to_jsonb(p_roles)));
end;
$$;

create or replace function public.admin_update_staff_profile(
  p_user_id uuid,
  p_full_name text,
  p_display_name text,
  p_professional_title text,
  p_professional_registry text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_registry text;
begin
  if not (public.is_admin() or p_user_id = (select auth.uid())) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select professional_registry into v_old_registry from public.staff_profiles where user_id = p_user_id;
  if not found then
    raise exception 'staff_not_found' using errcode = 'P0002';
  end if;

  update public.staff_profiles
     set full_name = btrim(p_full_name),
         display_name = btrim(p_display_name),
         professional_title = nullif(btrim(p_professional_title), ''),
         professional_registry = nullif(btrim(p_professional_registry), ''),
         -- Alterar o registro profissional exige nova validação administrativa.
         credential_status = case
           when nullif(btrim(p_professional_registry), '') is distinct from v_old_registry then 'pending'
           else credential_status end
   where user_id = p_user_id;

  perform public.write_audit('staff.update_profile', 'staff', p_user_id);
end;
$$;

create or replace function public.admin_set_credential_status(p_user_id uuid, p_status public.credential_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- Separação de funções: ninguém valida a própria credencial.
  if p_user_id = v_uid then
    raise exception 'self_verification_forbidden' using errcode = '42501';
  end if;

  update public.staff_profiles
     set credential_status = p_status,
         credential_verified_by = case when p_status = 'verified' then v_uid else null end,
         credential_verified_at = case when p_status = 'verified' then now() else null end
   where user_id = p_user_id;
  if not found then
    raise exception 'staff_not_found' using errcode = 'P0002';
  end if;

  perform public.write_audit('staff.credential_status', 'staff', p_user_id, jsonb_build_object('status', p_status));
end;
$$;

-- Desativar um profissional devolve seus atendimentos ativos para a fila.
create or replace function public.admin_set_staff_active(p_user_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conv uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user_id = v_uid then
    raise exception 'cannot_change_self' using errcode = '42501';
  end if;
  if exists (select 1 from public.staff_roles where user_id = p_user_id and role = 'superadmin')
     and not public.is_superadmin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.staff_profiles
     set is_active = p_active,
         availability = case when p_active then availability else 'offline' end
   where user_id = p_user_id;
  if not found then
    raise exception 'staff_not_found' using errcode = 'P0002';
  end if;

  if not p_active then
    for v_conv in
      select id from public.conversations
      where assigned_staff_id = p_user_id and status = 'human_active'
      for update
    loop
      update public.conversation_assignments
         set released_at = now(), release_reason = 'staff_deactivated'
       where conversation_id = v_conv and released_at is null;
      perform public._transition(v_conv, 'waiting_human', 'system', null, 'staff_deactivated');
      update public.conversations set assigned_staff_id = null, assigned_label = null where id = v_conv;
      insert into public.human_support_requests (conversation_id, reason, priority)
      values (v_conv, 'user_request', true)
      on conflict (conversation_id) where status = 'open' do nothing;
      perform public._system_message(v_conv,
        'O profissional que estava com você precisou sair. Seu pedido voltou para a fila de atendimento humano.');
    end loop;
  end if;

  perform public.write_audit(case when p_active then 'staff.activate' else 'staff.deactivate' end, 'staff', p_user_id);
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
  if 'psychologist' = any(p_roles) and not exists (
       select 1 from public.staff_profiles where user_id = p_user_id and professional_registry is not null) then
    raise exception 'registry_required' using errcode = '22023';
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

create or replace function public.admin_update_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_superadmin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.app_settings (key, value, updated_by)
  values (p_key, p_value, (select auth.uid()))
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by;
  perform public.write_audit('settings.update', 'setting', null, jsonb_build_object('key', p_key));
end;
$$;

-- Primeiro superadministrador. Só funciona via service_role e enquanto não houver nenhum.
create or replace function public.bootstrap_superadmin(p_user_id uuid, p_full_name text, p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.staff_roles where role = 'superadmin') then
    raise exception 'superadmin_already_exists' using errcode = 'P0001';
  end if;
  insert into public.staff_profiles (user_id, full_name, display_name)
  values (p_user_id, p_full_name, p_display_name)
  on conflict (user_id) do nothing;
  insert into public.staff_roles (user_id, role) values (p_user_id, 'superadmin');
  insert into public.audit_logs (actor_id, actor_kind, action, target_type, target_id)
  values (null, 'system', 'staff.bootstrap_superadmin', 'staff', p_user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privacidade: exportação e exclusão pela própria pessoa
-- ---------------------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'preferences', (select to_jsonb(up) - 'user_id' from public.user_preferences up where up.user_id = v_uid),
    'consents', (select coalesce(jsonb_agg(to_jsonb(cr) - 'user_id' order by cr.created_at), '[]'::jsonb)
                 from public.consent_records cr where cr.user_id = v_uid),
    'conversations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'status', c.status, 'created_at', c.created_at, 'closed_at', c.closed_at,
        'messages', (select coalesce(jsonb_agg(jsonb_build_object(
                        'sender', m.sender, 'label', m.sender_label, 'content', m.content, 'created_at', m.created_at)
                        order by m.created_at, m.id), '[]'::jsonb)
                     from public.messages m where m.conversation_id = c.id)
      ) order by c.created_at), '[]'::jsonb)
      from public.conversations c where c.user_id = v_uid),
    'deletion_requests', (select coalesce(jsonb_agg(to_jsonb(d) - 'user_id' - 'reviewed_by'), '[]'::jsonb)
                          from public.deletion_requests d where d.user_id = v_uid)
  ) into v_result;

  perform public.write_audit('privacy.export', 'user', v_uid);
  return v_result;
end;
$$;

-- Decide se uma conversa pode ser apagada agora ou precisa ficar retida.
create or replace function public._conversation_retention_reason(p_conversation_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.conversations;
  v_days integer := coalesce((public.setting('retention') ->> 'professional_record_days')::integer, 0);
begin
  select * into c from public.conversations where id = p_conversation_id;
  if c.legal_hold then
    return 'legal_hold';
  end if;
  if v_days > 0 and exists (select 1 from public.conversation_assignments a where a.conversation_id = c.id)
     and c.last_message_at > now() - make_interval(days => v_days) then
    return 'professional_record_retention';
  end if;
  return null;
end;
$$;

create or replace function public._hard_delete_conversation(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Exclusão real: mensagens, eventos, atribuições e pedidos saem em cascata.
  delete from public.conversations where id = p_conversation_id;
end;
$$;

create or replace function public.delete_my_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  c public.conversations;
  v_reason text;
begin
  select * into c from public.conversations where id = p_conversation_id for update;
  if not found or v_uid is null or c.user_id is distinct from v_uid then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  v_reason := public._conversation_retention_reason(c.id);

  if v_reason is not null then
    if c.status not in ('closed', 'archived') then
      perform public._transition(c.id, 'closed', 'user', v_uid, 'closed_for_deletion');
      update public.conversation_assignments set released_at = now(), release_reason = 'closed'
       where conversation_id = c.id and released_at is null;
    end if;
    insert into public.deletion_requests (user_id, scope, conversation_id, pending_reason)
    values (v_uid, 'conversation', c.id, v_reason);
    perform public.write_audit('privacy.delete_conversation.pending', 'conversation', c.id,
                               jsonb_build_object('reason', v_reason));
    return jsonb_build_object('result', 'pending', 'reason', v_reason);
  end if;

  perform public._hard_delete_conversation(c.id);
  perform public.write_audit('privacy.delete_conversation', 'conversation', p_conversation_id);
  return jsonb_build_object('result', 'deleted');
end;
$$;

-- Usado pelo servidor (service_role) antes de excluir o usuário do Auth.
-- Conversas sem retenção são apagadas; as retidas ficam pseudonimizadas
-- (user_id vira NULL quando o perfil é removido) até o fim do prazo.
create or replace function public.prepare_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv record;
  v_deleted integer := 0;
  v_retained integer := 0;
  v_reason text;
begin
  for v_conv in select id from public.conversations where user_id = p_user_id for update loop
    v_reason := public._conversation_retention_reason(v_conv.id);
    if v_reason is null then
      perform public._hard_delete_conversation(v_conv.id);
      v_deleted := v_deleted + 1;
    else
      update public.conversations set status = 'closed', closed_at = coalesce(closed_at, now()),
             state_version = state_version + 1
       where id = v_conv.id and status not in ('closed', 'archived');
      insert into public.deletion_requests (user_id, scope, conversation_id, pending_reason)
      values (p_user_id, 'account', v_conv.id, v_reason);
      v_retained := v_retained + 1;
    end if;
  end loop;

  insert into public.audit_logs (actor_id, actor_kind, action, target_type, target_id, metadata)
  values (p_user_id, 'user', 'privacy.delete_account', 'user', p_user_id,
          jsonb_build_object('deleted', v_deleted, 'retained', v_retained));

  return jsonb_build_object('deleted_conversations', v_deleted, 'retained_conversations', v_retained);
end;
$$;

create or replace function public.admin_resolve_deletion_request(p_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.deletion_requests;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into d from public.deletion_requests where id = p_request_id and status = 'pending' for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  if p_approve then
    if d.conversation_id is not null then
      if exists (select 1 from public.conversations where id = d.conversation_id and legal_hold) then
        raise exception 'legal_hold_active' using errcode = 'P0001';
      end if;
      perform public._hard_delete_conversation(d.conversation_id);
    end if;
    update public.deletion_requests set status = 'completed', completed_at = now(), reviewed_by = (select auth.uid())
     where id = d.id;
  else
    update public.deletion_requests set status = 'rejected', completed_at = now(), reviewed_by = (select auth.uid())
     where id = d.id;
  end if;
  perform public.write_audit('privacy.resolve_deletion', 'deletion_request', d.id,
                             jsonb_build_object('approved', p_approve));
end;
$$;

-- ---------------------------------------------------------------------------
-- Rotina de retenção (agendar com pg_cron; ver supabase/optional/schedule_retention.sql)
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb := public.setting('retention', '{}'::jsonb);
  v_conv_days integer := coalesce((v_cfg ->> 'conversation_days')::integer, 180);
  v_prof_days integer := coalesce((v_cfg ->> 'professional_record_days')::integer, 0);
  v_anon_days integer := coalesce((v_cfg ->> 'anonymous_inactive_days')::integer, 90);
  v_usage_days integer := coalesce((v_cfg ->> 'ai_usage_days')::integer, 400);
  v_idle_hours integer := coalesce((v_cfg ->> 'auto_close_idle_hours')::integer, 24);
  v_closed integer;
  v_archived integer;
  v_deleted integer;
  v_anon integer;
  v_usage integer;
  v_conv uuid;
begin
  -- 1. Encerra conversas ociosas que não estão com um profissional.
  v_closed := 0;
  for v_conv in
    select id from public.conversations
    where status in ('ai_active', 'waiting_human')
      and last_message_at < now() - make_interval(hours => v_idle_hours)
    for update skip locked
  loop
    perform public._transition(v_conv, 'closed', 'system', null, 'auto_closed_idle');
    update public.human_support_requests set status = 'cancelled', resolved_at = now()
     where conversation_id = v_conv and status = 'open';
    v_closed := v_closed + 1;
  end loop;

  -- 2. Arquiva conversas encerradas há mais de 7 dias.
  update public.conversations
     set status = 'archived', state_version = state_version + 1
   where status = 'closed' and closed_at < now() - interval '7 days';
  get diagnostics v_archived = row_count;

  -- 3. Exclui conversas fora do prazo de retenção (exceto com bloqueio legal).
  with doomed as (
    select c.id
    from public.conversations c
    where not c.legal_hold
      and c.status in ('closed', 'archived')
      and (
        (not exists (select 1 from public.conversation_assignments a where a.conversation_id = c.id)
          and c.last_message_at < now() - make_interval(days => v_conv_days))
        or (exists (select 1 from public.conversation_assignments a where a.conversation_id = c.id)
          and c.last_message_at < now() - make_interval(days => greatest(v_conv_days, v_prof_days)))
      )
  )
  delete from public.conversations c using doomed where c.id = doomed.id;
  get diagnostics v_deleted = row_count;

  -- 4. Pedidos de exclusão pendentes cuja conversa já não existe são concluídos.
  update public.deletion_requests
     set status = 'completed', completed_at = now()
   where status = 'pending' and conversation_id is null;

  -- 5. Visitantes anônimos inativos (sem conversas sob retenção) são removidos do Auth.
  delete from auth.users u
   where u.is_anonymous
     and coalesce(u.last_sign_in_at, u.created_at) < now() - make_interval(days => v_anon_days)
     and not exists (select 1 from public.conversations c where c.user_id = u.id
                     and c.status in ('ai_active', 'waiting_human', 'human_active'));
  get diagnostics v_anon = row_count;

  -- 6. Métricas de uso da IA antigas.
  delete from public.ai_usage where created_at < now() - make_interval(days => v_usage_days);
  get diagnostics v_usage = row_count;

  insert into public.audit_logs (actor_kind, action, metadata)
  values ('system', 'retention.purge', jsonb_build_object(
    'auto_closed', v_closed, 'archived', v_archived, 'deleted_conversations', v_deleted,
    'deleted_anonymous_users', v_anon, 'deleted_ai_usage', v_usage));

  return jsonb_build_object(
    'auto_closed', v_closed, 'archived', v_archived, 'deleted_conversations', v_deleted,
    'deleted_anonymous_users', v_anon, 'deleted_ai_usage', v_usage);
end;
$$;

-- ---------------------------------------------------------------------------
-- Métricas agregadas (sem conteúdo) para o painel administrativo
--   * "Pessoa ativa": enviou ao menos uma mensagem na janela.
--   * Visitante = usuário anônimo do Auth; Registrado = conta com e-mail.
--   * "Conversa" = registro em conversations (uma pessoa pode ter várias).
-- ---------------------------------------------------------------------------
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
                            where sp.is_active and sp.credential_status = 'verified'),
      'pending_credentials', (select count(*) from public.staff_profiles where credential_status = 'pending' and is_active)
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
