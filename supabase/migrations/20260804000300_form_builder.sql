-- =====================================================================
-- 0003 — Constructeur de formulaire et versionnement
-- =====================================================================

create table if not exists public.form_versions (
  id             uuid primary key default gen_random_uuid(),
  version_number integer not null,
  label          text,
  status         public.form_version_status not null default 'draft',
  published_at   timestamptz,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (version_number)
);

create trigger form_versions_set_updated_at
  before update on public.form_versions
  for each row execute function public.set_updated_at();

-- Une seule version publiée à la fois : c'est elle que sert le formulaire public.
create unique index if not exists form_versions_single_published_idx
  on public.form_versions ((status)) where status = 'published';

create table if not exists public.form_sections (
  id             uuid primary key default gen_random_uuid(),
  form_version_id uuid not null references public.form_versions(id) on delete cascade,
  section_key    text not null,
  title          text not null,
  description    text,
  sort_order     integer not null default 100,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (form_version_id, section_key)
);

create trigger form_sections_set_updated_at
  before update on public.form_sections
  for each row execute function public.set_updated_at();

create table if not exists public.form_modules (
  id                   uuid primary key default gen_random_uuid(),
  form_version_id      uuid not null references public.form_versions(id) on delete cascade,
  section_key          text not null,
  technical_key        text not null,
  module_type          public.form_module_type not null,
  functional_role      public.module_functional_role not null default 'none',
  title                text not null default '',
  help_text            text,
  placeholder          text,
  required             boolean not null default false,
  active               boolean not null default true,
  archived_at          timestamptz,
  include_in_statistics boolean not null default false,
  sort_order           integer not null default 100,
  -- Configuration libre selon le type de module :
  -- { options: [{value,label,emoji}], min_length, max_length, min_items, max_items,
  --   accepted_formats, max_files, max_file_size_mb, scale, labels, fields: [...] }
  configuration        jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (form_version_id, technical_key)
);

create index if not exists form_modules_version_order_idx
  on public.form_modules (form_version_id, sort_order);

create trigger form_modules_set_updated_at
  before update on public.form_modules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Garde-fou : chaque version publiée doit conserver exactement UN module
-- pour chacun des quatre rôles fonctionnels indispensables.
-- ---------------------------------------------------------------------
create or replace function public.assert_form_version_integrity(p_version_id uuid)
returns void
language plpgsql
as $$
declare
  missing text;
begin
  select string_agg(r::text, ', ')
    into missing
  from unnest(array['referent', 'event_date', 'commercial', 'client_name']::public.module_functional_role[]) as r
  where (
    select count(*)
    from public.form_modules m
    where m.form_version_id = p_version_id
      and m.functional_role = r
      and m.active
      and m.archived_at is null
  ) <> 1;

  if missing is not null then
    raise exception
      'Version de formulaire incomplète : il faut exactement un module actif pour chaque rôle indispensable (manquant ou dupliqué : %).', missing
      using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function public.publish_form_version(p_version_id uuid)
returns public.form_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.form_versions;
begin
  if not public.has_permission('form_builder') then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  perform public.assert_form_version_integrity(p_version_id);

  update public.form_versions set status = 'archived'
  where status = 'published' and id <> p_version_id;

  update public.form_versions
     set status = 'published',
         published_at = coalesce(published_at, now())
   where id = p_version_id
  returning * into v;

  return v;
end;
$$;

-- ---------------------------------------------------------------------
-- Duplication d'une version : point de départ d'un nouveau brouillon.
-- ---------------------------------------------------------------------
create or replace function public.duplicate_form_version(p_source_id uuid, p_label text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  next_number integer;
begin
  if not public.has_permission('form_builder') then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_number from public.form_versions;

  insert into public.form_versions (version_number, label, status, created_by)
  values (next_number, coalesce(p_label, 'Brouillon v' || next_number), 'draft', auth.uid())
  returning id into new_id;

  insert into public.form_sections (form_version_id, section_key, title, description, sort_order, active)
  select new_id, section_key, title, description, sort_order, active
  from public.form_sections where form_version_id = p_source_id;

  insert into public.form_modules (
    form_version_id, section_key, technical_key, module_type, functional_role,
    title, help_text, placeholder, required, active, include_in_statistics,
    sort_order, configuration
  )
  select new_id, section_key, technical_key, module_type, functional_role,
         title, help_text, placeholder, required, active, include_in_statistics,
         sort_order, configuration
  from public.form_modules
  where form_version_id = p_source_id and archived_at is null;

  return new_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Suppression interdite d'un module déjà utilisé : on archive.
-- ---------------------------------------------------------------------
create or replace function public.prevent_used_module_deletion()
returns trigger
language plpgsql
as $$
begin
  if exists (select 1 from public.debrief_responses r where r.module_id = old.id) then
    raise exception
      'Ce module a déjà été utilisé dans des débriefings : archivez-le au lieu de le supprimer.'
      using errcode = 'foreign_key_violation';
  end if;
  return old;
end;
$$;
