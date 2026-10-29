-- =============================================================================
-- Realtime (Broadcast em canais privados) e Storage de áudios.
--
-- Por que Broadcast via gatilho em vez de postgres_changes?
--   * Canais privados com autorização explícita em realtime.messages.
--   * Payload controlado: nunca enviamos colunas internas (sender_user_id, risco).
--   * Escala melhor que postgres_changes com RLS por linha.
--
-- Tópicos:
--   conversation:<uuid>  → mensagens e mudanças de estado (pessoa + profissionais autorizados)
--   staff:queue          → metadados da fila, SEM conteúdo (equipe clínica e administradores)
-- =============================================================================

create or replace function public.broadcast_message_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('message', public._public_message(new)),
    'message_created',
    'conversation:' || new.conversation_id::text,
    true
  );
  return null;
end;
$$;

create trigger messages_broadcast
  after insert on public.messages
  for each row execute function public.broadcast_message_created();

create or replace function public.broadcast_conversation_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status = old.status and new.state_version = old.state_version
     and new.priority = old.priority and new.assigned_staff_id is not distinct from old.assigned_staff_id
     and new.last_message_at = old.last_message_at then
    return null;
  end if;

  if tg_op = 'UPDATE' and (new.status <> old.status or new.state_version <> old.state_version) then
    perform realtime.send(
      jsonb_build_object(
        'id', new.id,
        'status', new.status,
        'state_version', new.state_version,
        'assigned_label', new.assigned_label
      ),
      'conversation_updated',
      'conversation:' || new.id::text,
      true
    );
  end if;

  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'status', new.status,
      'priority', new.priority,
      'risk_level', new.risk_level,
      'assigned_staff_id', new.assigned_staff_id,
      'assigned_label', new.assigned_label,
      'last_message_at', new.last_message_at,
      'created_at', new.created_at
    ),
    'queue_changed',
    'staff:queue',
    true
  );
  return null;
end;
$$;

create trigger conversations_broadcast
  after insert or update on public.conversations
  for each row execute function public.broadcast_conversation_changed();

create or replace function public.broadcast_conversation_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(jsonb_build_object('id', old.id, 'deleted', true), 'queue_changed', 'staff:queue', true);
  return null;
end;
$$;

create trigger conversations_broadcast_delete
  after delete on public.conversations
  for each row execute function public.broadcast_conversation_deleted();

-- Autorização dos canais privados. Sem política de INSERT: clientes não publicam.
-- (RLS já vem habilitado em realtime.messages no Supabase; a migração não é dona da tabela.)

create policy realtime_receive_authorized on realtime.messages
  for select to authenticated
  using (
    (
      realtime.topic() like 'conversation:%'
      and public.can_access_conversation(public.try_uuid(split_part(realtime.topic(), ':', 2)))
    )
    or (
      realtime.topic() = 'staff:queue'
      and (public.is_clinician() or public.is_admin())
    )
  );

-- -----------------------------------------------------------------------------
-- Storage: bucket privado para áudios. Tamanho e tipo validados pelo próprio
-- Storage; a reprodução usa URLs assinadas geradas no servidor apenas para
-- faixas publicadas.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio-tracks',
  'audio-tracks',
  false,
  52428800, -- 50 MB
  array['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/flac']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy audio_objects_admin_select on storage.objects
  for select to authenticated using (bucket_id = 'audio-tracks' and public.is_admin());
create policy audio_objects_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'audio-tracks' and public.is_admin());
create policy audio_objects_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'audio-tracks' and public.is_admin());
create policy audio_objects_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'audio-tracks' and public.is_admin());
