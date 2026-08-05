-- =====================================================================
-- 0002 — Tables de référence
-- =====================================================================

-- ---------------------------------------------------------------------
-- profiles : un enregistrement par utilisateur permanent (1-1 avec auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                        uuid primary key references auth.users(id) on delete cascade,
  first_name                text not null,
  last_name                 text not null default '',
  email                     text not null,
  role                      public.user_role not null default 'commercial',
  active                    boolean not null default true,
  selectable_as_commercial  boolean not null default true,
  notification_preference   public.notification_preference not null default 'immediate',
  sort_order                integer not null default 100,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  last_login_at             timestamptz
);

create index if not exists profiles_active_commercial_idx
  on public.profiles (active, selectable_as_commercial, sort_order);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Nom affiché : prénom + initiale du nom si nécessaire.
create or replace function public.profile_display_name(p public.profiles)
returns text
language sql
stable
as $$
  select btrim(p.first_name || ' ' || coalesce(nullif(p.last_name, ''), ''));
$$;

-- ---------------------------------------------------------------------
-- profile_permissions : permissions complémentaires accordées par l'admin
-- ---------------------------------------------------------------------
create table if not exists public.profile_permissions (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  permission  text not null check (permission in (
                'statistics_full',   -- accès au module « Statistiques rapides »
                'form_builder',      -- accès au constructeur de formulaire
                'export_global'      -- exports globaux
              )),
  granted_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (profile_id, permission)
);

-- ---------------------------------------------------------------------
-- referents : liste administrable des personnes remplissant le formulaire
-- ---------------------------------------------------------------------
create table if not exists public.referents (
  id                    uuid primary key default gen_random_uuid(),
  display_name          text not null,
  normalized_name       text generated always as (public.normalize_label(display_name)) stored,
  internal_identifier   text,
  active                boolean not null default true,
  sort_order            integer not null default 100,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists referents_active_idx on public.referents (active, sort_order, display_name);
create index if not exists referents_normalized_idx on public.referents (normalized_name);

drop trigger if exists referents_set_updated_at on public.referents;
create trigger referents_set_updated_at
  before update on public.referents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- statuses : statuts de traitement, administrables
-- ---------------------------------------------------------------------
create table if not exists public.statuses (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  label       text not null,
  description text,
  icon        text not null default 'circle',
  tone        text not null default 'neutral'
                check (tone in ('neutral', 'info', 'attention', 'progress', 'success', 'muted')),
  is_default  boolean not null default false,
  is_terminal boolean not null default false,
  sort_order  integer not null default 100,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Un seul statut par défaut.
create unique index if not exists statuses_single_default_idx
  on public.statuses ((is_default)) where is_default;

drop trigger if exists statuses_set_updated_at on public.statuses;
create trigger statuses_set_updated_at
  before update on public.statuses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- material_categories : regroupement manuel des retours matériels
-- ---------------------------------------------------------------------
create table if not exists public.material_categories (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  active      boolean not null default true,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists material_categories_set_updated_at on public.material_categories;
create trigger material_categories_set_updated_at
  before update on public.material_categories
  for each row execute function public.set_updated_at();

-- Catalogue de matériels proposé en suggestion (la saisie libre reste possible).
create table if not exists public.materials (
  id              uuid primary key default gen_random_uuid(),
  label           text not null,
  normalized_label text generated always as (public.normalize_label(label)) stored,
  category_id     uuid references public.material_categories(id) on delete set null,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists materials_normalized_idx on public.materials (normalized_label);

drop trigger if exists materials_set_updated_at on public.materials;
create trigger materials_set_updated_at
  before update on public.materials
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- client_groups : fusion CONTRÔLÉE de plusieurs libellés client
-- Aucune fusion automatique : l'administrateur rattache explicitement
-- un libellé normalisé à un groupe.
-- ---------------------------------------------------------------------
create table if not exists public.client_groups (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.client_group_aliases (
  normalized_name text primary key,
  group_id        uuid not null references public.client_groups(id) on delete cascade,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- application_settings : identité visuelle, textes, limites, sécurité publique
-- ---------------------------------------------------------------------
create table if not exists public.application_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

drop trigger if exists application_settings_set_updated_at on public.application_settings;
create trigger application_settings_set_updated_at
  before update on public.application_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Création automatique du profil à l'inscription (invitation Supabase Auth)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, email, role, active)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'first_name', ''), split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.email,
    -- Le rôle n'est JAMAIS choisi par l'utilisateur : il provient de
    -- l'invitation créée par l'administrateur (app_metadata, côté serveur).
    coalesce((new.raw_app_meta_data ->> 'role')::public.user_role, 'commercial'),
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
