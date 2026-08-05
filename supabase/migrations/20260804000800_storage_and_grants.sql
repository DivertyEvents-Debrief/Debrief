-- =====================================================================
-- 0008 — Stockage privé et verrouillage des droits
-- =====================================================================

-- Bucket privé : aucune URL permanente, uniquement des URL signées.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'debrief-attachments',
  'debrief-attachments',
  false,
  10485760, -- 10 Mo par fichier
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Lecture : un permanent ne peut lire un objet que si le débriefing
-- correspondant lui est accessible. Les URL signées émises côté serveur
-- restent le chemin normal ; cette politique est une seconde barrière.
drop policy if exists debrief_attachments_read on storage.objects;
create policy debrief_attachments_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'debrief-attachments'
    and exists (
      select 1 from public.attachments a
      where a.storage_path = storage.objects.name
        and public.can_access_debrief(a.debrief_id)
    )
  );

drop policy if exists debrief_attachments_admin on storage.objects;
create policy debrief_attachments_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'debrief-attachments' and public.is_admin())
  with check (bucket_id = 'debrief-attachments' and public.is_admin());

-- Aucun accès anonyme au bucket : les téléversements publics passent par
-- une URL d'upload signée générée côté serveur (clé de service).

-- ---------------------------------------------------------------------
-- Verrouillage des droits du rôle `anon`
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Les permanents gardent l'accès aux tables, filtré par RLS.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Suppression des pièces jointes du stockage quand un débriefing part.
create or replace function public.cleanup_attachment_objects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from storage.objects
  where bucket_id = 'debrief-attachments' and name = old.storage_path;
  return old;
end;
$$;

create trigger attachments_cleanup_objects
  after delete on public.attachments
  for each row execute function public.cleanup_attachment_objects();
