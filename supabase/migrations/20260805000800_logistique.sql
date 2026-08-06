-- =====================================================================
-- Rôle logistique et suivi des retours matériel
--
-- Le besoin : quelqu'un qui voit TOUS les retours matériel et leurs
-- photos, leur donne un état d'avancement, et consulte les débriefings —
-- sans être commercial pour autant.
--
-- Deux conséquences de conception :
--   * « logistique » lit tous les débriefings, comme commercial_plus,
--     mais n'apparaît jamais dans la liste des commerciaux du formulaire
--     public. C'est `selectable_as_commercial` qui règle ce second point,
--     forcé à faux pour ce rôle.
--   * L'état d'avancement vit sur la ligne de matériel, pas sur le
--     débriefing. Un même débriefing peut signaler trois éléments dont un
--     seul est réparé : un statut global serait faux dès le premier cas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Périmètre de lecture
-- ---------------------------------------------------------------------
create or replace function public.can_read_all_debriefs()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_user_role() in ('admin', 'commercial_plus', 'logistique'),
    false
  );
$$;

-- ---------------------------------------------------------------------
-- État d'avancement d'un retour matériel
-- ---------------------------------------------------------------------
do $$ begin
  create type public.material_status as enum ('non_traite', 'en_cours', 'traite');
exception when duplicate_object then null; end $$;

alter table public.material_feedback_items
  add column if not exists status public.material_status not null default 'non_traite',
  add column if not exists status_note text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references public.profiles(id) on delete set null;

create index if not exists material_feedback_status_idx
  on public.material_feedback_items (status, created_at desc);

-- ---------------------------------------------------------------------
-- Écriture réservée : admin ou logistique
-- ---------------------------------------------------------------------
create or replace function public.can_manage_material()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('admin', 'logistique'), false);
$$;

drop policy if exists material_feedback_manage on public.material_feedback_items;
create policy material_feedback_manage on public.material_feedback_items
  for update to authenticated
  using (public.can_manage_material())
  with check (public.can_manage_material());

