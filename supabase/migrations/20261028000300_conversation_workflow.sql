-- =============================================================================
-- Fluxo de conversa: máquina de estados, transferência IA → humano e escrita
-- de mensagens. Todas as transições:
--   1. bloqueiam a linha da conversa (SELECT ... FOR UPDATE);
--   2. validam o estado atual e o papel do chamador;
--   3. incrementam state_version (invalida respostas de IA em andamento);
--   4. registram evento em conversation_events (sem conteúdo).
--
-- Transições permitidas:
--   ai_active     → waiting_human (pessoa pede / risco) | closed
--   waiting_human → ai_active (pessoa cancela) | human_active (profissional assume) | closed
--   human_active  → ai_active (profissional devolve, ação explícita) | human_active (transferência) | closed
--                 → waiting_human (profissional desativado)
--   closed        → archived (rotina de retenção)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Leitura de configurações e disponibilidade
-- ---------------------------------------------------------------------------
create or replace function public.setting(p_key text, p_default jsonb default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.value from public.app_settings s where s.key = p_key), p_default);
$$;

-- Profissionais clínicos realmente disponíveis (heartbeat nos últimos 3 minutos).
-- Retorna apenas um número: nenhuma identidade é exposta ao portal.
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
    and sp.credential_status = 'verified'
    and sp.last_seen_at > now() - interval '3 minutes'
    and exists (
      select 1 from public.staff_roles r where r.user_id = sp.user_id and r.role = 'psychologist'
    );
$$;

