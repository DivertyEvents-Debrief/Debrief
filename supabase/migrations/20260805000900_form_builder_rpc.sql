-- =====================================================================
-- Constructeur de formulaire — lectures et écritures
--
-- Les fonctions de versionnement existent déjà (`publish_form_version`,
-- `duplicate_form_version`, `assert_form_version_integrity`). Il manque
-- une lecture d'ensemble pour l'écran, et de quoi réordonner en un appel.
--
-- Règle structurante appliquée ici : **on ne modifie jamais une version
-- publiée**. Toute retouche part d'un brouillon, dupliqué depuis la
-- version en service. Sans cela, changer un libellé réécrirait le sens
-- des débriefings déjà reçus — c'est précisément ce que l'instantané de
-- module dans chaque réponse cherche à éviter.
-- =====================================================================

create or replace function public.can_build_forms()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or public.has_permission('form_builder');
$$;

-- ---------------------------------------------------------------------
-- Liste des versions, avec de quoi décider laquelle ouvrir
-- ---------------------------------------------------------------------
create or replace function public.form_versions_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.can_build_forms() then
    raise exception 'Réservé aux profils autorisés à modifier le formulaire.'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(t) order by t.version_number desc), '[]'::jsonb)
    into v_result
  from (
    select
      v.id,
      v.version_number,
      v.label,
      v.status,
      v.published_at,
      v.created_at,
      (select count(*) from public.form_modules m
        where m.form_version_id = v.id and m.active and m.archived_at is null) as module_count,
      (select count(*) from public.debriefs d where d.form_version_id = v.id) as debrief_count,
      (select btrim(p.first_name || ' ' || coalesce(p.last_name, ''))
       from public.profiles p where p.id = v.created_by) as author
    from public.form_versions v
  ) t;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- Contenu complet d'une version
-- ---------------------------------------------------------------------
create or replace function public.form_version_detail(p_version_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.can_build_forms() then
    raise exception 'Réservé aux profils autorisés à modifier le formulaire.'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'version', jsonb_build_object(
      'id', v.id,
      'version_number', v.version_number,
      'label', v.label,
      'status', v.status,
      'published_at', v.published_at,
      'debrief_count', (select count(*) from public.debriefs d where d.form_version_id = v.id)
    ),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'section_key', s.section_key,
               'title', s.title,
               'description', s.description,
               'sort_order', s.sort_order,
               'active', s.active
             ) order by s.sort_order)
      from public.form_sections s where s.form_version_id = v.id
    ), '[]'::jsonb),
    'modules', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.sort_order)
      from public.form_modules m where m.form_version_id = v.id
    ), '[]'::jsonb),
    -- Les modules déjà utilisés ne peuvent pas être supprimés : l'écran a
    -- besoin de le savoir pour proposer l'archivage à la place.
    'used_module_ids', coalesce((
      select jsonb_agg(distinct r.form_module_id)
      from public.debrief_responses r
      join public.form_modules m on m.id = r.form_module_id
      where m.form_version_id = v.id
    ), '[]'::jsonb)
  ) into v_result
  from public.form_versions v
  where v.id = p_version_id;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- Garde-fou : un brouillon seulement
