-- =====================================================================
-- Correction du garde-fou sur les privilèges de compte
--
-- `guard_profile_privileges()` empêchait un utilisateur non administrateur
-- de modifier son propre rôle. L'intention est bonne, l'application était
-- trop large : dans le SQL Editor, `auth.uid()` est nul, donc `is_admin()`
-- répond faux — et personne, pas même le superutilisateur, ne pouvait
-- créer le tout premier administrateur.
--
-- Le déclencheur ne concerne désormais que les requêtes portées par une
-- session utilisateur. Sans session, on est en SQL direct ou en contexte
-- de service : ces chemins ont déjà leurs propres protections, à savoir
-- les politiques RLS `profiles_admin_write` et le fait que `anon` n'a
-- aucun accès à la table.
-- =====================================================================

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Pas de session : SQL Editor, migration, tâche de maintenance.
  -- Le contrôle d'accès a déjà eu lieu en amont.
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_admin() then
    if new.role <> old.role
       or new.active <> old.active
       or new.selectable_as_commercial <> old.selectable_as_commercial then
      raise exception 'Seul un administrateur peut modifier le rôle ou l''activation d''un compte.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.guard_profile_privileges() is
  'Empêche un permanent connecté de modifier son propre rôle. Neutre hors session (SQL direct).';

-- ---------------------------------------------------------------------
-- Promotion du premier administrateur
--
-- Si aucun compte administrateur actif n'existe, le plus ancien compte
-- est promu. Cela évite l'impasse du démarrage : une base fraîchement
-- installée a toujours quelqu'un pour ouvrir l'écran d'administration.
-- ---------------------------------------------------------------------
do $$
declare
  v_first uuid;
begin
  if exists (select 1 from public.profiles where role = 'admin' and active) then
    return;
  end if;

  select id into v_first
  from public.profiles
  order by created_at
  limit 1;

  if v_first is null then
    raise notice 'Aucun compte : créez-en un via Authentication > Users, puis rejouez cette migration.';
    return;
  end if;

  update public.profiles set role = 'admin', active = true where id = v_first;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   where id = v_first;

  raise notice 'Premier administrateur promu automatiquement.';
end $$;