-- ---------------------------------------------------------------------------
-- Núcleo interno de transição (não exposto)
-- ---------------------------------------------------------------------------
create or replace function public._transition(
  p_conversation_id uuid,
  p_to public.conversation_status,
  p_actor_type text,
  p_actor_id uuid,
  p_event text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.conversation_status;
  v_row public.conversations;
begin
  select status into v_from from public.conversations where id = p_conversation_id;

  update public.conversations
     set status = p_to,
         state_version = state_version + 1,
         closed_at = case when p_to in ('closed', 'archived') then coalesce(closed_at, now()) else null end
   where id = p_conversation_id
  returning * into v_row;

  insert into public.conversation_events (conversation_id, event_type, from_status, to_status, actor_type, actor_id, metadata)
  values (p_conversation_id, p_event, v_from, p_to, p_actor_type, p_actor_id, coalesce(p_metadata, '{}'::jsonb));

  return v_row;
end;
$$;

create or replace function public._system_message(p_conversation_id uuid, p_content text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.messages (conversation_id, sender, content)
  values (p_conversation_id, 'system', p_content);
  update public.conversations set last_message_at = now() where id = p_conversation_id;
$$;

create or replace function public._public_message(m public.messages)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select to_jsonb(m) - 'sender_user_id' - 'risk_level' - 'ai_provider' - 'ai_model';
$$;

-- ---------------------------------------------------------------------------
-- Portal: iniciar conversa (exige sessão, inclusive anônima)
-- ---------------------------------------------------------------------------
create or replace function public.start_conversation(p_policy_version text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_policy_version is null or char_length(p_policy_version) > 20 then
    raise exception 'invalid_policy_version' using errcode = '22023';
  end if;

  -- Serializa por pessoa: dois cliques simultâneos não criam duas conversas.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  insert into public.user_preferences (user_id) values (v_uid) on conflict (user_id) do nothing;

  select c.id into v_id
  from public.conversations c
  where c.user_id = v_uid and c.status in ('ai_active', 'waiting_human', 'human_active')
  order by c.created_at desc
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.consent_records (user_id, consent_type, policy_version, granted)
  values (v_uid, 'chat_terms', p_policy_version, true);

  insert into public.conversations (user_id) values (v_uid) returning id into v_id;

  insert into public.conversation_events (conversation_id, event_type, to_status, actor_type, actor_id)
  values (v_id, 'created', 'ai_active', 'user', v_uid);

  update public.profiles set last_seen_at = now() where id = v_uid;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Servidor: gravar mensagem da pessoa (somente service_role).
-- O nível de risco vem do classificador do servidor, por isso a função não é
-- exposta ao portal: ninguém consegue forjar ou ocultar sinais de risco.
-- ---------------------------------------------------------------------------
create or replace function public.post_user_message(
  p_user_id uuid,
  p_conversation_id uuid,
  p_content text,
  p_client_message_id uuid,
  p_input_source public.message_input_source,
  p_risk_level public.risk_level,
  p_risk_rules text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations;
  m public.messages;
  v_escalated boolean := false;
  v_duplicate boolean := false;
  v_auto_escalate boolean;
begin
  select * into c from public.conversations where id = p_conversation_id for update;
  if not found or c.user_id is distinct from p_user_id then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  if c.status in ('closed', 'archived') then
    raise exception 'conversation_closed' using errcode = 'P0001';
  end if;

  select * into m
  from public.messages
  where conversation_id = c.id and client_message_id = p_client_message_id;

  if found then
    v_duplicate := true;
  else
    insert into public.messages (conversation_id, sender, sender_user_id, content, client_message_id, input_source, risk_level)
    values (c.id, 'user', p_user_id, p_content, p_client_message_id, p_input_source, p_risk_level)
    returning * into m;

    update public.conversations
       set last_message_at = now(),
           risk_level = greatest(risk_level, p_risk_level)
     where id = c.id;
    update public.profiles set last_seen_at = now() where id = p_user_id;

    if p_risk_level in ('high', 'critical') then
      insert into public.conversation_events (conversation_id, event_type, from_status, to_status, actor_type, metadata)
      values (c.id, 'risk_flagged', c.status, c.status, 'system',
              jsonb_build_object('level', p_risk_level, 'rules', to_jsonb(coalesce(p_risk_rules, '{}'))));

      update public.conversations set priority = true where id = c.id;

      v_auto_escalate := coalesce((public.setting('safety.auto_escalate') ->> 'enabled')::boolean, true);

      if c.status = 'ai_active' and v_auto_escalate and public.available_clinicians_count() > 0 then
        perform public._transition(c.id, 'waiting_human', 'system', null, 'escalated_by_risk',
                                   jsonb_build_object('level', p_risk_level));
        insert into public.human_support_requests (conversation_id, reason, priority)
        values (c.id, 'risk_detected', true)
        on conflict (conversation_id) where status = 'open' do nothing;
        v_escalated := true;
      elsif c.status = 'waiting_human' then
        update public.human_support_requests
           set priority = true
         where conversation_id = c.id and status = 'open';
      end if;
    end if;
  end if;

  select * into c from public.conversations where id = c.id;

  return jsonb_build_object(
    'message', public._public_message(m),
    'status', c.status,
    'state_version', c.state_version,
    'escalated', v_escalated,
    'duplicate', v_duplicate
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Servidor: gravar resposta da IA (somente service_role).
-- Retorna NULL (descarta) se:
--   * a conversa mudou de estado desde que a geração começou (ex.: humano assumiu);
--   * a pessoa já enviou outra mensagem (a resposta ficou desatualizada);
--   * já existe resposta para essa mensagem (idempotência).
-- ---------------------------------------------------------------------------
create or replace function public.commit_ai_message(
  p_conversation_id uuid,
  p_expected_version integer,
  p_reply_to uuid,
  p_content text,
  p_provider text,
  p_model text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations;
  r public.messages;
  m public.messages;
begin
  select * into c from public.conversations where id = p_conversation_id for update;
  if not found then
    return null;
  end if;
  if c.status not in ('ai_active', 'waiting_human') or c.state_version <> p_expected_version then
    return null;
  end if;

  select * into r from public.messages where id = p_reply_to and conversation_id = c.id and sender = 'user';
  if not found then
    return null;
  end if;

  if exists (
    select 1 from public.messages x
    where x.conversation_id = c.id and x.sender = 'user'
      and (x.created_at, x.id) > (r.created_at, r.id)
  ) then
    return null;
  end if;

  insert into public.messages (conversation_id, sender, content, reply_to_id, ai_provider, ai_model)
  values (c.id, 'ai', p_content, p_reply_to, p_provider, p_model)
  on conflict (reply_to_id) where sender = 'ai' do nothing
  returning * into m;

  if not found then
    return null;
  end if;

  update public.conversations set last_message_at = now() where id = c.id;
  return public._public_message(m);
end;
$$;

-- ---------------------------------------------------------------------------
-- Portal: pedir / cancelar atendimento humano, encerrar conversa
-- ---------------------------------------------------------------------------
create or replace function public.request_human(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  c public.conversations;
begin
  select * into c from public.conversations where id = p_conversation_id for update;
  if not found or c.user_id is distinct from v_uid or v_uid is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  if c.status in ('closed', 'archived') then
    raise exception 'conversation_closed' using errcode = 'P0001';
  end if;

  if c.status = 'ai_active' then
    c := public._transition(c.id, 'waiting_human', 'user', v_uid, 'human_requested');
    insert into public.human_support_requests (conversation_id, reason, priority)
    values (c.id, 'user_request', c.priority)
    on conflict (conversation_id) where status = 'open' do nothing;
    perform public._system_message(c.id, 'Seu pedido para falar com uma pessoa foi registrado.');
  end if;

  return jsonb_build_object(
    'status', c.status,
    'state_version', c.state_version,
    'available_professionals', public.available_clinicians_count()
  );
end;
$$;

create or replace function public.cancel_human_request(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  c public.conversations;
begin
  select * into c from public.conversations where id = p_conversation_id for update;
  if not found or c.user_id is distinct from v_uid or v_uid is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  if c.status = 'waiting_human' then
    c := public._transition(c.id, 'ai_active', 'user', v_uid, 'human_request_cancelled');
    update public.human_support_requests
       set status = 'cancelled', resolved_at = now()
     where conversation_id = c.id and status = 'open';
    perform public._system_message(c.id, 'Pedido de atendimento humano cancelado. O assistente virtual continua disponível.');
  end if;

  return jsonb_build_object('status', c.status, 'state_version', c.state_version);
end;
$$;

create or replace function public.close_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  c public.conversations;
  v_is_owner boolean;
  v_is_assigned boolean;
begin
  select * into c from public.conversations where id = p_conversation_id for update;
  if not found or v_uid is null then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  -- coalesce: com assigned_staff_id ou user_id nulos a comparação daria NULL e não bloquearia.
  v_is_owner := coalesce(c.user_id = v_uid, false);
  v_is_assigned := coalesce(c.assigned_staff_id = v_uid, false) and public.is_clinician();
  if not (v_is_owner or v_is_assigned) then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  if c.status in ('closed', 'archived') then
    return jsonb_build_object('status', c.status, 'state_version', c.state_version);
  end if;

  c := public._transition(c.id, 'closed', case when v_is_owner then 'user' else 'staff' end, v_uid, 'closed');

  update public.conversation_assignments
     set released_at = now(), release_reason = 'closed'
   where conversation_id = c.id and released_at is null;
  update public.human_support_requests
     set status = 'cancelled', resolved_at = now()
   where conversation_id = c.id and status = 'open';

  perform public._system_message(
    c.id,
    case when v_is_owner then 'Conversa encerrada.' else 'O profissional encerrou o atendimento.' end
  );

  if v_is_assigned then
    perform public.write_audit('conversation.close', 'conversation', c.id);
  end if;

  return jsonb_build_object('status', c.status, 'state_version', c.state_version);
end;
$$;

-- ---------------------------------------------------------------------------
-- Equipe clínica
-- ---------------------------------------------------------------------------

-- Assumir conversa. O bloqueio de linha garante que, se dois profissionais
-- clicarem ao mesmo tempo, apenas o primeiro assume; o segundo recebe
-- 'already_claimed'. Reassumir a própria conversa é idempotente.
create or replace function public.claim_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  c public.conversations;
  sp public.staff_profiles;
  v_label text;
begin
  if not public.is_clinician() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into c from public.conversations where id = p_conversation_id for update;
  if not found then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;

  if c.status = 'human_active' then
    if c.assigned_staff_id = v_uid then
      return jsonb_build_object('status', c.status, 'state_version', c.state_version, 'assigned_label', c.assigned_label);
    end if;
    raise exception 'already_claimed' using errcode = 'P0001';
  end if;

  if not (c.status = 'waiting_human' or (c.status = 'ai_active' and c.priority)) then
    raise exception 'not_claimable' using errcode = 'P0001';
  end if;

  select * into sp from public.staff_profiles where user_id = v_uid;
  v_label := sp.display_name || coalesce(' · ' || sp.professional_title, '');

  update public.conversations
     set assigned_staff_id = v_uid, assigned_label = v_label
   where id = c.id;
  c := public._transition(c.id, 'human_active', 'staff', v_uid, 'claimed');

  insert into public.conversation_assignments (conversation_id, staff_id) values (c.id, v_uid);
  update public.human_support_requests
     set status = 'claimed', claimed_by = v_uid, resolved_at = now()
   where conversation_id = c.id and status = 'open';

  insert into public.messages (conversation_id, sender, sender_label, content)
  values (c.id, 'system', v_label,
          'Um profissional assumiu esta conversa. A partir de agora, você está falando diretamente com uma pessoa.');
  update public.conversations set last_message_at = now() where id = c.id;

  perform public.write_audit('conversation.claim', 'conversation', c.id);

  return jsonb_build_object('status', c.status, 'state_version', c.state_version, 'assigned_label', c.assigned_label);
end;
$$;

create or replace function public.post_staff_message(
  p_conversation_id uuid,
  p_content text,
  p_client_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  c public.conversations;
  m public.messages;
  v_content text := btrim(coalesce(p_content, ''));
begin
  if not public.is_clinician() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if char_length(v_content) = 0 or char_length(v_content) > 4000 then
    raise exception 'invalid_content' using errcode = '22023';
  end if;

  select * into c from public.conversations where id = p_conversation_id for update;
  if not found or c.status <> 'human_active' or c.assigned_staff_id is distinct from v_uid then
    raise exception 'not_assigned' using errcode = '42501';
  end if;

  select * into m from public.messages
  where conversation_id = c.id and client_message_id = p_client_message_id;
  if not found then
    insert into public.messages (conversation_id, sender, sender_user_id, sender_label, content, client_message_id)
    values (c.id, 'staff', v_uid, c.assigned_label, v_content, p_client_message_id)
    returning * into m;
    update public.conversations set last_message_at = now() where id = c.id;
  end if;

  return public._public_message(m);
end;
$$;

-- Devolver a conversa para a IA exige ação explícita do profissional responsável.
create or replace function public.release_to_ai(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  c public.conversations;
begin
  select * into c from public.conversations where id = p_conversation_id for update;
  if not found or c.status <> 'human_active' or c.assigned_staff_id is distinct from v_uid
     or not public.is_clinician() then
    raise exception 'not_assigned' using errcode = '42501';
  end if;

  update public.conversation_assignments
     set released_at = now(), release_reason = 'returned_to_ai'
   where conversation_id = c.id and released_at is null;
  c := public._transition(c.id, 'ai_active', 'staff', v_uid, 'returned_to_ai');
  update public.conversations set assigned_staff_id = null, assigned_label = null where id = c.id;

  perform public._system_message(c.id,
    'O atendimento com o profissional terminou. Você está novamente conversando com o assistente virtual (IA).');
  perform public.write_audit('conversation.release_to_ai', 'conversation', c.id);

  return jsonb_build_object('status', c.status, 'state_version', c.state_version);
end;
$$;

create or replace function public.transfer_conversation(p_conversation_id uuid, p_to_staff uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  c public.conversations;
  sp public.staff_profiles;
  v_label text;
begin
  select * into c from public.conversations where id = p_conversation_id for update;
  if not found or c.status <> 'human_active' then
    raise exception 'not_transferable' using errcode = 'P0001';
  end if;
  if not ((c.assigned_staff_id = v_uid and public.is_clinician()) or public.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_to_staff = c.assigned_staff_id or not public.is_clinician(p_to_staff) then
    raise exception 'invalid_target' using errcode = '22023';
  end if;

  select * into sp from public.staff_profiles where user_id = p_to_staff;
  v_label := sp.display_name || coalesce(' · ' || sp.professional_title, '');

  update public.conversation_assignments
     set released_at = now(), release_reason = 'transferred'
   where conversation_id = c.id and released_at is null;
  insert into public.conversation_assignments (conversation_id, staff_id) values (c.id, p_to_staff);
  update public.conversations set assigned_staff_id = p_to_staff, assigned_label = v_label where id = c.id;
  c := public._transition(c.id, 'human_active', 'staff', v_uid, 'transferred',
                          jsonb_build_object('to_staff', p_to_staff));

  insert into public.messages (conversation_id, sender, sender_label, content)
  values (c.id, 'system', v_label, 'Outro profissional assumiu esta conversa. Você continua falando com uma pessoa.');
  update public.conversations set last_message_at = now() where id = c.id;

  perform public.write_audit('conversation.transfer', 'conversation', c.id, jsonb_build_object('to_staff', p_to_staff));
  return jsonb_build_object('status', c.status, 'state_version', c.state_version, 'assigned_label', v_label);
end;
$$;

-- Leitura auditada do conteúdo para o painel profissional.
create or replace function public.get_conversation_for_staff(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations;
  v_messages jsonb;
  v_profile jsonb;
  v_prefs jsonb;
  v_history jsonb;
begin
  if not public.is_clinician() or not public.can_access_conversation(p_conversation_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into c from public.conversations where id = p_conversation_id;

  select coalesce(jsonb_agg(public._public_message(m) || jsonb_build_object('risk_level', m.risk_level)
                            order by m.created_at, m.id), '[]'::jsonb)
    into v_messages
  from public.messages m where m.conversation_id = c.id;

  select jsonb_build_object('display_name', p.display_name, 'since', p.created_at)
    into v_profile
  from public.profiles p where p.id = c.user_id;

  select case when up.share_with_professionals then jsonb_build_object(
           'short_answers', up.short_answers,
           'literal_communication', up.literal_communication,
           'low_stimulus', up.low_stimulus)
         else null end
    into v_prefs
  from public.user_preferences up where up.user_id = c.user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'staff_label', sp.display_name, 'assigned_at', a.assigned_at,
           'released_at', a.released_at, 'release_reason', a.release_reason)
           order by a.assigned_at), '[]'::jsonb)
    into v_history
  from public.conversation_assignments a
  left join public.staff_profiles sp on sp.user_id = a.staff_id
  where a.conversation_id = c.id;

  perform public.write_audit('conversation.view', 'conversation', c.id);

  return jsonb_build_object(
    'conversation', to_jsonb(c),
    'messages', v_messages,
    'person', coalesce(v_profile, '{}'::jsonb),
    'preferences', v_prefs,
    'assignments', v_history
  );
end;
$$;

create or replace function public.staff_heartbeat(p_availability public.staff_availability default null)
returns public.staff_availability
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_avail public.staff_availability;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.staff_profiles
     set last_seen_at = now(),
         availability = coalesce(p_availability, availability)
   where user_id = v_uid
  returning availability into v_avail;
  return v_avail;
end;
$$;

create or replace function public.set_legal_hold(p_conversation_id uuid, p_hold boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations;
begin
  select * into c from public.conversations where id = p_conversation_id for update;
  if not found then
    raise exception 'conversation_not_found' using errcode = 'P0002';
  end if;
  if not (public.is_admin() or (public.is_clinician() and public.can_access_conversation(c.id))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.conversations
     set legal_hold = p_hold, legal_hold_reason = case when p_hold then left(p_reason, 200) else null end
   where id = c.id;
  perform public.write_audit(case when p_hold then 'conversation.legal_hold.set' else 'conversation.legal_hold.clear' end,
                             'conversation', c.id);
end;
$$;

-- Permissões de execução: ver 20261028000600_function_grants.sql