-- ---------------------------------------------------------------------
create or replace function public.assert_draft(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.form_version_status;
begin
  if not public.can_build_forms() then
    raise exception 'Réservé aux profils autorisés à modifier le formulaire.'
      using errcode = '42501';
  end if;

  select status into v_status from public.form_versions where id = p_version_id;

  if v_status is null then
    raise exception 'Version introuvable.' using errcode = 'no_data_found';
  end if;

  if v_status <> 'draft' then
    raise exception 'Cette version n''est pas un brouillon. Dupliquez-la pour la modifier.'
      using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Enregistrement d'un module
-- ---------------------------------------------------------------------
create or replace function public.save_form_module(
  p_version_id uuid,
  p_module     jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id  uuid := nullif(p_module ->> 'id', '')::uuid;
  v_key text := btrim(coalesce(p_module ->> 'technical_key', ''));
begin
  perform public.assert_draft(p_version_id);

  if v_key = '' then
    raise exception 'La clé technique est obligatoire.' using errcode = 'check_violation';
  end if;

  if v_id is null then
    insert into public.form_modules (
      form_version_id, section_key, technical_key, module_type, functional_role,
      title, help_text, placeholder, required, active, include_in_statistics,
      sort_order, configuration
    )
    values (
      p_version_id,
      coalesce(p_module ->> 'section_key', 'general'),
      v_key,
      (p_module ->> 'module_type')::public.form_module_type,
      coalesce(nullif(p_module ->> 'functional_role', ''), 'none')::public.module_functional_role,
      coalesce(p_module ->> 'title', ''),
      nullif(p_module ->> 'help_text', ''),
      nullif(p_module ->> 'placeholder', ''),
      coalesce((p_module ->> 'required')::boolean, false),
      coalesce((p_module ->> 'active')::boolean, true),
      coalesce((p_module ->> 'include_in_statistics')::boolean, false),
      coalesce((p_module ->> 'sort_order')::integer, 100),
      coalesce(p_module -> 'configuration', '{}'::jsonb)
    )
    returning id into v_id;
  else
    update public.form_modules set
      section_key           = coalesce(p_module ->> 'section_key', section_key),
      technical_key         = v_key,
      module_type           = (p_module ->> 'module_type')::public.form_module_type,
      functional_role       = coalesce(nullif(p_module ->> 'functional_role', ''), 'none')::public.module_functional_role,
      title                 = coalesce(p_module ->> 'title', title),
      help_text             = nullif(p_module ->> 'help_text', ''),
      placeholder           = nullif(p_module ->> 'placeholder', ''),
      required              = coalesce((p_module ->> 'required')::boolean, required),
      active                = coalesce((p_module ->> 'active')::boolean, active),
      include_in_statistics = coalesce((p_module ->> 'include_in_statistics')::boolean, include_in_statistics),
      sort_order            = coalesce((p_module ->> 'sort_order')::integer, sort_order),
      configuration         = coalesce(p_module -> 'configuration', configuration)
    where id = v_id and form_version_id = p_version_id;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Réordonnancement : un seul appel pour toute la liste
--
-- Envoyer une requête par module produirait des états intermédiaires
-- incohérents si le réseau lâche au milieu.
-- ---------------------------------------------------------------------
create or replace function public.reorder_form_modules(
  p_version_id uuid,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_draft(p_version_id);

  update public.form_modules m
     set sort_order = position.idx * 10
    from unnest(p_ordered_ids) with ordinality as position(id, idx)
   where m.id = position.id
     and m.form_version_id = p_version_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Suppression ou archivage
--
-- La suppression n'est possible que si le module n'a jamais servi ; le
-- déclencheur `prevent_used_module_deletion` s'en assure de son côté. On
-- rattrape l'erreur pour proposer l'archivage, plus lisible qu'un code
-- SQL brut à l'écran.
-- ---------------------------------------------------------------------
create or replace function public.remove_form_module(p_module_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version uuid;
begin
  select form_version_id into v_version from public.form_modules where id = p_module_id;
  if v_version is null then
    raise exception 'Module introuvable.' using errcode = 'no_data_found';
  end if;

  perform public.assert_draft(v_version);

  begin
    delete from public.form_modules where id = p_module_id;
    return 'deleted';
  exception when others then
    update public.form_modules
       set archived_at = now(), active = false
     where id = p_module_id;
    return 'archived';
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- Sections
-- ---------------------------------------------------------------------
create or replace function public.save_form_section(
  p_version_id uuid,
  p_section    jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := nullif(p_section ->> 'id', '')::uuid;
begin
  perform public.assert_draft(p_version_id);

  if v_id is null then
    insert into public.form_sections (form_version_id, section_key, title, description, sort_order, active)
    values (
      p_version_id,
      btrim(p_section ->> 'section_key'),
      coalesce(p_section ->> 'title', ''),
      nullif(p_section ->> 'description', ''),
      coalesce((p_section ->> 'sort_order')::integer, 100),
      coalesce((p_section ->> 'active')::boolean, true)
    )
    returning id into v_id;
  else
    update public.form_sections set
      title       = coalesce(p_section ->> 'title', title),
      description = nullif(p_section ->> 'description', ''),
      sort_order  = coalesce((p_section ->> 'sort_order')::integer, sort_order),
      active      = coalesce((p_section ->> 'active')::boolean, active)
    where id = v_id and form_version_id = p_version_id;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Contrôle avant publication, sans publier
--
-- L'écran affiche les manques AVANT que l'utilisateur clique, plutôt que
-- de lui renvoyer une exception après coup.
-- ---------------------------------------------------------------------
create or replace function public.check_form_version(p_version_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_problems text[] := '{}';
  v_role     text;
  v_count    integer;
begin
  if not public.can_build_forms() then
    raise exception 'Réservé aux profils autorisés à modifier le formulaire.'
      using errcode = '42501';
  end if;

  foreach v_role in array array['referent', 'event_date', 'commercial', 'client_name'] loop
    select count(*) into v_count
    from public.form_modules m
    where m.form_version_id = p_version_id
      and m.functional_role::text = v_role
      and m.active
      and m.archived_at is null;

    if v_count = 0 then
      v_problems := v_problems || format('Aucun module actif pour « %s ».', v_role);
    elsif v_count > 1 then
      v_problems := v_problems || format('%s modules actifs pour « %s » : il en faut exactement un.', v_count, v_role);
    end if;
  end loop;

  select count(*) into v_count
  from public.form_modules m
  where m.form_version_id = p_version_id and m.active and m.archived_at is null;

  if v_count = 0 then
    v_problems := v_problems || 'Le formulaire ne contient aucun module actif.';
  end if;

  return jsonb_build_object(
    'ready', cardinality(v_problems) = 0,
    'problems', to_jsonb(v_problems)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'can_build_forms()',
    'form_versions_overview()',
    'form_version_detail(uuid)',
    'assert_draft(uuid)',
    'save_form_module(uuid, jsonb)',
    'reorder_form_modules(uuid, uuid[])',
    'remove_form_module(uuid)',
    'save_form_section(uuid, jsonb)',
    'check_form_version(uuid)',
    'publish_form_version(uuid)',
    'duplicate_form_version(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
