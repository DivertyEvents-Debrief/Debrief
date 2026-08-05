-- =====================================================================
-- 0004 — Débriefings et données associées
-- =====================================================================

create sequence if not exists public.debrief_reference_seq;

create table if not exists public.debriefs (
  id                            uuid primary key default gen_random_uuid(),
  public_reference              text not null unique,
  referent_id                   uuid not null references public.referents(id) on delete restrict,
  event_date                    date not null,
  commercial_id                 uuid not null references public.profiles(id) on delete restrict,
  client_or_service_name        text not null,
  normalized_client_or_service_name text generated always as (public.normalize_label(client_or_service_name)) stored,
  overall_rating                smallint check (overall_rating between 1 and 5),
  internal_satisfaction_rating  smallint check (internal_satisfaction_rating between 1 and 5),
  callback_requested            boolean not null default false,
  callback_details              text,
  callback_handled_at           timestamptz,
  callback_handled_by           uuid references public.profiles(id) on delete set null,
  status_id                     uuid not null references public.statuses(id) on delete restrict,
  form_version_id               uuid not null references public.form_versions(id) on delete restrict,
  -- Compteurs dénormalisés : filtres et statistiques rapides sans jointure.
  attachment_count              integer not null default 0,
  material_feedback_count       integer not null default 0,
  submitted_at                  timestamptz not null default now(),
  read_at                       timestamptz,
  read_by                       uuid references public.profiles(id) on delete set null,
  processed_at                  timestamptz,
  processed_by                  uuid references public.profiles(id) on delete set null,
  archived_at                   timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

create index if not exists debriefs_commercial_idx  on public.debriefs (commercial_id, submitted_at desc);
create index if not exists debriefs_submitted_idx   on public.debriefs (submitted_at desc);
create index if not exists debriefs_event_date_idx  on public.debriefs (event_date desc);
create index if not exists debriefs_referent_idx    on public.debriefs (referent_id);
create index if not exists debriefs_status_idx      on public.debriefs (status_id);
create index if not exists debriefs_client_idx      on public.debriefs (normalized_client_or_service_name);
create index if not exists debriefs_callback_idx    on public.debriefs (callback_requested) where callback_requested;
create index if not exists debriefs_unread_idx      on public.debriefs (read_at) where read_at is null;

create trigger debriefs_set_updated_at
  before update on public.debriefs
  for each row execute function public.set_updated_at();

-- Référence publique lisible : DBF-2026-000042
create or replace function public.assign_public_reference()
returns trigger
language plpgsql
as $$
begin
  if new.public_reference is null or new.public_reference = '' then
    new.public_reference := 'DBF-' || to_char(now(), 'YYYY') || '-' ||
      lpad(nextval('public.debrief_reference_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger debriefs_assign_reference
  before insert on public.debriefs
  for each row execute function public.assign_public_reference();

-- ---------------------------------------------------------------------
-- Réponses : la valeur ET l'instantané du module au moment de l'envoi.
-- C'est ce qui garantit qu'un ancien débriefing reste lisible tel quel.
-- ---------------------------------------------------------------------
create table if not exists public.debrief_responses (
  id              uuid primary key default gen_random_uuid(),
  debrief_id      uuid not null references public.debriefs(id) on delete cascade,
  module_id       uuid not null references public.form_modules(id) on delete restrict,
  technical_key   text not null,
  -- { title, help_text, module_type, functional_role, sort_order, section_key,
  --   options, include_in_statistics }
  module_snapshot jsonb not null,
  response_value  jsonb,
  created_at      timestamptz not null default now(),
  unique (debrief_id, module_id)
);

create index if not exists debrief_responses_key_idx on public.debrief_responses (technical_key);
create index if not exists debrief_responses_value_idx on public.debrief_responses using gin (response_value);

create trigger form_modules_prevent_delete
  before delete on public.form_modules
  for each row execute function public.prevent_used_module_deletion();

-- ---------------------------------------------------------------------
-- Retours matériels
-- ---------------------------------------------------------------------
create table if not exists public.material_feedback_items (
  id                      uuid primary key default gen_random_uuid(),
  debrief_id              uuid not null references public.debriefs(id) on delete cascade,
  material_name           text not null,
  normalized_material_name text generated always as (public.normalize_label(material_name)) stored,
  feedback                text not null default '',
  category_id             uuid references public.material_categories(id) on delete set null,
  sort_order              integer not null default 0,
  created_at              timestamptz not null default now()
);

create index if not exists material_feedback_debrief_idx on public.material_feedback_items (debrief_id, sort_order);
create index if not exists material_feedback_name_idx on public.material_feedback_items (normalized_material_name);

-- ---------------------------------------------------------------------
-- Pièces jointes (stockage privé)
-- ---------------------------------------------------------------------
create table if not exists public.attachments (
  id            uuid primary key default gen_random_uuid(),
  debrief_id    uuid not null references public.debriefs(id) on delete cascade,
  storage_path  text not null unique,
  original_name text not null,
  mime_type     text not null,
  file_size     integer not null,
  width         integer,
  height        integer,
  sort_order    integer not null default 0,
  uploaded_at   timestamptz not null default now()
);

create index if not exists attachments_debrief_idx on public.attachments (debrief_id, sort_order);

-- Maintien des compteurs dénormalisés
create or replace function public.refresh_debrief_counters()
returns trigger
language plpgsql
as $$
declare
  target uuid := coalesce(new.debrief_id, old.debrief_id);
begin
  update public.debriefs d
     set attachment_count = (select count(*) from public.attachments a where a.debrief_id = target),
         material_feedback_count = (select count(*) from public.material_feedback_items m where m.debrief_id = target)
   where d.id = target;
  return null;
end;
$$;

create trigger attachments_refresh_counters
  after insert or delete on public.attachments
  for each row execute function public.refresh_debrief_counters();

create trigger material_feedback_refresh_counters
  after insert or delete on public.material_feedback_items
  for each row execute function public.refresh_debrief_counters();

-- ---------------------------------------------------------------------
-- Espace interne : notes, journal, notifications
-- ---------------------------------------------------------------------
create table if not exists public.internal_notes (
  id         uuid primary key default gen_random_uuid(),
  debrief_id uuid not null references public.debriefs(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete restrict,
  content    text not null check (btrim(content) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists internal_notes_debrief_idx on public.internal_notes (debrief_id, created_at desc);

create trigger internal_notes_set_updated_at
  before update on public.internal_notes
  for each row execute function public.set_updated_at();

create table if not exists public.debrief_activity_logs (
  id             uuid primary key default gen_random_uuid(),
  debrief_id     uuid references public.debriefs(id) on delete cascade,
  user_id        uuid references public.profiles(id) on delete set null,
  action         text not null,
  previous_value jsonb,
  new_value      jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists activity_logs_debrief_idx on public.debrief_activity_logs (debrief_id, created_at desc);
create index if not exists activity_logs_created_idx on public.debrief_activity_logs (created_at desc);

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  debrief_id uuid references public.debriefs(id) on delete cascade,
  type       public.notification_type not null,
  title      text not null,
  body       text,
  email_sent_at timestamptz,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------
-- Statistiques : vues enregistrées et journal d'export
-- ---------------------------------------------------------------------
create table if not exists public.saved_statistic_views (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  filters    jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create unique index if not exists saved_views_one_default_idx
  on public.saved_statistic_views (user_id) where is_default;

create trigger saved_views_set_updated_at
  before update on public.saved_statistic_views
  for each row execute function public.set_updated_at();

create table if not exists public.statistic_export_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete set null,
  export_type  text not null,
  filters      jsonb not null default '{}'::jsonb,
  row_count    integer,
  generated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Envoi public : brouillons serveur (upload d'images) et anti-abus
-- ---------------------------------------------------------------------
create table if not exists public.submission_drafts (
  id                  uuid primary key default gen_random_uuid(),
  form_version_id     uuid not null references public.form_versions(id) on delete cascade,
  client_fingerprint  text,
  submitted_debrief_id uuid references public.debriefs(id) on delete set null,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null default now() + interval '24 hours'
);

create index if not exists submission_drafts_expiry_idx on public.submission_drafts (expires_at);

create table if not exists public.public_submission_events (
  id                 uuid primary key default gen_random_uuid(),
  client_fingerprint text not null,
  kind               text not null check (kind in ('draft', 'upload', 'submit', 'rejected')),
  created_at         timestamptz not null default now()
);

create index if not exists submission_events_window_idx
  on public.public_submission_events (client_fingerprint, created_at desc);

-- Codes d'accès facultatifs (§21)
create table if not exists public.public_access_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  label       text,
  valid_from  timestamptz,
  valid_until timestamptz,
  active      boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
