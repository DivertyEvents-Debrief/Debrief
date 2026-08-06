# Architecture

## 1. Choix techniques et justifications

| Question | Décision | Pourquoi |
|---|---|---|
| Où tourne l'application ? | Front statique sur GitHub Pages, logique de confiance dans une fonction Edge Supabase | Contrainte d'hébergement : Pages ne sert que des fichiers. Il n'existe aucun serveur applicatif, donc aucun endroit où cacher un secret côté front. |
| Comment un référent sans compte écrit-il en base ? | Fonction Edge `public-submission` → RPC `submit_debrief()` avec la clé de service | Aucune politique d'écriture publique à maintenir. Un seul point d'entrée, validé et journalisé, impossible à contourner depuis le navigateur. |
| Comment le navigateur lit-il le formulaire sans ouvrir les tables ? | RPC `get_public_form()`, `SECURITY DEFINER`, seule fonction exécutable par `anon` | Elle choisit colonne par colonne ce qui sort : identifiant et nom affiché des référents, rien d'autre. Un appel direct à l'API avec la clé anon ne donne accès à aucune table. |
| Comment un visiteur téléverse-t-il une image dans un bucket privé ? | URL d'upload signée limitée à `submissions/<draft_id>/` | Le visiteur n'obtient jamais de droit d'écriture général. `submit_debrief()` refuse tout chemin hors du dossier du brouillon. |
| Comment éviter les doubles envois ? | Le brouillon (`submission_drafts`) sert de jeton d'idempotence | Rejouer le même envoi renvoie le débriefing déjà créé au lieu d'en créer un second. Couvre le double clic, le rechargement et la reprise après coupure réseau. |
| Où s'arrête la validation client ? | Confort de saisie uniquement | `submit_debrief()` revalide obligatoires, longueurs, plages de notes, existence du référent et du commercial. |
| Comment garder les anciens débriefings lisibles ? | Instantané JSON du module dans chaque réponse | Modifier ou archiver un module ne réécrit rien rétroactivement. |
| Comment un commercial est-il empêché de voir les débriefings d'un autre ? | RLS + `filter_debriefs()` | Le périmètre est appliqué en base : une URL modifiée ou une requête forgée renvoient un ensemble vide. Sur un front statique, c'est la seule barrière qui compte — le JavaScript est intégralement modifiable par le visiteur. |
| Que devient le middleware de session ? | Contexte React `SessionProvider` + garde `RequireAuth` | Confort d'affichage uniquement, explicitement documenté comme tel : il évite les écrans vides, il ne protège rien. |
| Où sont calculées les statistiques ? | Fonctions SQL `SECURITY DEFINER` | Le navigateur ne reçoit jamais la table complète. Le contrôle de rôle est fait avant l'agrégation. |
| Comment l'administrateur recolore l'application ? | Une variable CSS `--brand`, dérivée par `color-mix()` | Une seule couleur en base pilote toute l'échelle : fonds, bordures, états de survol. |

### Direction artistique

Univers repris de Diverty Events : fonds clairs, vert en accent principal, une seule couleur chaude en secondaire, cartes aérées, angles arrondis à 16 px.

- **Typographie** — Bricolage Grotesque pour les titres (un grotesque à largeur variable, chaleureux sans être fantaisiste), Instrument Sans pour le texte, IBM Plex Mono pour les références et les chiffres alignés.
- **Élément signature** — le *tampon*. La référence unique d'un débriefing s'affiche comme un cachet encré légèrement incliné, écho au tampon vert de l'univers Diverty. C'est le seul endroit où l'interface se permet une fantaisie ; tout le reste reste sobre.
- **Emojis** — présents sur les notes, jamais seuls. Le chiffre et le libellé sont toujours affichés, à l'écran comme dans les exports.

## 2. Modèle de données

