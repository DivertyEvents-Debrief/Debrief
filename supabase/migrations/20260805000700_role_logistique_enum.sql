-- =====================================================================
-- Ajout du rôle « logistique » — valeur d'énumération seule
--
-- Ce fichier ne contient QUE l'ajout de la valeur. PostgreSQL interdit
-- d'utiliser une valeur d'énumération dans la même transaction que celle
-- qui la crée : tout ce qui s'appuie sur « logistique » vit donc dans la
-- migration suivante, exécutée dans une transaction distincte.
-- =====================================================================

alter type public.user_role add value if not exists 'logistique';
