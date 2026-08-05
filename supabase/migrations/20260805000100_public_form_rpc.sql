-- =====================================================================
-- Lecture publique du formulaire — hébergement statique
--
-- Le front est servi par GitHub Pages : il n'y a plus de serveur Next.js
-- pour lire la base avec la clé de service avant le rendu. Le navigateur
-- doit donc pouvoir charger la définition du formulaire lui-même.
--
-- On ne rouvre pas les tables à `anon` pour autant. Une seule fonction
-- SECURITY DEFINER est exposée : elle choisit colonne par colonne ce qui
-- sort, et rien d'autre n'est accessible. C'est la contrepartie exacte de
-- `submit_debrief` côté écriture.
-- =====================================================================

-- Clé publique Turnstile : elle est destinée au navigateur, contrairement
-- au secret qui reste dans les variables de la fonction Edge.
insert into public.application_settings (key, value, description) values
  ('captcha_site_key', 'null'::jsonb, 'Clé publique Turnstile (visible du navigateur)')
on conflict (key) do nothing;

-- Réglages transmis au navigateur. Tout ce qui n'est pas dans cette liste
-- reste interne : seuils anti-abus, durée de conservation, notifications.
create or replace function public.public_setting_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'platform_name',
    'logo_url',
    'primary_color',
    'secondary_color',
    'welcome_message',
    'confirmation_message',
    'privacy_notice',
    'privacy_policy_url',
    'callback_details_enabled',
    'max_files',
    'max_file_size_mb',
    'max_total_size_mb',
    'accepted_formats',
    'public_access_mode',
    'captcha_enabled',
    'captcha_site_key',
    'honeypot_enabled'
  ]::text[];
$$;

-- Validité d'un code d'accès partagé (§21).
create or replace function public.access_code_is_valid(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.public_access_codes c
    where c.code = btrim(p_code)
      and c.active
      and (c.valid_from is null or c.valid_from <= now())
      and (c.valid_until is null or c.valid_until >= now())
  );
$$;

-- ---------------------------------------------------------------------
-- Définition complète du formulaire publié
--
-- Renvoie `locked: true` — et rien d'autre que l'habillage — quand le
-- formulaire est protégé par code et qu'aucun code valide n'est fourni.
-- Le contenu du formulaire ne quitte donc pas la base tant que le code
-- n'est pas bon, y compris pour quelqu'un qui appellerait l'API à la main.
-- ---------------------------------------------------------------------
create or replace function public.get_public_form(p_access_code text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings   jsonb;
  v_branding   jsonb;
  v_version    record;
  v_result     jsonb;
begin
  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
    into v_settings
  from public.application_settings s
  where s.key = any (public.public_setting_keys());

  -- Habillage minimal, toujours transmis : sans lui la page de saisie du
  -- code s'afficherait sans nom ni couleurs de l'agence.
  v_branding := jsonb_build_object(
    'platform_name',      coalesce(v_settings -> 'platform_name', '"Débriefs"'::jsonb),
    'logo_url',           coalesce(v_settings -> 'logo_url', 'null'::jsonb),
    'primary_color',      coalesce(v_settings -> 'primary_color', '"#1F8A4C"'::jsonb),
    'secondary_color',    coalesce(v_settings -> 'secondary_color', '"#E8892B"'::jsonb),
    'public_access_mode', coalesce(v_settings -> 'public_access_mode', '"open"'::jsonb)
  );

  if coalesce(v_settings ->> 'public_access_mode', 'open') = 'code'
     and not public.access_code_is_valid(coalesce(p_access_code, ''))
  then
    return jsonb_build_object(
      'locked', true,
      'invalidCode', nullif(btrim(coalesce(p_access_code, '')), '') is not null,
      'settings', v_branding
    );
  end if;

  select v.id, v.version_number
    into v_version
  from public.form_versions v
  where v.status = 'published'
  limit 1;

  if not found then
    return jsonb_build_object('locked', false, 'published', false, 'settings', v_settings);
  end if;

  select jsonb_build_object(
    'locked', false,
    'published', true,
    'versionId', v_version.id,
    'versionNumber', v_version.version_number,
    'settings', v_settings,

    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'section_key', s.section_key,
               'title', s.title,
               'description', s.description,
               'sort_order', s.sort_order,
               'active', s.active
             ) order by s.sort_order)
      from public.form_sections s
      where s.form_version_id = v_version.id and s.active
    ), '[]'::jsonb),

    'modules', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.sort_order)
      from public.form_modules m
      where m.form_version_id = v_version.id
        and m.active
        and m.archived_at is null
    ), '[]'::jsonb),

    -- Seuls le nom affiché et l'identifiant sortent : ni email, ni
    -- téléphone, ni société des référents (§22).
    'referents', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'display_name', r.display_name)
                       order by r.sort_order, r.display_name)
      from public.referents r
      where r.active
    ), '[]'::jsonb),

    'commercials', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'display_name', btrim(p.first_name || ' ' || coalesce(p.last_name, ''))
             ) order by p.sort_order, p.first_name)
      from public.profiles p
      where p.active and p.selectable_as_commercial
    ), '[]'::jsonb),

    'materialSuggestions', coalesce((
      select jsonb_agg(m.label order by m.label)
      from public.materials m
      where m.active
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

comment on function public.get_public_form(text) is
  'Définition du formulaire publié pour le front statique. Seule fonction exécutable par anon avec check_access_code.';

-- ---------------------------------------------------------------------
-- Droits : anon peut appeler ces deux fonctions, et rien d'autre.
-- ---------------------------------------------------------------------
grant usage on schema public to anon;

revoke all on function public.get_public_form(text) from public;
revoke all on function public.access_code_is_valid(text) from public;
revoke all on function public.public_setting_keys() from public;

grant execute on function public.get_public_form(text) to anon, authenticated;
grant execute on function public.access_code_is_valid(text) to anon, authenticated;

-- Rappel : les tables restent fermées à anon (migration 000800). Cette
-- migration n'ajoute aucun droit de lecture directe.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
