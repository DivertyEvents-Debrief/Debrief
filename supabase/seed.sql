-- =====================================================================
-- Seed — paramétrage de base et version 1 du formulaire public
-- Rejouable : tout est en `on conflict do nothing / do update`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Paramètres de l'application
-- ---------------------------------------------------------------------
insert into public.application_settings (key, value, description) values
  ('platform_name',        '"Débriefs"'::jsonb,                    'Nom affiché de la plateforme'),
  ('logo_url',             'null'::jsonb,                          'URL du logo (vide = monogramme)'),
  ('primary_color',        '"#1F8A4C"'::jsonb,                     'Couleur principale'),
  ('secondary_color',      '"#E8892B"'::jsonb,                     'Couleur secondaire chaleureuse'),
  ('welcome_message',      '"Merci pour votre prestation. Ce débriefing prend environ 5 minutes et aide toute l''équipe à progresser."'::jsonb, 'Message d''accueil du formulaire public'),
  ('confirmation_message', '"C''est envoyé, merci ! Votre commercial reçoit le débriefing immédiatement."'::jsonb, 'Texte affiché après l''envoi'),
  ('privacy_notice',       '"Les informations saisies sont utilisées uniquement en interne pour le suivi des prestations. Elles sont conservées 36 mois."'::jsonb, 'Mentions sous le formulaire'),
  ('privacy_policy_url',   'null'::jsonb,                          'Lien vers la politique de confidentialité'),
  ('retention_months',     '36'::jsonb,                            'Durée de conservation des débriefings (mois)'),
  ('callback_details_enabled', 'true'::jsonb,                      'Champ « à quel sujet » après une demande de rappel'),
  ('max_files',            '10'::jsonb,                            'Nombre maximal d''images par débriefing'),
  ('max_file_size_mb',     '10'::jsonb,                            'Taille maximale par image (Mo)'),
  ('max_total_size_mb',    '60'::jsonb,                            'Taille maximale cumulée (Mo)'),
  ('accepted_formats',     '["image/jpeg","image/png","image/webp"]'::jsonb, 'Types MIME acceptés'),
  ('public_access_mode',   '"open"'::jsonb,                        'open | code : protection du formulaire public'),
  ('captcha_enabled',      'false'::jsonb,                         'Vérification anti-robot'),
  ('honeypot_enabled',     'true'::jsonb,                          'Champ piège anti-spam'),
  ('rate_limit_per_hour',  '20'::jsonb,                            'Envois maximum par empreinte et par heure'),
  ('email_notifications_enabled', 'false'::jsonb,                  'Envoi des emails de notification')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Statuts de traitement
-- ---------------------------------------------------------------------
insert into public.statuses (code, label, description, icon, tone, is_default, is_terminal, sort_order) values
  ('new',         'Nouveau',    'Reçu, pas encore ouvert',              'sparkles',    'info',       true,  false, 10),
  ('read',        'Lu',         'Ouvert par un permanent',              'eye',         'neutral',    false, false, 20),
  ('to_callback', 'À rappeler', 'Le référent souhaite être recontacté', 'phone',       'attention',  false, false, 30),
  ('in_progress', 'En cours',   'Traitement engagé',                    'loader',      'progress',   false, false, 40),
  ('processed',   'Traité',     'Suivi terminé',                        'check',       'success',    false, true,  50),
  ('archived',    'Archivé',    'Sorti du flux courant',                'archive',     'muted',      false, true,  60)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- Référents
-- ---------------------------------------------------------------------
insert into public.referents (display_name, internal_identifier, sort_order) values
  ('Camille',  'camille.b',  10),
  ('Nadia',    'nadia.k',    20),
  ('Thomas',   'thomas.r',   30),
  ('Léa',      'lea.m',      40),
  ('Yanis',    'yanis.d',    50),
  ('Margaux',  'margaux.p',  60),
  ('Sofiane',  'sofiane.a',  70),
  ('Élodie',   'elodie.v',   80)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Matériel : catégories et catalogue de suggestions
