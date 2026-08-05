-- =====================================================================
-- 0006 — Row Level Security
--
-- Principe : le rôle `anon` n'a AUCUN accès direct aux tables.
-- L'espace public passe uniquement par des Server Actions Next.js qui
-- appellent `submit_debrief` avec la clé de service. Les politiques
-- ci-dessous ne concernent donc que les utilisateurs authentifiés.
-- =====================================================================

alter table public.profiles                enable row level security;
alter table public.profile_permissions     enable row level security;
alter table public.referents               enable row level security;
alter table public.statuses                enable row level security;
alter table public.materials               enable row level security;
alter table public.material_categories     enable row level security;
alter table public.client_groups           enable row level security;
alter table public.client_group_aliases    enable row level security;
alter table public.application_settings    enable row level security;
alter table public.form_versions           enable row level security;
alter table public.form_sections           enable row level security;
alter table public.form_modules            enable row level security;
alter table public.debriefs                enable row level security;
alter table public.debrief_responses       enable row level security;
alter table public.material_feedback_items enable row level security;
alter table public.attachments             enable row level security;
alter table public.internal_notes          enable row level security;
alter table public.debrief_activity_logs   enable row level security;
alter table public.notifications           enable row level security;
alter table public.saved_statistic_views   enable row level security;
alter table public.statistic_export_logs   enable row level security;
alter table public.submission_drafts       enable row level security;
alter table public.public_submission_events enable row level security;
alter table public.public_access_codes     enable row level security;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for insert to authenticated with check (public.is_admin());

drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles
  for delete to authenticated using (public.is_admin());

-- Empêche une élévation de privilège via un simple UPDATE côté client.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

drop policy if exists profile_permissions_select on public.profile_permissions;
create policy profile_permissions_select on public.profile_permissions
  for select to authenticated using (profile_id = auth.uid() or public.is_admin());

drop policy if exists profile_permissions_admin on public.profile_permissions;
create policy profile_permissions_admin on public.profile_permissions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Référentiels : lecture pour tous les permanents, écriture admin
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'referents', 'statuses', 'materials', 'material_categories',
    'client_groups', 'client_group_aliases', 'application_settings'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Formulaire : lecture pour tous, écriture réservée au constructeur
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['form_versions', 'form_sections', 'form_modules'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_builder', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.has_permission(''form_builder'')) with check (public.has_permission(''form_builder''))',
      t || '_builder', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- debriefs : la règle centrale
-- ---------------------------------------------------------------------
drop policy if exists debriefs_select on public.debriefs;
create policy debriefs_select on public.debriefs
  for select to authenticated
  using (public.can_read_all_debriefs() or commercial_id = auth.uid());

drop policy if exists debriefs_update on public.debriefs;
create policy debriefs_update on public.debriefs
  for update to authenticated
  using (public.can_read_all_debriefs() or commercial_id = auth.uid())
  with check (public.can_read_all_debriefs() or commercial_id = auth.uid());

drop policy if exists debriefs_admin_delete on public.debriefs;
create policy debriefs_admin_delete on public.debriefs
  for delete to authenticated using (public.is_admin());

-- Un commercial classique ne doit pas pouvoir se réattribuer un débriefing.
create or replace function public.guard_debrief_reassignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.commercial_id <> old.commercial_id and not public.is_admin() then
    raise exception 'Seul un administrateur peut réattribuer un débriefing.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists debriefs_guard_reassignment on public.debriefs;
create trigger debriefs_guard_reassignment
  before update on public.debriefs
  for each row execute function public.guard_debrief_reassignment();

-- ---------------------------------------------------------------------
-- Données rattachées à un débriefing
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['debrief_responses', 'material_feedback_items', 'attachments'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_access_debrief(debrief_id))',
      t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin', t);
  end loop;
end $$;

-- Notes internes : jamais visibles côté public, jamais modifiables par autrui.
drop policy if exists internal_notes_select on public.internal_notes;
create policy internal_notes_select on public.internal_notes
  for select to authenticated using (public.can_access_debrief(debrief_id));

drop policy if exists internal_notes_insert on public.internal_notes;
create policy internal_notes_insert on public.internal_notes
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_debrief(debrief_id));

drop policy if exists internal_notes_update_own on public.internal_notes;
create policy internal_notes_update_own on public.internal_notes
  for update to authenticated
  using (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

drop policy if exists internal_notes_delete_own on public.internal_notes;
create policy internal_notes_delete_own on public.internal_notes
  for delete to authenticated using (author_id = auth.uid() or public.is_admin());

drop policy if exists activity_logs_select on public.debrief_activity_logs;
create policy activity_logs_select on public.debrief_activity_logs
  for select to authenticated
  using (
    (debrief_id is not null and public.can_access_debrief(debrief_id))
    or (debrief_id is null and public.is_admin())
  );

-- ---------------------------------------------------------------------
-- Espace personnel
-- ---------------------------------------------------------------------
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists saved_views_own on public.saved_statistic_views;
create policy saved_views_own on public.saved_statistic_views
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists export_logs_insert on public.statistic_export_logs;
create policy export_logs_insert on public.statistic_export_logs
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists export_logs_select on public.statistic_export_logs;
create policy export_logs_select on public.statistic_export_logs
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- Tables purement serveur : aucune politique permissive.
-- (RLS activée sans policy = tout est refusé sauf clé de service.)
-- ---------------------------------------------------------------------
drop policy if exists access_codes_admin on public.public_access_codes;
create policy access_codes_admin on public.public_access_codes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