-- ---------------------------------------------------------------------
-- Changement d'état, journalisé sur le débriefing d'origine
-- ---------------------------------------------------------------------
create or replace function public.set_material_status(
  p_item_id uuid,
  p_status  text,
  p_note    text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_debrief uuid;
  v_name    text;
  v_before  public.material_status;
begin
  if not public.can_manage_material() then
    raise exception 'Réservé à la logistique et aux administrateurs.' using errcode = '42501';
  end if;

  select m.debrief_id, m.material_name, m.status
    into v_debrief, v_name, v_before
  from public.material_feedback_items m
  where m.id = p_item_id;

  if v_debrief is null then
    raise exception 'Retour matériel introuvable.' using errcode = 'no_data_found';
  end if;

  update public.material_feedback_items
     set status = p_status::public.material_status,
         status_note = nullif(btrim(coalesce(p_note, '')), ''),
         status_changed_at = now(),
         status_changed_by = auth.uid()
   where id = p_item_id;

  -- La trace va sur le débriefing : le commercial qui rouvre la fiche voit
  -- que la logistique a pris le sujet en main, sans avoir à la contacter.
  insert into public.debrief_activity_logs (debrief_id, user_id, action, previous_value, new_value)
  values (
    v_debrief,
    auth.uid(),
    'material_status_changed',
    jsonb_build_object('material', v_name, 'status', v_before),
    jsonb_build_object('material', v_name, 'status', p_status)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Liste des retours matériel, avec le contexte du débriefing
--
-- Les photos appartiennent au débriefing, pas à la ligne de matériel :
-- elles remontent donc telles quelles, à charge de l'écran de les
-- présenter à côté du retour concerné.
-- ---------------------------------------------------------------------
create or replace function public.list_material_feedback(
  p_status   text[]  default null,
  p_search   text    default null,
  p_limit    integer default 50,
  p_offset   integer default 0
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
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_query text   := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.can_read_all_debriefs() then
    raise exception 'Réservé aux profils ayant accès à tous les débriefings.'
      using errcode = '42501';
  end if;

  -- Le filtre est écrit deux fois plutôt que stocké dans une table
  -- temporaire : une fonction `stable` ne doit rien écrire, pas même un
  -- objet temporaire.
  select count(*)
    into v_total
  from public.material_feedback_items m
  join public.debriefs d on d.id = m.debrief_id
  where (p_status is null or m.status::text = any (p_status))
    and (
      v_query is null
      or m.normalized_material_name like '%' || public.normalize_label(v_query) || '%'
      or m.feedback ilike '%' || v_query || '%'
      or d.public_reference ilike '%' || v_query || '%'
      or d.normalized_client_or_service_name like '%' || public.normalize_label(v_query) || '%'
    );

  select coalesce(jsonb_agg(row_to_json(t) order by t.ord), '[]'::jsonb)
    into v_rows
  from (
    select
      row_number() over (
        -- Les non traités d'abord, puis les plus récents : c'est l'ordre
        -- dans lequel on veut attaquer une pile de réparations.
        order by
          case m.status when 'non_traite' then 0 when 'en_cours' then 1 else 2 end,
          m.created_at desc
      ) as ord,
      m.id,
      m.material_name,
      m.feedback,
      m.status,
      m.status_note,
      m.status_changed_at,
      (select btrim(sp.first_name || ' ' || coalesce(sp.last_name, ''))
       from public.profiles sp where sp.id = m.status_changed_by) as status_changed_by,
      (select mc.label from public.material_categories mc where mc.id = m.category_id) as category,
      jsonb_build_object(
        'id', d.id,
        'reference', d.public_reference,
        'client', d.client_or_service_name,
        'event_date', d.event_date,
        'submitted_at', d.submitted_at,
        'referent', (select r.display_name from public.referents r where r.id = d.referent_id),
        'commercial', (select btrim(cp.first_name || ' ' || coalesce(cp.last_name, ''))
                       from public.profiles cp where cp.id = d.commercial_id)
      ) as debrief,
      coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', a.id,
                 'storage_path', a.storage_path,
                 'original_name', a.original_name
               ) order by a.sort_order, a.uploaded_at)
        from public.attachments a where a.debrief_id = d.id
      ), '[]'::jsonb) as photos
    from public.material_feedback_items m
    join public.debriefs d on d.id = m.debrief_id
    where (p_status is null or m.status::text = any (p_status))
      and (
        v_query is null
        or m.normalized_material_name like '%' || public.normalize_label(v_query) || '%'
        or m.feedback ilike '%' || v_query || '%'
        or d.public_reference ilike '%' || v_query || '%'
        or d.normalized_client_or_service_name like '%' || public.normalize_label(v_query) || '%'
      )
    order by ord
    offset greatest(coalesce(p_offset, 0), 0)
    limit v_limit
  ) t;

  return jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'rows', v_rows,
    'counts', (
      select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
      from (
        select m.status::text as status, count(*) as n
        from public.material_feedback_items m
        group by m.status
      ) s
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Un profil logistique n'est jamais proposé comme commercial
-- ---------------------------------------------------------------------
create or replace function public.enforce_logistique_not_commercial()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'logistique' then
    new.selectable_as_commercial := false;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_logistique_guard on public.profiles;
create trigger profiles_logistique_guard
  before insert or update on public.profiles
  for each row execute function public.enforce_logistique_not_commercial();

update public.profiles
   set selectable_as_commercial = false
 where role = 'logistique' and selectable_as_commercial;

-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'set_material_status(uuid, text, text)',
    'list_material_feedback(text[], text, integer, integer)',
    'can_manage_material()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Couleur de marque alignée sur le logo de l'agence
-- ---------------------------------------------------------------------
update public.application_settings
   set value = '"#98C058"'::jsonb
 where key = 'primary_color'
   and value in ('"#1F8A4C"'::jsonb, 'null'::jsonb);
