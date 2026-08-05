-- =====================================================================
-- Droits de `service_role` sur les fonctions appelées par la fonction Edge
--
-- Les migrations précédentes retirent l'exécution à `public` pour fermer
-- la porte à `anon`. Or `service_role` — le rôle qu'utilise la fonction
-- Edge `public-submission` — n'accède à ces fonctions que par l'héritage
-- de `public`. Le verrouillage l'a donc enfermé dehors avec les autres.
--
-- On lui rend explicitement les deux fonctions dont il a besoin, et
-- uniquement celles-là. `anon` reste sans aucun accès : c'est bien ce
-- qu'on voulait obtenir au départ.
-- =====================================================================

grant execute on function public.submit_debrief(uuid, jsonb)   to service_role;
grant execute on function public.access_code_is_valid(text)    to service_role;

-- Les tables lues et écrites par la fonction Edge. `service_role` ignore
-- les politiques RLS, mais il lui faut malgré tout le droit sur la table.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Et pour les objets créés par les migrations à venir.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;

-- Rappel : rien de tout ceci ne concerne `anon`, qui garde exactement
-- deux fonctions exécutables (get_public_form, access_code_is_valid) et
-- aucun accès aux tables.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
