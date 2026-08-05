-- =====================================================================
-- 0005 — Envoi public, cycle de vie, conservation
-- =====================================================================

-- ---------------------------------------------------------------------
-- Lecture du paramétrage
-- ---------------------------------------------------------------------
create or replace function public.setting(p_key text, p_default jsonb default 'null'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value from public.application_settings where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------
-- submit_debrief : point d'entrée UNIQUE de l'espace public.
-- Appelé depuis une Server Action Next.js. Tout est validé ici, en base,
-- dans une seule transaction : aucune écriture partielle possible.
-- Idempotent : rejouer le même brouillon renvoie le débriefing existant.
-- ---------------------------------------------------------------------
create or replace function public.submit_debrief(p_draft_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft            public.submission_drafts;
  v_version          public.form_versions;
  v_module           record;
  v_answer           jsonb;
  v_missing          text[] := '{}';
  v_debrief_id       uuid;
  v_reference        text;
  v_submitted_at     timestamptz;
  v_referent_id      uuid;
  v_event_date       date;
  v_commercial_id    uuid;
  v_client_name      text;
  v_overall          smallint;
  v_internal         smallint;
  v_callback         boolean := false;
  v_callback_details text;
  v_status_id        uuid;
  v_item             jsonb;
  v_index            integer := 0;
  v_recipient        record;
begin
  ------------------------------------------------------------------
  -- 1. Brouillon : verrou + idempotence
  ------------------------------------------------------------------
  select * into v_draft from public.submission_drafts where id = p_draft_id for update;

  if v_draft.id is null then
    raise exception 'Session d''envoi introuvable ou expirée. Rechargez le formulaire.'
      using errcode = 'no_data_found';
  end if;

  if v_draft.submitted_debrief_id is not null then
    select public_reference, submitted_at into v_reference, v_submitted_at
    from public.debriefs where id = v_draft.submitted_debrief_id;
    return jsonb_build_object(
      'debrief_id', v_draft.submitted_debrief_id,
      'public_reference', v_reference,
      'submitted_at', v_submitted_at,
      'already_submitted', true
    );
  end if;

  if v_draft.expires_at < now() then
    raise exception 'Session d''envoi expirée. Rechargez le formulaire.' using errcode = 'no_data_found';
  end if;

  ------------------------------------------------------------------
  -- 2. Version du formulaire
  ------------------------------------------------------------------
  select * into v_version from public.form_versions where id = v_draft.form_version_id;

  if v_version.status <> 'published' then
    raise exception 'Le formulaire a été mis à jour pendant votre saisie. Rechargez la page.'
      using errcode = 'check_violation';
  end if;

  select id into v_status_id from public.statuses where is_default and active limit 1;
  if v_status_id is null then
    raise exception 'Aucun statut par défaut configuré.' using errcode = 'check_violation';
  end if;

  ------------------------------------------------------------------
  -- 3. Validation module par module + extraction des champs métier
  ------------------------------------------------------------------
  for v_module in
    select *
    from public.form_modules
    where form_version_id = v_version.id
      and active
      and archived_at is null
      and module_type not in ('section_title', 'explanation', 'divider', 'info_message')
    order by sort_order
  loop
    v_answer := p_payload -> 'answers' -> v_module.technical_key;

    -- Un champ vide, une chaîne vide ou un tableau vide comptent comme absents.
    if v_module.required and (
         v_answer is null
      or v_answer = 'null'::jsonb
      or (jsonb_typeof(v_answer) = 'string' and btrim(v_answer #>> '{}') = '')
      or (jsonb_typeof(v_answer) = 'array' and jsonb_array_length(v_answer) = 0)
    ) then
      -- Le retour matériel et les images ont leurs propres tableaux dans le payload.
      if v_module.functional_role = 'material_feedback' then
        if jsonb_array_length(coalesce(p_payload -> 'material_feedback', '[]'::jsonb)) = 0 then
          v_missing := v_missing || v_module.title;
        end if;
      elsif v_module.functional_role = 'attachments' then
        if jsonb_array_length(coalesce(p_payload -> 'attachments', '[]'::jsonb)) = 0 then
          v_missing := v_missing || v_module.title;
        end if;
      else
        v_missing := v_missing || v_module.title;
      end if;
    end if;

    case v_module.functional_role
      when 'referent'         then v_referent_id      := nullif(v_answer #>> '{}', '')::uuid;
      when 'event_date'       then v_event_date       := nullif(v_answer #>> '{}', '')::date;
      when 'commercial'       then v_commercial_id    := nullif(v_answer #>> '{}', '')::uuid;
      when 'client_name'      then v_client_name      := btrim(coalesce(v_answer #>> '{}', ''));
      when 'overall_rating'   then v_overall          := nullif(v_answer #>> '{}', '')::smallint;
      when 'internal_rating'  then v_internal         := nullif(v_answer #>> '{}', '')::smallint;
      when 'callback_request' then v_callback         := coalesce((v_answer #>> '{}')::boolean, false);
      when 'callback_details' then v_callback_details := nullif(btrim(coalesce(v_answer #>> '{}', '')), '');
      else null;
    end case;

    -- Longueurs configurées sur les champs texte.
    if jsonb_typeof(v_answer) = 'string' and v_module.configuration ? 'max_length' then
      if length(v_answer #>> '{}') > (v_module.configuration ->> 'max_length')::int then
        raise exception 'Le champ « % » dépasse la longueur autorisée.', v_module.title
          using errcode = 'check_violation';
      end if;
    end if;
  end loop;

  if array_length(v_missing, 1) > 0 then
    raise exception 'Réponses manquantes : %.', array_to_string(v_missing, ', ')
      using errcode = 'not_null_violation';
  end if;

  ------------------------------------------------------------------
  -- 4. Cohérence des références
  ------------------------------------------------------------------
  if not exists (select 1 from public.referents where id = v_referent_id and active) then
    raise exception 'Ce référent n''est plus disponible. Rechargez le formulaire.' using errcode = 'foreign_key_violation';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_commercial_id and active and selectable_as_commercial
  ) then
    raise exception 'Ce commercial n''est plus disponible. Rechargez le formulaire.' using errcode = 'foreign_key_violation';
  end if;

  if v_client_name is null or v_client_name = '' then
    raise exception 'Le nom de la prestation ou du client est obligatoire.' using errcode = 'not_null_violation';
  end if;

  if v_overall is not null and v_overall not between 1 and 5 then
    raise exception 'Note générale invalide.' using errcode = 'check_violation';
  end if;
  if v_internal is not null and v_internal not between 1 and 5 then
    raise exception 'Satisfaction interne invalide.' using errcode = 'check_violation';
  end if;

  if v_event_date is null then
    v_event_date := current_date;
  end if;
  if v_event_date > current_date + interval '2 years'
     or v_event_date < current_date - interval '5 years' then
    raise exception 'Date d''événement invalide.' using errcode = 'check_violation';
  end if;

  ------------------------------------------------------------------
  -- 5. Création
  ------------------------------------------------------------------
  insert into public.debriefs (
    referent_id, event_date, commercial_id, client_or_service_name,
    overall_rating, internal_satisfaction_rating,
    callback_requested, callback_details,
    status_id, form_version_id
  ) values (
    v_referent_id, v_event_date, v_commercial_id, v_client_name,
    v_overall, v_internal,
    v_callback, case when v_callback then v_callback_details else null end,
    v_status_id, v_version.id
  )
  returning id, public_reference, submitted_at
  into v_debrief_id, v_reference, v_submitted_at;

  ------------------------------------------------------------------
  -- 6. Réponses + instantané des modules (versionnement §11)
  ------------------------------------------------------------------
  insert into public.debrief_responses (debrief_id, module_id, technical_key, module_snapshot, response_value)
  select
    v_debrief_id,
    m.id,
    m.technical_key,
    jsonb_build_object(
      'title', m.title,
      'help_text', m.help_text,
      'module_type', m.module_type,
      'functional_role', m.functional_role,
      'section_key', m.section_key,
      'sort_order', m.sort_order,
      'include_in_statistics', m.include_in_statistics,
      'configuration', m.configuration
    ),
    p_payload -> 'answers' -> m.technical_key
  from public.form_modules m
  where m.form_version_id = v_version.id
    and m.active
    and m.archived_at is null
    and m.module_type not in ('section_title', 'explanation', 'divider', 'info_message');

  ------------------------------------------------------------------
  -- 7. Retours matériels
  ------------------------------------------------------------------
  for v_item in select * from jsonb_array_elements(coalesce(p_payload -> 'material_feedback', '[]'::jsonb))
  loop
    if btrim(coalesce(v_item ->> 'material_name', '')) <> ''
       or btrim(coalesce(v_item ->> 'feedback', '')) <> '' then
      insert into public.material_feedback_items (debrief_id, material_name, feedback, sort_order)
      values (
        v_debrief_id,
        btrim(coalesce(v_item ->> 'material_name', 'Non précisé')),
        btrim(coalesce(v_item ->> 'feedback', '')),
        v_index
      );
      v_index := v_index + 1;
    end if;
  end loop;

  ------------------------------------------------------------------
  -- 8. Pièces jointes (déjà téléversées dans le bucket privé)
  ------------------------------------------------------------------
  v_index := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p_payload -> 'attachments', '[]'::jsonb))
  loop
    -- Le chemin doit appartenir au dossier du brouillon : impossible de
    -- rattacher un fichier appartenant à un autre envoi.
    if v_item ->> 'storage_path' not like 'submissions/' || p_draft_id::text || '/%' then
      raise exception 'Pièce jointe invalide.' using errcode = 'check_violation';
    end if;

    insert into public.attachments (
      debrief_id, storage_path, original_name, mime_type, file_size, width, height, sort_order
    ) values (
      v_debrief_id,
      v_item ->> 'storage_path',
      left(coalesce(v_item ->> 'original_name', 'image'), 200),
      coalesce(v_item ->> 'mime_type', 'application/octet-stream'),
      coalesce((v_item ->> 'file_size')::int, 0),
      (v_item ->> 'width')::int,
      (v_item ->> 'height')::int,
      v_index
    );
    v_index := v_index + 1;
  end loop;

  ------------------------------------------------------------------
  -- 9. Notifications
  ------------------------------------------------------------------
  for v_recipient in
    select p.id, p.notification_preference
    from public.profiles p
    where p.active
      and (
        p.id = v_commercial_id
        or (p.role in ('admin', 'commercial_plus'))
      )
      and p.notification_preference <> 'none'
      and (p.notification_preference <> 'callback_only' or v_callback)
  loop
    insert into public.notifications (user_id, debrief_id, type, title, body)
    values (
      v_recipient.id,
      v_debrief_id,
      -- Le CASE produit du texte ; la colonne attend l'enum. Postgres ne
      -- convertit pas implicitement texte -> enum, d'où le cast explicite.
      (case when v_callback then 'callback_requested' else 'new_debrief' end)::public.notification_type,
      case when v_callback
        then 'Demande de rappel — ' || v_client_name
        else 'Nouveau débriefing — ' || v_client_name
      end,
      'Référence ' || v_reference || ' · note générale ' ||
        coalesce(v_overall::text, '—') || '/5'
    );
  end loop;

  ------------------------------------------------------------------
  -- 10. Journal + consommation du brouillon
  ------------------------------------------------------------------
  insert into public.debrief_activity_logs (debrief_id, user_id, action, new_value)
  values (v_debrief_id, null, 'submitted',
          jsonb_build_object('reference', v_reference, 'form_version', v_version.version_number));

  update public.submission_drafts
     set submitted_debrief_id = v_debrief_id
   where id = p_draft_id;

  return jsonb_build_object(
    'debrief_id', v_debrief_id,
    'public_reference', v_reference,
    'submitted_at', v_submitted_at,
    'already_submitted', false
  );
end;
$$;

revoke all on function public.submit_debrief(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Cycle de vie côté permanent
-- ---------------------------------------------------------------------
create or replace function public.can_access_debrief(p_debrief_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.debriefs d
    where d.id = p_debrief_id
      and (public.can_read_all_debriefs() or d.commercial_id = auth.uid())
  );
$$;

create or replace function public.mark_debrief_read(p_debrief_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_access_debrief(p_debrief_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  update public.debriefs
     set read_at = coalesce(read_at, now()),
         read_by = coalesce(read_by, auth.uid()),
         status_id = case
           when read_at is null then coalesce(
             (select id from public.statuses where code = 'read' and active), status_id)
           else status_id
         end
   where id = p_debrief_id
     and read_at is null;

  if found then
    insert into public.debrief_activity_logs (debrief_id, user_id, action, new_value)
    values (p_debrief_id, auth.uid(), 'read', jsonb_build_object('read_at', now()));
  end if;
end;
$$;

create or replace function public.change_debrief_status(p_debrief_id uuid, p_status_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
  v_new public.statuses;
begin
  if not public.can_access_debrief(p_debrief_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  select * into v_new from public.statuses where code = p_status_code and active;
  if v_new.id is null then
    raise exception 'Statut inconnu.' using errcode = 'foreign_key_violation';
  end if;

  select s.code into v_old
  from public.debriefs d join public.statuses s on s.id = d.status_id
  where d.id = p_debrief_id;

  if v_old = p_status_code then
    return;
  end if;

  update public.debriefs
     set status_id = v_new.id,
         processed_at = case when v_new.is_terminal then now() else processed_at end,
         processed_by = case when v_new.is_terminal then auth.uid() else processed_by end,
         archived_at  = case when v_new.code = 'archived' then now() else archived_at end,
         read_at      = coalesce(read_at, now()),
         read_by      = coalesce(read_by, auth.uid())
   where id = p_debrief_id;

  insert into public.debrief_activity_logs (debrief_id, user_id, action, previous_value, new_value)
  values (p_debrief_id, auth.uid(), 'status_changed',
          jsonb_build_object('status', v_old),
          jsonb_build_object('status', v_new.code));
end;
$$;

create or replace function public.set_callback_handled(p_debrief_id uuid, p_handled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_access_debrief(p_debrief_id) then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  update public.debriefs
     set callback_handled_at = case when p_handled then now() else null end,
         callback_handled_by = case when p_handled then auth.uid() else null end
   where id = p_debrief_id and callback_requested;

  insert into public.debrief_activity_logs (debrief_id, user_id, action, new_value)
  values (p_debrief_id, auth.uid(), 'callback_updated', jsonb_build_object('handled', p_handled));
end;
$$;

-- ---------------------------------------------------------------------
-- Conservation des données (§22) — à planifier via pg_cron si souhaité
-- ---------------------------------------------------------------------
create or replace function public.purge_expired_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_months integer := coalesce((public.setting('retention_months', '36'::jsonb) #>> '{}')::int, 36);
  v_debriefs integer;
  v_drafts integer;
begin
  with removed as (
    delete from public.debriefs
    where submitted_at < now() - make_interval(months => v_months)
    returning id
  )
  select count(*) into v_debriefs from removed;

  with removed as (
    delete from public.submission_drafts
    where expires_at < now() - interval '7 days' and submitted_debrief_id is null
    returning id
  )
  select count(*) into v_drafts from removed;

  delete from public.public_submission_events where created_at < now() - interval '30 days';

  insert into public.debrief_activity_logs (user_id, action, new_value)
  values (null, 'retention_purge',
          jsonb_build_object('debriefs', v_debriefs, 'drafts', v_drafts, 'retention_months', v_months));

  return jsonb_build_object('debriefs_deleted', v_debriefs, 'drafts_deleted', v_drafts);
end;
$$;