```
auth.users ──1:1── profiles ──*── profile_permissions
                      │
                      ├──*── debriefs.commercial_id
                      ├──*── internal_notes.author_id
                      └──*── notifications.user_id

referents ──*── debriefs
statuses  ──*── debriefs
form_versions ──*── form_sections
              └──*── form_modules ──*── debrief_responses

debriefs ──*── debrief_responses      (réponse + instantané du module)
         ├──*── material_feedback_items
         ├──*── attachments            (chemin dans le bucket privé)
         ├──*── internal_notes
         ├──*── debrief_activity_logs
         └──*── notifications

client_groups ──*── client_group_aliases   (fusion CONTRÔLÉE des libellés client)
materials ──*── material_categories
application_settings · saved_statistic_views · statistic_export_logs
submission_drafts · public_submission_events · public_access_codes
```

Colonnes dénormalisées volontaires : `debriefs.attachment_count` et `debriefs.material_feedback_count`, maintenues par trigger. Elles rendent instantanés les filtres « avec images » et « avec retour matériel » et les indicateurs statistiques associés.

Normalisation des libellés : `normalize_label()` est `IMMUTABLE` et n'utilise pas `unaccent`, ce qui permet de l'employer dans des colonnes générées et des index. Deux libellés qui ne diffèrent que par la casse, les accents ou les espaces sont regroupés — mais **jamais** deux clients réellement différents : la fusion passe par `client_group_aliases`, alimentée par l'administrateur.

## 3. Règles d'autorisation

Appliquées en base, dans cet ordre :

