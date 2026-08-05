-- =====================================================================
-- Espace d'administration — lectures agrégées
--
-- Les écritures passent directement par les tables : les politiques RLS
-- `*_admin` posées en 0006 les réservent déjà à `is_admin()`. Inutile
-- d'ajouter une couche de fonctions par-dessus.
--
-- Restent deux lectures que le navigateur ne sait pas faire proprement :
-- rassembler comptes + permissions + volume de débriefings, et joindre le
-- journal aux noms des utilisateurs. Une fonction chacune.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Comptes de l'équipe
--
-- Le nombre de débriefings rattachés compte : c'est ce qui dit à l'admin
-- qu'un compte ne doit surtout pas être supprimé mais désactivé, sous
-- peine de rendre l'historique illisible.
-- ---------------------------------------------------------------------
create or replace function public.admin_accounts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(t) order by t.sort_order, t.first_name), '[]'::jsonb)
    into v_result
  from (
    select
      p.id,
      p.first_name,
      p.last_name,
      p.email,
      p.role,
      p.active,
      p.selectable_as_commercial,
      p.notification_preference,
      p.sort_order,
      p.last_login_at,
      p.created_at,
      coalesce((
        select jsonb_agg(pp.permission order by pp.permission)
        from public.profile_permissions pp
        where pp.profile_id = p.id
      ), '[]'::jsonb) as permissions,
      (select count(*) from public.debriefs d where d.commercial_id = p.id) as debrief_count
    from public.profiles p
  ) t;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- Journal global
--
-- `debrief_activity_logs` mêle les actions rattachées à un débriefing et
-- les événements système (purges de conservation). L'admin voit les deux.
-- ---------------------------------------------------------------------
create or replace function public.admin_activity_log(
  p_limit  integer default 50,
  p_offset integer default 0
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
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;

  select count(*) into v_total from public.debrief_activity_logs;

  select coalesce(jsonb_agg(row_to_json(t) order by t.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select
      l.id,
      l.action,
      l.previous_value,
      l.new_value,
      l.created_at,
      l.debrief_id,
      (select d.public_reference from public.debriefs d where d.id = l.debrief_id) as reference,
      coalesce(
        (select btrim(p.first_name || ' ' || coalesce(p.last_name, ''))
         from public.profiles p where p.id = l.user_id),
        'Système'
      ) as author
    from public.debrief_activity_logs l
    order by l.created_at desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit v_limit
  ) t;

  return jsonb_build_object('total', v_total, 'limit', v_limit, 'rows', v_rows);
end;
$$;

-- ---------------------------------------------------------------------
-- Réglages applicatifs, en un aller-retour
-- ---------------------------------------------------------------------
create or replace function public.admin_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', s.key, 'value', s.value, 'description', s.description,
           'updated_at', s.updated_at) order by s.key), '[]'::jsonb)
    into v_result
  from public.application_settings s;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- Enregistrement d'un réglage, avec trace de l'auteur
-- ---------------------------------------------------------------------
create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.application_settings where key = p_key) then
    raise exception 'Réglage inconnu : %', p_key using errcode = 'check_violation';
  end if;

  update public.application_settings
     set value = p_value, updated_by = auth.uid(), updated_at = now()
   where key = p_key;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_accounts()',
    'admin_activity_log(integer, integer)',
    'admin_settings()',
    'admin_set_setting(text, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
