-- =====================================================================
-- 0001 — Fondations : extensions, types, fonctions utilitaires
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('admin', 'commercial_plus', 'commercial');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.form_version_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.form_module_type as enum (
    'section_title',
    'explanation',
    'short_text',
    'long_text',
    'date',
    'select',
    'searchable_select',
    'single_choice',
    'multiple_choice',
    'yes_no',
    'rating_5',
    'custom_rating',
    'repeatable_group',
    'image_upload',
    'divider',
    'info_message'
  );
exception when duplicate_object then null; end $$;

-- Rôle fonctionnel : relie un module à une colonne « métier » du débriefing.
-- Les quatre premiers sont techniquement indispensables (cf. §10 du cahier des charges).
do $$ begin
  create type public.module_functional_role as enum (
    'referent',
    'event_date',
    'commercial',
    'client_name',
    'overall_rating',
    'internal_rating',
    'callback_request',
    'callback_details',
    'material_feedback',
    'attachments',
    'none'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_type as enum (
    'new_debrief',
    'callback_requested',
    'status_changed',
    'daily_digest'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_preference as enum (
    'immediate',
    'daily_digest',
    'callback_only',
    'none'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Normalisation des libellés (clients, matériels)
-- Volontairement écrite sans `unaccent` : la fonction reste IMMUTABLE,
-- donc utilisable dans une colonne générée et dans un index.
-- ---------------------------------------------------------------------
create or replace function public.normalize_label(input text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(
      regexp_replace(
        lower(
          translate(
            coalesce(input, ''),
            'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ''’-',
            'aaaaaaceeeeiiiinooooouuuuyyaaaaaaceeeeiiiinooooouuuuy   '
          )
        ),
        '[^a-z0-9]+', ' ', 'g'
      )
    ),
    ''
  );
$$;

comment on function public.normalize_label(text) is
  'Minuscules, sans accents ni ponctuation, espaces compactés. Sert à regrouper les clients et matériels sans fusionner automatiquement deux entités distinctes.';

-- ---------------------------------------------------------------------
-- Fonctions de sécurité
-- SECURITY DEFINER : elles lisent `profiles` sans déclencher les
-- politiques RLS de `profiles` (sinon récursion infinie).
-- ---------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.active
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.can_read_all_debriefs()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('admin', 'commercial_plus'), false);
$$;

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or exists (
        select 1
        from public.profile_permissions pp
        where pp.profile_id = auth.uid()
          and pp.permission = p_permission
      );
$$;

comment on function public.has_permission(text) is
  'Un administrateur possède toutes les permissions. Les autres rôles doivent recevoir une permission complémentaire explicite (ex : statistics_full).';

-- ---------------------------------------------------------------------
-- Horodatage automatique
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