1. **RLS** sur chaque table. `anon` n'a aucune politique permissive : tout lui est refusé.
2. **Fonctions d'aide** `SECURITY DEFINER` : `current_user_role()`, `is_admin()`, `can_read_all_debriefs()`, `has_permission()`. Elles lisent `profiles` sans déclencher sa propre RLS, ce qui évite la récursion.
3. **Triggers de garde** : `guard_profile_privileges()` (personne ne s'auto-promeut), `guard_debrief_reassignment()` (seul l'admin réattribue), `prevent_used_module_deletion()` (un module utilisé s'archive).
4. **Contrôle dans les RPC** : `assert_statistics_access()` pour le module complet, `can_access_debrief()` avant toute action sur une fiche.

`src/lib/permissions.ts` est un miroir client de ces règles. Il sert uniquement à masquer un bouton — il ne protège rien.

## 4. Architecture du module statistiques

```
Interface (filtres, période)
        │  un objet JSON de filtres, partagé avec la liste des débriefings
        ▼
RPC stats_*(p_filters jsonb)
        │  1. assert_statistics_access()
        │  2. filter_debriefs() → périmètre de rôle PUIS filtres
        │  3. agrégation SQL
        ▼
Résultat compact (jsonb ou table)
```

Le même objet de filtres circule partout : cliquer sur une barre du graphique ouvre la liste des débriefings avec ces filtres, plus la note concernée. C'est ce qui rend chaque indicateur cliquable sans code spécifique par graphique.

## 5. Hébergement

```
GitHub (dépôt)
   │
   ├─ workflow deploy-pages.yml ──► GitHub Pages   front statique
   │     types, tests, build                       (index.html + assets + 404.html)
   │
   └─ workflow deploy-supabase.yml ──► Supabase
         supabase db push                          migrations SQL
         supabase functions deploy                 fonction Edge
```

Trois conséquences de l'hébergement statique, toutes assumées dans le code :

1. **Aucun secret côté front.** Seule la clé `anon` part dans le bundle.
   Elle est publique par conception et n'ouvre rien tant que les tables lui
   restent fermées — ce que garantit la migration `000800`, complétée par
   `000100` (2026-08-05) qui n'accorde que deux fonctions à `anon`.
2. **Le routage vit dans le navigateur.** `scripts/postbuild.mjs` copie
   `index.html` en `404.html` : Pages sert l'application depuis sa page
   d'erreur, et le routeur affiche le bon écran. Le préfixe d'URL
   (`/nom-du-depot/`) est injecté à la construction par `VITE_BASE_PATH` et
   relu par le routeur via `import.meta.env.BASE_URL`.
3. **La fonction Edge remplace exactement les Server Actions.** Mêmes
   signatures côté client (`startSubmission`, `createUploadUrl`,
   `discardUpload`, `submitDebriefAction`), donc aucun composant du
   formulaire n'a changé. Elle porte en plus le contrôle CORS, absent quand
   front et back partageaient la même origine.

## 6. Arborescence

```
debrief-app/
├── README.md · ARCHITECTURE.md · DEPLOIEMENT.md · .env.example
├── package.json · tsconfig.json · vite.config.ts · vitest.config.ts
├── index.html                               enveloppe + amorçage des couleurs
├── .github/workflows/
│   ├── deploy-pages.yml                     types, tests, build, publication
│   └── deploy-supabase.yml                  migrations + fonction Edge
├── scripts/
│   ├── postbuild.mjs                        404.html et .nojekyll
│   └── seed-demo.ts                         comptes + 140 débriefings sur 6 mois
├── supabase/
│   ├── config.toml
│   ├── functions/public-submission/index.ts empreinte, débit, captcha, submit_debrief
│   ├── functions/admin-users/index.ts       création de comptes (admin uniquement)
│   ├── migrations/
│   │   ├── …000100_foundations.sql          types, normalize_label, fonctions de sécurité
│   │   ├── …000200_core_tables.sql          profiles, referents, statuses, réglages
│   │   ├── …000300_form_builder.sql         versions, sections, modules, publication
│   │   ├── …000400_debriefs.sql             débriefings, réponses, matériel, pièces jointes
│   │   ├── …000500_submission_and_workflow  submit_debrief, statuts, conservation
│   │   ├── …000600_rls_policies.sql         RLS de toutes les tables
│   │   ├── …000700_statistics.sql           filter_debriefs + toutes les RPC stats
│   │   ├── …000800_storage_and_grants.sql   bucket privé, politiques, verrouillage anon
│   │   └── …0805000100_public_form_rpc.sql  get_public_form, droits anon
│   └── seed.sql                             réglages, statuts, référents, formulaire v1
├── tests/
│   ├── validation.test.ts                   champs obligatoires, notes, comparaisons
│   └── security.rls.test.ts                 périmètre des rôles contre une base locale
└── src/
    ├── main.tsx · App.tsx                   racine et routes
    ├── styles/globals.css                   tokens, tampon, accessibilité
    ├── lib/
    │   ├── supabase/client.ts               client navigateur, clé anon
    │   ├── session.tsx                      session + permissions (confort d'affichage)
    │   ├── public-api.ts                    pont vers la fonction Edge
    │   ├── public-form.ts                   get_public_form + identité visuelle
    │   ├── workspace-api.ts                 liste, fiche, statut, notes, images
    │   ├── admin-api.ts                     comptes, référents, statuts, réglages
    │   ├── types.ts · permissions.ts · ratings.ts · utils.ts
    │   └── form-validation.ts               règles dérivées des modules
    ├── components/
    │   ├── ui/{button,card,field,stamp,page-loader}.tsx
    │   ├── workspace/{debrief-filters,status-pill,
    │   │              attachment-gallery,response-list}.tsx
    │   ├── form/{rating-scale,searchable-select,yes-no,step-progress,
    │   │        material-feedback,image-uploader}.tsx
    │   └── public/{debrief-form,debrief-summary,submission-success}.tsx
    └── routes/
        ├── public/debrief-page.tsx          formulaire + porte du code d'accès
        └── espace/{login,layout,dashboard,require-auth,
                    debrief-list,debrief-detail,
                    administration/{layout,accounts,referents,
                                    statuses,branding,logs}}
```

### Suite prévue

Fondations, sécurité, statistiques SQL, formulaire public, espace permanent, administration, rôle logistique et constructeur de formulaire sont en place. Restent à écrire :

| Lot | Contenu | Ce sur quoi il s'appuie |
|---|---|---|
| **3** | `/espace/statistiques` : KPI avec comparaison, graphiques Recharts cliquables, tableaux par commercial / référent / client, rappels, matériel, champs personnalisés, tendances, vues enregistrées | les dix RPC `stats_*`, déjà écrites et testables en SQL |
| **6** | Exports CSV / Excel multi-feuilles / PDF individuel / PDF de synthèse / archive d'images, et emails de notification | `statistic_export_logs`, `notifications` |

Chaque lot est essentiellement de l'interface : les règles métier, le périmètre de sécurité et les agrégations qu'il consomme existent déjà et sont interrogeables en `psql`.