-- ---------------------------------------------------------------------
insert into public.material_categories (label, sort_order) values
  ('Son et lumière', 10),
  ('Mobilier', 20),
  ('Jeux et animation', 30),
  ('Informatique', 40),
  ('Logistique', 50)
on conflict do nothing;

insert into public.materials (label, category_id)
select m.label, c.id
from (values
  ('Enceinte portable', 'Son et lumière'),
  ('Micro HF', 'Son et lumière'),
  ('Vidéoprojecteur', 'Informatique'),
  ('Tablettes', 'Informatique'),
  ('Malle escape game', 'Jeux et animation'),
  ('Buzzers', 'Jeux et animation'),
  ('Talkies-walkies', 'Logistique'),
  ('Mange-debout', 'Mobilier'),
  ('Rallonges et multiprises', 'Logistique'),
  ('Chronomètre', 'Jeux et animation')
) as m(label, category)
left join public.material_categories c on c.label = m.category
on conflict (normalized_label) do nothing;

-- ---------------------------------------------------------------------
-- Version 1 du formulaire
-- ---------------------------------------------------------------------
insert into public.form_versions (version_number, label, status, published_at)
values (1, 'Formulaire initial', 'published', now())
on conflict (version_number) do nothing;

insert into public.form_sections (form_version_id, section_key, title, description, sort_order)
select v.id, s.section_key, s.title, s.description, s.sort_order
from public.form_versions v,
(values
  ('general',     'Informations générales', 'On commence par situer la prestation.', 10),
  ('rating',      'Appréciation générale',  'Votre ressenti global sur l''événement.', 20),
  ('feedback',    'Retour général',         'Prenez le temps : ces retours nourrissent les prochaines prestations.', 30),
  ('internal',    'Suivi interne',          'Pour que l''équipe sache quoi faire ensuite.', 40),
  ('material',    'Retour matériel',        'Signalez ce qui manquait, cassait ou fonctionnait mal.', 50),
  ('attachments', 'Photos',                 'Une photo vaut souvent mieux qu''un paragraphe.', 60),
  ('final',       'Pour finir',             'Tout ce qui n''entrait pas dans les cases précédentes.', 70)
) as s(section_key, title, description, sort_order)
where v.version_number = 1
on conflict (form_version_id, section_key) do nothing;

insert into public.form_modules (
  form_version_id, section_key, technical_key, module_type, functional_role,
  title, help_text, placeholder, required, include_in_statistics, sort_order, configuration
)
select v.id, m.section_key, m.technical_key, m.module_type::public.form_module_type,
       m.functional_role::public.module_functional_role,
       m.title, m.help_text, m.placeholder, m.required, m.in_stats, m.sort_order, m.configuration::jsonb
