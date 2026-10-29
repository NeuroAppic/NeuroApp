-- =============================================================================
-- Lista explícita de funções que cada papel pode executar.
-- Tudo o que não está aqui é interno (SECURITY DEFINER chamado por outras
-- funções) ou exclusivo do service_role.
-- =============================================================================

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;

-- Auxiliares usadas em políticas RLS
grant execute on function public.try_uuid(text) to anon, authenticated;
grant execute on function public.has_staff_role(public.staff_role) to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.is_clinician(uuid) to authenticated;
grant execute on function public.can_access_conversation(uuid) to authenticated;

-- Portal
grant execute on function public.available_clinicians_count() to anon, authenticated;
grant execute on function public.start_conversation(text) to authenticated;
grant execute on function public.request_human(uuid) to authenticated;
grant execute on function public.cancel_human_request(uuid) to authenticated;
grant execute on function public.close_conversation(uuid) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_conversation(uuid) to authenticated;

-- Equipe clínica
grant execute on function public.claim_conversation(uuid) to authenticated;
grant execute on function public.post_staff_message(uuid, text, uuid) to authenticated;
grant execute on function public.release_to_ai(uuid) to authenticated;
grant execute on function public.transfer_conversation(uuid, uuid) to authenticated;
grant execute on function public.get_conversation_for_staff(uuid) to authenticated;
grant execute on function public.staff_heartbeat(public.staff_availability) to authenticated;
grant execute on function public.set_legal_hold(uuid, boolean, text) to authenticated;

-- Administração (cada função verifica o papel internamente)
grant execute on function public.admin_register_staff(uuid, text, text, text, text, public.staff_role[]) to authenticated;
grant execute on function public.admin_update_staff_profile(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_set_credential_status(uuid, public.credential_status) to authenticated;
grant execute on function public.admin_set_staff_active(uuid, boolean) to authenticated;
grant execute on function public.admin_set_roles(uuid, public.staff_role[]) to authenticated;
grant execute on function public.admin_update_setting(text, jsonb) to authenticated;
grant execute on function public.admin_resolve_deletion_request(uuid, boolean) to authenticated;
grant execute on function public.dashboard_metrics() to authenticated;

-- Exclusivas do servidor: post_user_message, commit_ai_message, prepare_account_deletion,
-- purge_expired_data, bootstrap_superadmin (já cobertas pelo grant ao service_role acima).
