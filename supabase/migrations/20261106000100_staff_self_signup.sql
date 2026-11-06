-- =============================================================================
-- Autocadastro de profissionais.
--
-- O psicólogo cria a conta pela página /dashboard/cadastro. Os dados
-- profissionais vão em raw_user_meta_data.staff_signup e este gatilho cria o
-- perfil da equipe SEMPRE como:
--   * papel 'psychologist' (nunca administrativo);
--   * credencial 'pending' (sem acesso a nenhuma conversa).
-- Só um administrador libera o acesso, validando o registro profissional.
-- O gatilho roda apenas no INSERT: alterar os metadados depois não concede nada.
-- =============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signup jsonb := new.raw_user_meta_data -> 'staff_signup';
  v_full_name text;
  v_display_name text;
  v_title text;
  v_registry text;
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict (user_id) do nothing;

  if v_signup is not null and jsonb_typeof(v_signup) = 'object' and not coalesce(new.is_anonymous, false) then
    v_full_name := btrim(coalesce(v_signup ->> 'full_name', ''));
    v_display_name := btrim(coalesce(v_signup ->> 'display_name', ''));
    v_title := nullif(btrim(coalesce(v_signup ->> 'professional_title', '')), '');
    v_registry := btrim(coalesce(v_signup ->> 'professional_registry', ''));

    -- Dados inválidos não impedem a conta: apenas não viram perfil profissional.
    if char_length(v_full_name) between 2 and 120
       and char_length(v_display_name) between 2 and 60
       and char_length(v_registry) between 3 and 40
       and (v_title is null or char_length(v_title) <= 60) then
      insert into public.staff_profiles (user_id, full_name, display_name, professional_title, professional_registry, credential_status)
      values (new.id, v_full_name, v_display_name, v_title, v_registry, 'pending')
      on conflict (user_id) do nothing;
      insert into public.staff_roles (user_id, role) values (new.id, 'psychologist') on conflict do nothing;
      insert into public.audit_logs (actor_id, actor_kind, action, target_type, target_id)
      values (new.id, 'system', 'staff.self_signup', 'staff', new.id);
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