from public.form_versions v,
(values
  ('general', 'referent', 'searchable_select', 'referent',
   'Votre prénom', 'Sélectionnez-vous dans la liste.', 'Rechercher un prénom', true, false, 10,
   '{"source":"referents"}'),

  ('general', 'event_date', 'date', 'event_date',
   'Date de l''événement', 'La date de la prestation, pas celle du jour si elles diffèrent.', null, true, false, 20,
   '{"default":"today","max_offset_days":30}'),

  ('general', 'commercial', 'searchable_select', 'commercial',
   'Commercial en charge', 'Le débriefing lui sera transmis directement.', 'Rechercher un commercial', true, false, 30,
   '{"source":"commercials"}'),

  ('general', 'client_name', 'short_text', 'client_name',
   'Nom de la prestation ou du client', 'Exemple : Séminaire Volvo, Escape game Groupama.', 'Nom de la prestation ou du client', true, false, 40,
   '{"max_length":160}'),

  ('rating', 'overall_rating', 'rating_5', 'overall_rating',
   'Comment s''est passé l''événement dans l''ensemble ?', 'Une seule note, votre première impression est souvent la bonne.', null, true, true, 50,
   '{"options":[{"value":1,"emoji":"😫","label":"Abominable"},{"value":2,"emoji":"😕","label":"Mauvais"},{"value":3,"emoji":"😐","label":"Moyen"},{"value":4,"emoji":"🙂","label":"Très bien"},{"value":5,"emoji":"🤩","label":"Formidable"}]}'),

  ('feedback', 'venue', 'long_text', 'none',
   'Vos retours sur le lieu de l''événement', 'Accueil, espaces, accessibilité, confort, stationnement, circulation sur place…', 'Ce qui a facilité ou compliqué les choses sur place', false, false, 60,
   '{"max_length":4000,"rows":5}'),

  ('feedback', 'brief_preparation', 'long_text', 'none',
   'Vos remarques sur le brief, la préparation de l''événement et les ressources', 'Doublons, oublis, informations manquantes, ressources utiles, qualité de la préparation…', 'Ce qui vous a aidé ou manqué avant le jour J', false, false, 70,
   '{"max_length":4000,"rows":5}'),

  ('feedback', 'timings', 'long_text', 'none',
   'Précisions sur les timings', 'Temps de trajet, installation, retard, déroulement, temps forts, temps morts…', 'Le déroulé heure par heure si besoin', false, false, 80,
   '{"max_length":4000,"rows":5}'),

  ('feedback', 'staff', 'long_text', 'none',
   'Vos retours sur le staff', 'Animation, attitude, communication, proactivité, répartition des rôles, entraide…', 'Ce qui a bien fonctionné dans l''équipe, et ce qui a coincé', false, false, 90,
   '{"max_length":4000,"rows":5}'),

  ('feedback', 'other_info', 'long_text', 'none',
   'Autres informations', 'Informations complémentaires hors matériel.', 'Tout le reste', false, false, 100,
   '{"max_length":4000,"rows":4}'),

  ('internal', 'callback_request', 'yes_no', 'callback_request',
   'Souhaitez-vous être rappelé ?', 'Choisissez « Oui » si un échange de vive voix est nécessaire.', null, true, true, 110,
   '{"yes_label":"Oui, rappelez-moi","no_label":"Non, tout est dans le débriefing"}'),

  ('internal', 'callback_details', 'short_text', 'callback_details',
   'À quel sujet souhaitez-vous être rappelé ?', 'Facultatif, mais cela fait gagner du temps.', 'En une phrase', false, false, 120,
   '{"max_length":300,"visible_when":{"field":"callback_request","equals":true}}'),

  ('internal', 'internal_rating', 'rating_5', 'internal_rating',
   'Quelle est votre satisfaction interne concernant cet événement ?', 'Côté organisation, moyens et coordination — indépendamment du ressenti client.', null, true, true, 130,
   '{"options":[{"value":1,"emoji":"😫","label":"Abominable"},{"value":2,"emoji":"😕","label":"Mauvais"},{"value":3,"emoji":"😐","label":"Moyen"},{"value":4,"emoji":"🙂","label":"Très bien"},{"value":5,"emoji":"🤩","label":"Formidable"}]}'),

  ('material', 'material_feedback', 'repeatable_group', 'material_feedback',
   'Retour matériel', 'Ajoutez une ligne par matériel concerné. Laissez vide si tout allait bien.', null, false, false, 140,
   '{"add_label":"Ajouter un retour matériel","min_items":0,"max_items":30,"fields":[{"key":"material_name","label":"Matériel concerné","type":"suggest","source":"materials","required":true,"placeholder":"Enceinte, vidéoprojecteur, malle…"},{"key":"feedback","label":"Retour, problème ou précision","type":"text","placeholder":"Ce qui s''est passé"}]}'),

  ('attachments', 'photos', 'image_upload', 'attachments',
   'Photos de l''événement ou du matériel', 'Vous pouvez prendre une photo directement depuis votre téléphone.', null, false, false, 150,
   '{"max_files":10,"max_file_size_mb":10,"accepted_formats":["image/jpeg","image/png","image/webp"]}'),

  ('final', 'final_note', 'long_text', 'none',
   'Autre chose à compléter ?', 'Ajoutez ici toute information qui ne correspond pas aux catégories précédentes.', 'On vous lit', false, false, 160,
   '{"max_length":4000,"rows":4}')
) as m(section_key, technical_key, module_type, functional_role, title, help_text, placeholder, required, in_stats, sort_order, configuration)
where v.version_number = 1
on conflict (form_version_id, technical_key) do nothing;
