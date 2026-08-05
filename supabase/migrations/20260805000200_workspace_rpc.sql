-- =====================================================================
-- Espace permanent — liste et fiche d'un débriefing
--
-- Deux fonctions, deux allers-retours. On aurait pu laisser le navigateur
-- assembler six requêtes filtrées par RLS, mais :
--   * la liste a besoin d'un total exact pour paginer, calculé sur le même
--     ensemble que les lignes affichées ;
--   * la fiche a besoin de six tables cohérentes entre elles ;
--   * `filter_debriefs()` applique déjà le périmètre de rôle avant tout
--     filtre, et c'est le seul endroit où cette règle doit vivre.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Liste paginée
-- ---------------------------------------------------------------------
create or replace function public.list_debriefs(
  p_filters jsonb   default '{}'::jsonb,
  p_limit   integer default 25,
  p_offset  integer default 0,
  p_sort    text    default 'submitted_desc'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
  v_rows  jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 200);
begin
  -- Le total porte sur l'ensemble filtré, pas sur la page : sans lui la
  -- pagination affiche « page 3 sur ? ».
  select count(*) into v_total from public.filter_debriefs(p_filters);

  select coalesce(jsonb_agg(row_to_json(t) order by t.ord), '[]'::jsonb)
    into v_rows
  from (
    select
      row_number() over (
        order by
          case when p_sort = 'submitted_desc' then d.submitted_at end desc,
          case when p_sort = 'submitted_asc'  then d.submitted_at end asc,
          case when p_sort = 'event_desc'     then d.event_date end desc,
          case when p_sort = 'event_asc'      then d.event_date end asc,
          case when p_sort = 'rating_desc'    then d.overall_rating end desc nulls last,
          case when p_sort = 'rating_asc'     then d.overall_rating end asc nulls last,
          case when p_sort = 'client_asc'     then d.normalized_client_or_service_name end asc,
          d.submitted_at desc
      ) as ord,
      d.id,
      d.public_reference,
      d.event_date,
      d.submitted_at,
      d.client_or_service_name,
      d.overall_rating,
      d.internal_satisfaction_rating,
      d.callback_requested,
      d.callback_handled_at,
      d.read_at,
      d.attachment_count,
      d.material_feedback_count,
      jsonb_build_object('id', r.id, 'display_name', r.display_name) as referent,
      jsonb_build_object(
        'id', p.id,
        'display_name', btrim(p.first_name || ' ' || coalesce(p.last_name, ''))
      ) as commercial,
      jsonb_build_object(
        'code', s.code, 'label', s.label, 'tone', s.tone, 'icon', s.icon
      ) as status
    from public.filter_debriefs(p_filters) d
    join public.referents r on r.id = d.referent_id
    join public.profiles  p on p.id = d.commercial_id
    join public.statuses  s on s.id = d.status_id
    order by ord
    offset greatest(coalesce(p_offset, 0), 0)
    limit v_limit
  ) t;

  return jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', greatest(coalesce(p_offset, 0), 0),
    'rows', v_rows
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Fiche complète
--
-- Les réponses sortent avec leur instantané de module : c'est ce qui rend
-- lisible un débriefing envoyé sur une ancienne version du formulaire,
-- même si le module a changé de libellé ou a été archivé depuis.
-- ---------------------------------------------------------------------
create or replace function public.debrief_detail(p_debrief_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.can_access_debrief(p_debrief_id) then
    raise exception 'Ce débriefing ne fait pas partie de votre périmètre.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'debrief', jsonb_build_object(
      'id', d.id,
      'public_reference', d.public_reference,
      'event_date', d.event_date,
      'submitted_at', d.submitted_at,
      'client_or_service_name', d.client_or_service_name,
      'overall_rating', d.overall_rating,
      'internal_satisfaction_rating', d.internal_satisfaction_rating,
      'callback_requested', d.callback_requested,
      'callback_details', d.callback_details,
      'callback_handled_at', d.callback_handled_at,
      'callback_handled_by', (
        select btrim(cp.first_name || ' ' || coalesce(cp.last_name, ''))
        from public.profiles cp where cp.id = d.callback_handled_by
      ),
      'read_at', d.read_at,
      'archived_at', d.archived_at,
      'attachment_count', d.attachment_count,
      'material_feedback_count', d.material_feedback_count,
      'form_version_number', (
        select fv.version_number from public.form_versions fv where fv.id = d.form_version_id
      ),
      'referent', jsonb_build_object(
        'id', r.id,
        'display_name', r.display_name,
        'internal_identifier', r.internal_identifier
      ),
      'commercial', jsonb_build_object(
        'id', p.id,
        'display_name', btrim(p.first_name || ' ' || coalesce(p.last_name, ''))
      ),
      'status', jsonb_build_object(
        'code', s.code, 'label', s.label, 'tone', s.tone,
        'icon', s.icon, 'is_terminal', s.is_terminal
      )
    ),

    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', dr.id,
               'technical_key', dr.technical_key,
               'module', dr.module_snapshot,
               'value', dr.response_value
             ) order by (dr.module_snapshot ->> 'sort_order')::numeric nulls last, dr.created_at)
      from public.debrief_responses dr where dr.debrief_id = d.id
    ), '[]'::jsonb),

    'materials', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id,
               'material_name', m.material_name,
               'feedback', m.feedback,
               'category', (select mc.label from public.material_categories mc where mc.id = m.category_id)
             ) order by m.sort_order, m.created_at)
      from public.material_feedback_items m where m.debrief_id = d.id
    ), '[]'::jsonb),

    'attachments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id,
               'storage_path', a.storage_path,
               'original_name', a.original_name,
               'mime_type', a.mime_type,
               'file_size', a.file_size,
               'width', a.width,
               'height', a.height
             ) order by a.sort_order, a.uploaded_at)
      from public.attachments a where a.debrief_id = d.id
    ), '[]'::jsonb),

    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id,
               'content', n.content,
               'created_at', n.created_at,
               'updated_at', n.updated_at,
               'author_id', n.author_id,
               'author', btrim(np.first_name || ' ' || coalesce(np.last_name, ''))
             ) order by n.created_at desc)
      from public.internal_notes n
      join public.profiles np on np.id = n.author_id
      where n.debrief_id = d.id
    ), '[]'::jsonb),

    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id,
               'action', l.action,
               'previous_value', l.previous_value,
               'new_value', l.new_value,
               'created_at', l.created_at,
               'user', coalesce(
                 (select btrim(lp.first_name || ' ' || coalesce(lp.last_name, ''))
                  from public.profiles lp where lp.id = l.user_id),
                 'Formulaire public')
             ) order by l.created_at desc)
      from public.debrief_activity_logs l where l.debrief_id = d.id
    ), '[]'::jsonb)
  ) into v_result
  from public.debriefs d
  join public.referents r on r.id = d.referent_id
  join public.profiles  p on p.id = d.commercial_id
  join public.statuses  s on s.id = d.status_id
  where d.id = p_debrief_id;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- Référentiels des filtres, en un appel
-- ---------------------------------------------------------------------
create or replace function public.list_filter_options()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'referents', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'display_name', r.display_name)
                       order by r.sort_order, r.display_name)
      from public.referents r where r.active), '[]'::jsonb),
    'commercials', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'display_name', btrim(p.first_name || ' ' || coalesce(p.last_name, ''))
             ) order by p.sort_order, p.first_name)
      from public.profiles p where p.active and p.selectable_as_commercial), '[]'::jsonb),
    'statuses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', s.code, 'label', s.label, 'tone', s.tone, 'icon', s.icon
             ) order by s.sort_order)
      from public.statuses s), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------
-- Droits : espace permanent uniquement.
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'list_debriefs(jsonb, integer, integer, text)',
    'debrief_detail(uuid)',
    'list_filter_options()',
    'mark_debrief_read(uuid)',
    'change_debrief_status(uuid, text)',
    'set_callback_handled(uuid, boolean)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
