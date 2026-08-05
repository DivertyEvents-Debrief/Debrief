-- =====================================================================
-- 0007 — Module statistiques
--
-- Toutes les agrégations sont faites en base. Le navigateur ne reçoit
-- jamais la totalité des débriefings pour calculer une moyenne.
-- Chaque fonction est SECURITY DEFINER et vérifie le rôle elle-même.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Contrôle d'accès au module « Statistiques rapides »
-- ---------------------------------------------------------------------
create or replace function public.assert_statistics_access()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('statistics_full') then
    raise exception 'Ce module est réservé à l''administrateur.' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Filtre commun. Le périmètre de rôle est appliqué ICI, en base :
-- un commercial classique ne voit que ses propres débriefings, quelle
-- que soit la requête envoyée par le client.
-- ---------------------------------------------------------------------
create or replace function public.filter_debriefs(p_filters jsonb default '{}'::jsonb)
returns setof public.debriefs
language sql
stable
security definer
set search_path = public
as $$
  select d.*
  from public.debriefs d
  join public.statuses s on s.id = d.status_id
  where
    -- Périmètre de rôle, non contournable
    (public.can_read_all_debriefs() or d.commercial_id = auth.uid())

    -- Période (par défaut sur la date de l'événement)
    and (p_filters ->> 'date_from' is null
         or (case when p_filters ->> 'date_field' = 'submitted_at'
                  then d.submitted_at::date else d.event_date end) >= (p_filters ->> 'date_from')::date)
    and (p_filters ->> 'date_to' is null
         or (case when p_filters ->> 'date_field' = 'submitted_at'
                  then d.submitted_at::date else d.event_date end) <= (p_filters ->> 'date_to')::date)

    and (p_filters -> 'commercial_ids' is null
         or jsonb_array_length(p_filters -> 'commercial_ids') = 0
         or d.commercial_id::text in (select jsonb_array_elements_text(p_filters -> 'commercial_ids')))

    and (p_filters -> 'referent_ids' is null
         or jsonb_array_length(p_filters -> 'referent_ids') = 0
         or d.referent_id::text in (select jsonb_array_elements_text(p_filters -> 'referent_ids')))

    and (p_filters -> 'status_codes' is null
         or jsonb_array_length(p_filters -> 'status_codes') = 0
         or s.code in (select jsonb_array_elements_text(p_filters -> 'status_codes')))

    and (p_filters -> 'form_version_ids' is null
         or jsonb_array_length(p_filters -> 'form_version_ids') = 0
         or d.form_version_id::text in (select jsonb_array_elements_text(p_filters -> 'form_version_ids')))

    and (p_filters -> 'overall_ratings' is null
         or jsonb_array_length(p_filters -> 'overall_ratings') = 0
         or d.overall_rating::text in (select jsonb_array_elements_text(p_filters -> 'overall_ratings')))

    and (p_filters -> 'internal_ratings' is null
         or jsonb_array_length(p_filters -> 'internal_ratings') = 0
         or d.internal_satisfaction_rating::text in (select jsonb_array_elements_text(p_filters -> 'internal_ratings')))

    and (p_filters ->> 'client' is null
         or d.normalized_client_or_service_name like '%' || public.normalize_label(p_filters ->> 'client') || '%')

    and (p_filters ->> 'callback' is null
         or (p_filters ->> 'callback' = 'yes' and d.callback_requested)
         or (p_filters ->> 'callback' = 'no' and not d.callback_requested)
         or (p_filters ->> 'callback' = 'pending' and d.callback_requested and d.callback_handled_at is null))

    and (p_filters ->> 'has_images' is null
         or (p_filters ->> 'has_images' = 'yes' and d.attachment_count > 0)
         or (p_filters ->> 'has_images' = 'no' and d.attachment_count = 0))

    and (p_filters ->> 'has_material' is null
         or (p_filters ->> 'has_material' = 'yes' and d.material_feedback_count > 0)
         or (p_filters ->> 'has_material' = 'no' and d.material_feedback_count = 0))

    and (p_filters ->> 'read_state' is null
         or (p_filters ->> 'read_state' = 'read' and d.read_at is not null)
         or (p_filters ->> 'read_state' = 'unread' and d.read_at is null))

    and (p_filters ->> 'archived' = 'include' or d.archived_at is null)

    -- Recherche globale : référence, client, référent, texte des réponses
    and (p_filters ->> 'search' is null or btrim(p_filters ->> 'search') = ''
         or d.public_reference ilike '%' || (p_filters ->> 'search') || '%'
         or d.normalized_client_or_service_name like '%' || public.normalize_label(p_filters ->> 'search') || '%'
         or exists (select 1 from public.referents r
                    where r.id = d.referent_id
                      and r.normalized_name like '%' || public.normalize_label(p_filters ->> 'search') || '%')
         or exists (select 1 from public.debrief_responses dr
                    where dr.debrief_id = d.id
                      and jsonb_typeof(dr.response_value) = 'string'
                      and dr.response_value #>> '{}' ilike '%' || (p_filters ->> 'search') || '%')
         or exists (select 1 from public.material_feedback_items mf
                    where mf.debrief_id = d.id
                      and (mf.material_name ilike '%' || (p_filters ->> 'search') || '%'
                        or mf.feedback ilike '%' || (p_filters ->> 'search') || '%')));
$$;

-- Décalage de la période pour la comparaison « période précédente ».
create or replace function public.previous_period_filters(p_filters jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when p_filters ->> 'date_from' is null or p_filters ->> 'date_to' is null then null
    else p_filters
         || jsonb_build_object(
              'date_to', ((p_filters ->> 'date_from')::date - 1)::text,
              'date_from', ((p_filters ->> 'date_from')::date
                            - ((p_filters ->> 'date_to')::date - (p_filters ->> 'date_from')::date) - 1)::text
            )
  end;
$$;

-- ---------------------------------------------------------------------
-- 13.1 — Indicateurs principaux (+ comparaison période précédente)
-- ---------------------------------------------------------------------
create or replace function public.stats_kpis(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_current jsonb;
  v_previous jsonb;
  v_prev_filters jsonb := public.previous_period_filters(p_filters);
begin
  perform public.assert_statistics_access();

  select jsonb_build_object(
    'debrief_count', count(*),
    'overall_average', round(avg(d.overall_rating)::numeric, 2),
    'internal_average', round(avg(d.internal_satisfaction_rating)::numeric, 2),
    'callback_count', count(*) filter (where d.callback_requested),
    'callback_rate', round(100.0 * count(*) filter (where d.callback_requested) / nullif(count(*), 0), 1),
    'callback_pending', count(*) filter (where d.callback_requested and d.callback_handled_at is null),
    'unread_count', count(*) filter (where d.read_at is null),
    'in_progress_count', count(*) filter (where d.processed_at is null and d.read_at is not null),
    'processed_count', count(*) filter (where d.processed_at is not null),
    'material_items_total', coalesce(sum(d.material_feedback_count), 0),
    'material_items_average', round(avg(d.material_feedback_count)::numeric, 2),
    'with_images_rate', round(100.0 * count(*) filter (where d.attachment_count > 0) / nullif(count(*), 0), 1),
    'distinct_clients', count(distinct d.normalized_client_or_service_name),
    'distinct_referents', count(distinct d.referent_id),
    'distinct_commercials', count(distinct d.commercial_id),
    'avg_read_hours', round(avg(extract(epoch from (d.read_at - d.submitted_at)) / 3600.0)::numeric, 1),
    'avg_processing_hours', round(avg(extract(epoch from (d.processed_at - d.submitted_at)) / 3600.0)::numeric, 1)
  )
  into v_current
  from public.filter_debriefs(p_filters) d;

  if v_prev_filters is not null then
    select jsonb_build_object(
      'debrief_count', count(*),
      'overall_average', round(avg(d.overall_rating)::numeric, 2),
      'internal_average', round(avg(d.internal_satisfaction_rating)::numeric, 2),
      'callback_count', count(*) filter (where d.callback_requested),
      'callback_rate', round(100.0 * count(*) filter (where d.callback_requested) / nullif(count(*), 0), 1),
      'material_items_average', round(avg(d.material_feedback_count)::numeric, 2),
      'avg_processing_hours', round(avg(extract(epoch from (d.processed_at - d.submitted_at)) / 3600.0)::numeric, 1)
    )
    into v_previous
    from public.filter_debriefs(v_prev_filters) d;
  end if;

  return jsonb_build_object(
    'current', v_current,
    'previous', v_previous,
    'previous_period', case when v_prev_filters is null then null
                            else jsonb_build_object('date_from', v_prev_filters ->> 'date_from',
                                                    'date_to', v_prev_filters ->> 'date_to') end,
    'total_all_time', (select count(*) from public.filter_debriefs('{}'::jsonb)),
    'generated_at', now()
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 13.3 — Répartition et évolution des notes
-- ---------------------------------------------------------------------
create or replace function public.stats_rating_distribution(p_filters jsonb default '{}'::jsonb)
returns table (rating smallint, overall_count bigint, internal_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_statistics_access();
  return query
  with scope as (select * from public.filter_debriefs(p_filters))
  select g.rating::smallint,
         (select count(*) from scope s where s.overall_rating = g.rating),
         (select count(*) from scope s where s.internal_satisfaction_rating = g.rating)
  from generate_series(1, 5) as g(rating)
  order by g.rating;
end;
$$;

create or replace function public.stats_rating_timeseries(
  p_filters jsonb default '{}'::jsonb,
  p_granularity text default 'auto'
)
returns table (
  bucket date,
  debrief_count bigint,
  overall_average numeric,
  internal_average numeric,
  callback_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_span integer;
  v_unit text;
begin
  perform public.assert_statistics_access();

  select coalesce(max(x) - min(x), 0) into v_span
  from (select event_date as x from public.filter_debriefs(p_filters)) t;

  v_unit := case
    when p_granularity in ('day', 'week', 'month') then p_granularity
    when v_span <= 45 then 'day'
    when v_span <= 200 then 'week'
    else 'month'
  end;

  return query
  select date_trunc(v_unit, d.event_date)::date as bucket,
         count(*),
         round(avg(d.overall_rating)::numeric, 2),
         round(avg(d.internal_satisfaction_rating)::numeric, 2),
         count(*) filter (where d.callback_requested)
  from public.filter_debriefs(p_filters) d
  group by 1
  order by 1;
end;
$$;

-- ---------------------------------------------------------------------
-- 13.4 / 13.5 / 13.6 — Répartitions
-- ---------------------------------------------------------------------
create or replace function public.stats_by_commercial(p_filters jsonb default '{}'::jsonb)
returns table (
  commercial_id uuid,
  commercial_name text,
  debrief_count bigint,
  overall_average numeric,
  internal_average numeric,
  callback_count bigint,
  callback_rate numeric,
  unread_count bigint,
  processed_count bigint,
  avg_read_hours numeric,
  avg_processing_hours numeric,
  material_items bigint,
  with_images_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_statistics_access();
  return query
  select p.id,
         btrim(p.first_name || ' ' || p.last_name),
         count(d.id),
         round(avg(d.overall_rating)::numeric, 2),
         round(avg(d.internal_satisfaction_rating)::numeric, 2),
         count(*) filter (where d.callback_requested),
         round(100.0 * count(*) filter (where d.callback_requested) / nullif(count(d.id), 0), 1),
         count(*) filter (where d.read_at is null),
         count(*) filter (where d.processed_at is not null),
         round(avg(extract(epoch from (d.read_at - d.submitted_at)) / 3600.0)::numeric, 1),
         round(avg(extract(epoch from (d.processed_at - d.submitted_at)) / 3600.0)::numeric, 1),
         coalesce(sum(d.material_feedback_count), 0),
         count(*) filter (where d.attachment_count > 0)
  from public.filter_debriefs(p_filters) d
  join public.profiles p on p.id = d.commercial_id
  group by p.id, p.first_name, p.last_name
  order by count(d.id) desc;
end;
$$;

create or replace function public.stats_by_referent(p_filters jsonb default '{}'::jsonb)
returns table (
  referent_id uuid,
  referent_name text,
  active boolean,
  debrief_count bigint,
  overall_average numeric,
  internal_average numeric,
  callback_count bigint,
  material_items bigint,
  last_debrief_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_statistics_access();
  return query
  select r.id, r.display_name, r.active,
         count(d.id),
         round(avg(d.overall_rating)::numeric, 2),
         round(avg(d.internal_satisfaction_rating)::numeric, 2),
         count(*) filter (where d.callback_requested),
         coalesce(sum(d.material_feedback_count), 0),
         max(d.submitted_at)
  from public.referents r
  left join public.filter_debriefs(p_filters) d on d.referent_id = r.id
  group by r.id, r.display_name, r.active
  order by count(d.id) desc, r.display_name;
end;
$$;

create or replace function public.stats_by_client(p_filters jsonb default '{}'::jsonb)
returns table (
  normalized_name text,
  display_name text,
  group_id uuid,
  group_label text,
  debrief_count bigint,
  overall_average numeric,
  internal_average numeric,
  callback_count bigint,
  material_items bigint,
  first_event date,
  last_event date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.assert_statistics_access();
  return query
  select d.normalized_client_or_service_name,
         (array_agg(d.client_or_service_name order by d.submitted_at desc))[1],
         a.group_id,
         g.label,
         count(*),
         round(avg(d.overall_rating)::numeric, 2),
         round(avg(d.internal_satisfaction_rating)::numeric, 2),
         count(*) filter (where d.callback_requested),
         coalesce(sum(d.material_feedback_count), 0),
         min(d.event_date),
         max(d.event_date)
  from public.filter_debriefs(p_filters) d
  left join public.client_group_aliases a on a.normalized_name = d.normalized_client_or_service_name
  left join public.client_groups g on g.id = a.group_id
  group by d.normalized_client_or_service_name, a.group_id, g.label
  order by count(*) desc;
end;
$$;

-- ---------------------------------------------------------------------
-- 13.7 — Demandes de rappel
-- ---------------------------------------------------------------------
create or replace function public.stats_callbacks(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  perform public.assert_statistics_access();

  select jsonb_build_object(
    'total_debriefs', count(*),
    'callback_total', count(*) filter (where d.callback_requested),
    'callback_rate', round(100.0 * count(*) filter (where d.callback_requested) / nullif(count(*), 0), 1),
    'pending', count(*) filter (where d.callback_requested and d.callback_handled_at is null),
    'handled', count(*) filter (where d.callback_requested and d.callback_handled_at is not null),
    'avg_hours_to_read', round(avg(extract(epoch from (d.read_at - d.submitted_at)) / 3600.0)
                               filter (where d.callback_requested)::numeric, 1),
    'avg_hours_to_close', round(avg(extract(epoch from (d.callback_handled_at - d.submitted_at)) / 3600.0)
                               filter (where d.callback_requested)::numeric, 1)
  ) into v
  from public.filter_debriefs(p_filters) d;

  return v || jsonb_build_object(
    'by_commercial', coalesce((
      select jsonb_agg(x order by x ->> 'commercial_name')
      from (
        select jsonb_build_object(
          'commercial_id', p.id,
          'commercial_name', btrim(p.first_name || ' ' || p.last_name),
          'callback_count', count(*) filter (where d.callback_requested),
          'pending', count(*) filter (where d.callback_requested and d.callback_handled_at is null)
        ) as x
        from public.filter_debriefs(p_filters) d
        join public.profiles p on p.id = d.commercial_id
        group by p.id, p.first_name, p.last_name
      ) s), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object('bucket', bucket, 'callback_count', callback_count) order by bucket)
      from public.stats_rating_timeseries(p_filters)
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 13.8 — Retours matériels
-- ---------------------------------------------------------------------
create or replace function public.stats_material(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  perform public.assert_statistics_access();

  with scope as (select * from public.filter_debriefs(p_filters)),
  items as (
    select m.*, s.commercial_id, s.referent_id, s.normalized_client_or_service_name, s.event_date
    from public.material_feedback_items m
    join scope s on s.id = m.debrief_id
  )
  select jsonb_build_object(
    'debriefs_with_material', (select count(*) from scope where material_feedback_count > 0),
    'debriefs_total', (select count(*) from scope),
    'item_total', (select count(*) from items),
    'top_materials', coalesce((
      select jsonb_agg(x order by (x ->> 'occurrences')::int desc)
      from (
        select jsonb_build_object(
          'normalized_name', normalized_material_name,
          'display_name', (array_agg(material_name order by created_at desc))[1],
          'occurrences', count(*),
          'debriefs', count(distinct debrief_id)
        ) as x
        from items
        where normalized_material_name is not null
        group by normalized_material_name
        order by count(*) desc
        limit 25
      ) t), '[]'::jsonb),
    'by_client', coalesce((
      select jsonb_agg(x order by (x ->> 'occurrences')::int desc)
      from (
        select jsonb_build_object(
          'client', normalized_client_or_service_name,
          'occurrences', count(*)
        ) as x
        from items group by normalized_client_or_service_name
        order by count(*) desc limit 15
      ) t), '[]'::jsonb),
    'timeline', coalesce((
      select jsonb_agg(x order by x ->> 'bucket')
      from (
        select jsonb_build_object('bucket', date_trunc('month', event_date)::date, 'occurrences', count(*)) as x
        from items group by 1
      ) t), '[]'::jsonb)
  ) into v;

  return v;
end;
$$;

-- ---------------------------------------------------------------------
-- 13.9 — Champs personnalisés marqués « inclure dans les statistiques »
-- Les textes longs sont volontairement exclus des agrégats quantitatifs.
-- ---------------------------------------------------------------------
create or replace function public.stats_custom_fields(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  perform public.assert_statistics_access();

  with scope as (select id from public.filter_debriefs(p_filters)),
  answers as (
    select r.technical_key,
           r.module_snapshot ->> 'title'        as title,
           r.module_snapshot ->> 'module_type'  as module_type,
           r.response_value
    from public.debrief_responses r
    join scope s on s.id = r.debrief_id
    where (r.module_snapshot ->> 'include_in_statistics')::boolean is true
      and r.module_snapshot ->> 'module_type' not in ('long_text', 'short_text', 'image_upload', 'repeatable_group')
      and r.response_value is not null
  )
  select coalesce(jsonb_agg(f order by f ->> 'title'), '[]'::jsonb) into v
  from (
    select jsonb_build_object(
      'technical_key', technical_key,
      'title', title,
      'module_type', module_type,
      'answer_count', count(*),
      'average', case
        when module_type in ('rating_5', 'custom_rating')
        then round(avg((response_value #>> '{}')::numeric), 2) end,
      'distribution', (
        -- Une réponse simple et une réponse à choix multiple sont ramenées
        -- au même format (un tableau) avant d'être comptées.
        select jsonb_object_agg(k, c)
        from (
          select coalesce(v.value_text, '—') as k, count(*) as c
          from answers a2
          cross join lateral jsonb_array_elements_text(
            case
              when jsonb_typeof(a2.response_value) = 'array' then a2.response_value
              else jsonb_build_array(a2.response_value #>> '{}')
            end
          ) as v(value_text)
          where a2.technical_key = a.technical_key
          group by 1
        ) y
      )
    ) as f
    from answers a
    group by technical_key, title, module_type
  ) z;

  return v;
end;
$$;

-- ---------------------------------------------------------------------
-- 13.10 — Tendances et points d'attention (constats factuels uniquement)
-- ---------------------------------------------------------------------
create or replace function public.stats_alerts(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_alerts jsonb := '[]'::jsonb;
  v_kpis jsonb;
  v_cur jsonb;
  v_prev jsonb;
  r record;
begin
  perform public.assert_statistics_access();

  v_kpis := public.stats_kpis(p_filters);
  v_cur := v_kpis -> 'current';
  v_prev := v_kpis -> 'previous';

  if v_prev is not null and (v_prev ->> 'overall_average') is not null
     and (v_cur ->> 'overall_average') is not null
     and (v_cur ->> 'overall_average')::numeric < (v_prev ->> 'overall_average')::numeric - 0.3 then
    v_alerts := v_alerts || jsonb_build_object(
      'code', 'overall_rating_drop',
      'severity', 'attention',
      'title', 'Baisse de la note générale moyenne',
      'description', format('La note générale moyenne est passée de %s à %s entre les deux dernières périodes. Cette évolution concerne %s débriefings.',
        v_prev ->> 'overall_average', v_cur ->> 'overall_average', v_cur ->> 'debrief_count'),
      'filters', p_filters
    );
  end if;

  if v_prev is not null and (v_prev ->> 'internal_average') is not null
     and (v_cur ->> 'internal_average') is not null
     and (v_cur ->> 'internal_average')::numeric < (v_prev ->> 'internal_average')::numeric - 0.3 then
    v_alerts := v_alerts || jsonb_build_object(
      'code', 'internal_rating_drop',
      'severity', 'attention',
      'title', 'Baisse de la satisfaction interne',
      'description', format('La satisfaction interne moyenne est passée de %s à %s entre les deux dernières périodes. Cette évolution concerne %s débriefings.',
        v_prev ->> 'internal_average', v_cur ->> 'internal_average', v_cur ->> 'debrief_count'),
      'filters', p_filters
    );
  end if;

  if v_prev is not null and (v_cur ->> 'callback_rate') is not null and (v_prev ->> 'callback_rate') is not null
     and (v_cur ->> 'callback_rate')::numeric > (v_prev ->> 'callback_rate')::numeric + 10 then
    v_alerts := v_alerts || jsonb_build_object(
      'code', 'callback_increase',
      'severity', 'attention',
      'title', 'Hausse des demandes de rappel',
      'description', format('Le taux de demandes de rappel est passé de %s %% à %s %%, soit %s demandes sur la période.',
        v_prev ->> 'callback_rate', v_cur ->> 'callback_rate', v_cur ->> 'callback_count'),
      'filters', p_filters || jsonb_build_object('callback', 'yes')
    );
  end if;

  -- Notes basses inhabituelles
  for r in
    select count(*) as low_count, (select count(*) from public.filter_debriefs(p_filters)) as total
    from public.filter_debriefs(p_filters) d
    where d.overall_rating <= 2
  loop
    if r.total > 0 and r.low_count::numeric / r.total > 0.2 and r.low_count >= 3 then
      v_alerts := v_alerts || jsonb_build_object(
        'code', 'low_ratings',
        'severity', 'attention',
        'title', 'Quantité inhabituelle de notes de 1 ou 2 sur 5',
        'description', format('%s débriefings sur %s ont une note générale inférieure ou égale à 2.', r.low_count, r.total),
        'filters', p_filters || jsonb_build_object('overall_ratings', '["1","2"]'::jsonb)
      );
    end if;
  end loop;

  -- Débriefings non lus par commercial
  for r in
    select p.id, btrim(p.first_name || ' ' || p.last_name) as name, count(*) as unread
    from public.filter_debriefs(p_filters) d
    join public.profiles p on p.id = d.commercial_id
    where d.read_at is null
    group by p.id, p.first_name, p.last_name
    having count(*) >= 5
  loop
    v_alerts := v_alerts || jsonb_build_object(
      'code', 'unread_backlog',
      'severity', 'info',
      'title', 'Débriefings non lus',
      'description', format('%s a %s débriefings non lus sur la période.', r.name, r.unread),
      'filters', p_filters || jsonb_build_object('commercial_ids', jsonb_build_array(r.id), 'read_state', 'unread')
    );
  end loop;

  -- Clients avec plusieurs notes faibles
  for r in
    select d.normalized_client_or_service_name as key,
           (array_agg(d.client_or_service_name))[1] as label,
           count(*) as low_count
    from public.filter_debriefs(p_filters) d
    where d.overall_rating <= 2
    group by 1
    having count(*) >= 2
  loop
    v_alerts := v_alerts || jsonb_build_object(
      'code', 'client_low_ratings',
      'severity', 'attention',
      'title', 'Client ou prestation avec plusieurs notes faibles',
      'description', format('%s cumule %s débriefings notés 2 sur 5 ou moins.', r.label, r.low_count),
      'filters', p_filters || jsonb_build_object('client', r.label, 'overall_ratings', '["1","2"]'::jsonb)
    );
  end loop;

  return jsonb_build_object('alerts', v_alerts, 'generated_at', now());
end;
$$;

-- ---------------------------------------------------------------------
-- Tableau de bord (tous rôles) — périmètre appliqué automatiquement
-- ---------------------------------------------------------------------
create or replace function public.dashboard_summary(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_filters jsonb := jsonb_build_object(
    'date_field', 'submitted_at',
    'date_from', (current_date - p_days)::text,
    'date_to', current_date::text
  );
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'period_days', p_days,
    'debrief_count', count(*),
    'unread_count', count(*) filter (where d.read_at is null),
    'callback_pending', count(*) filter (where d.callback_requested and d.callback_handled_at is null),
    'overall_average', round(avg(d.overall_rating)::numeric, 2),
    'internal_average', round(avg(d.internal_satisfaction_rating)::numeric, 2),
    'needs_action', count(*) filter (
      where d.read_at is null or (d.callback_requested and d.callback_handled_at is null))
  ) into v
  from public.filter_debriefs(v_filters) d;

  return v || jsonb_build_object(
    'distribution', coalesce((
      select jsonb_agg(jsonb_build_object('rating', g.rating, 'count', c.n) order by g.rating)
      from generate_series(1, 5) g(rating)
      cross join lateral (
        select count(*) as n from public.filter_debriefs(v_filters) d where d.overall_rating = g.rating
      ) c), '[]'::jsonb),
    -- L'agrégation se fait dans une sous-requête : Postgres interdit
    -- d'imbriquer avg() ou count() directement dans jsonb_agg().
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object(
               'bucket', t.bucket,
               'overall_average', t.overall_average,
               'internal_average', t.internal_average,
               'count', t.n) order by t.bucket)
      from (
        select date_trunc('week', d.submitted_at)::date               as bucket,
               round(avg(d.overall_rating)::numeric, 2)               as overall_average,
               round(avg(d.internal_satisfaction_rating)::numeric, 2) as internal_average,
               count(*)                                               as n
        from public.filter_debriefs(v_filters) d
        group by date_trunc('week', d.submitted_at)
      ) t), '[]'::jsonb),
    'can_view_full_statistics', public.has_permission('statistics_full'),
    'generated_at', now()
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------
revoke all on function public.filter_debriefs(jsonb) from anon;
do $$
declare f text;
begin
  foreach f in array array[
    'stats_kpis(jsonb)', 'stats_rating_distribution(jsonb)',
    'stats_by_commercial(jsonb)', 'stats_by_referent(jsonb)', 'stats_by_client(jsonb)',
    'stats_callbacks(jsonb)', 'stats_material(jsonb)', 'stats_custom_fields(jsonb)',
    'stats_alerts(jsonb)', 'dashboard_summary(integer)', 'filter_debriefs(jsonb)',
    'stats_rating_timeseries(jsonb, text)'
  ] loop
    execute format('revoke all on function public.%s from anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
