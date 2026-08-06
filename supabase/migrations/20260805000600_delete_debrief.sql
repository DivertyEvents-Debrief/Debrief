-- =====================================================================
-- Suppression d'un débriefing par un administrateur
--
-- La politique `debriefs_admin_delete` autorisait déjà l'opération, et les
-- clés étrangères sont toutes en `on delete cascade` : réponses, matériel,
-- pièces jointes, notes et images du stockage partent avec.
--
-- Le problème, c'est justement la cascade. `debrief_activity_logs` est
-- rattaché au débriefing : la trace de la suppression disparaîtrait avec
-- ce qu'elle documente. Cette fonction écrit donc une ligne de journal
-- détachée (debrief_id nul) avant de supprimer — la référence et l'auteur
-- survivent, le contenu part.
-- =====================================================================

create or replace function public.delete_debrief(p_debrief_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reference text;
  v_client    text;
  v_date      date;
begin
  if not public.is_admin() then
    raise exception 'Seul un administrateur peut supprimer un débriefing.'
      using errcode = '42501';
  end if;

  select d.public_reference, d.client_or_service_name, d.event_date
    into v_reference, v_client, v_date
  from public.debriefs d
  where d.id = p_debrief_id;

  if v_reference is null then
    raise exception 'Débriefing introuvable.' using errcode = 'no_data_found';
  end if;

  -- Trace détachée, écrite AVANT la suppression pour survivre à la cascade.
  insert into public.debrief_activity_logs (debrief_id, user_id, action, previous_value, new_value)
  values (
    null,
    auth.uid(),
    'debrief_deleted',
    jsonb_build_object(
      'reference', v_reference,
      'client', v_client,
      'event_date', v_date
    ),
    null
  );

  delete from public.debriefs where id = p_debrief_id;

  return jsonb_build_object('deleted', true, 'reference', v_reference);
end;
$$;

comment on function public.delete_debrief(uuid) is
  'Suppression définitive par un administrateur. Journalise la référence avant de supprimer.';

revoke all on function public.delete_debrief(uuid) from public, anon;
grant execute on function public.delete_debrief(uuid) to authenticated;
