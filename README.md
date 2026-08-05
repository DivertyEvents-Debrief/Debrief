# Débriefing après événement

Plateforme de débriefing pour une agence événementielle.

- **Espace public** — les référents remplissent un débriefing sans compte, depuis leur téléphone, à la fin d'une prestation.
- **Espace permanent** — les commerciaux, les Commercial + et l'administrateur consultent, traitent et analysent ces débriefings.

---

## Architecture

```
Navigateur (référent, sans compte)
   │
   ├── lecture   ──► RPC get_public_form()      clé anon, SECURITY DEFINER
   │                 (définition du formulaire, colonne par colonne)
   │
   └── écriture  ──► Fonction Edge public-submission
                        │  clé de service
                        ▼
                     RPC submit_debrief()   validation + écriture
                                            dans UNE transaction

Navigateur (permanent, connecté)
   │  clé anon + session
   ▼
Supabase Postgres  ── RLS ──►  débriefings filtrés par rôle
Supabase Storage   ── bucket privé + URL signées
```

Le front est **entièrement statique** : GitHub Pages sert des fichiers, rien
d'autre. Il n'existe aucun serveur applicatif, donc aucun endroit où cacher
un secret côté front — tout ce que reçoit le navigateur est lisible par le
visiteur. Les deux seules portes vers la base sont donc conçues pour être
appelées depuis un client hostile.

Quatre décisions structurantes :

1. **Le rôle `anon` n'a aucun accès aux tables.** Il ne peut exécuter que
   `get_public_form()` en lecture et rien en écriture. Ces fonctions
   choisissent colonne par colonne ce qui sort de la base : impossible de
   lister les débriefings ou les coordonnées des référents en tapant l'API
   à la main, même en connaissant l'URL du projet et la clé anon.
2. **La clé de service ne quitte jamais la fonction Edge.** Elle n'apparaît
   ni dans le dépôt, ni dans le bundle, ni dans les variables du workflow
   de déploiement du front.
3. **Le périmètre de rôle est appliqué en base**, dans les politiques RLS et
   dans `filter_debriefs()`. Un commercial qui forge une requête ou modifie
   une URL obtient un ensemble vide, pas une erreur d'autorisation côté
   client. La garde de navigation React ne sécurise rien : elle évite
   d'afficher des écrans vides.
4. **Les agrégations sont calculées en SQL.** Le navigateur reçoit des
   résultats, jamais la table complète des débriefings.

### Périmètre par rôle

| | Commercial | Commercial + | Administrateur |
|---|---|---|---|
| Lire ses débriefings | ✔ | ✔ | ✔ |
| Lire tous les débriefings | — | ✔ | ✔ |
| Notes internes, statut, rappel | ✔ (les siens) | ✔ | ✔ |
| Réattribuer un débriefing | — | — | ✔ |
| Statistiques rapides | — | — | ✔ (permission `statistics_full`) |
| Constructeur de formulaire | — | — | ✔ (permission `form_builder`) |
| Comptes, référents, réglages | — | — | ✔ |

Un Commercial + peut recevoir `statistics_full` ou `form_builder` via la table `profile_permissions` — c'est le seul moyen d'élargir ses droits, et il passe par l'administrateur.

### Versionnement du formulaire

Chaque réponse enregistre un **instantané du module** (`debrief_responses.module_snapshot`) : titre, aide, type, options, ordre. Modifier ou archiver un module ne change donc rien aux débriefings déjà envoyés — ils continuent d'afficher les questions telles qu'elles existaient le jour de l'envoi. Un module déjà utilisé ne peut pas être supprimé (un trigger le refuse) : il s'archive.

Une version publiée doit contenir exactement un module pour chacun des quatre rôles indispensables : `referent`, `event_date`, `commercial`, `client_name`. `publish_form_version()` vérifie cette règle et refuse la publication sinon.

---

## Installation

Le guide pas à pas, avec les écrans et les endroits exacts où cliquer, est
dans **[DEPLOIEMENT.md](DEPLOIEMENT.md)**. Voici la version courte pour
travailler en local.

### 1. Récupérer le projet

```bash
npm install
cp .env.example .env.local
```

Renseignez dans `.env.local` :

| Variable | Où la trouver |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | même écran, clé `anon public` |
| `VITE_BASE_PATH` | laisser vide en local |

La clé de service n'a rien à faire ici : elle ne sert qu'aux scripts et à la
fonction Edge.

### 2. Base de données

```bash
# `npm install -g supabase` n'est plus pris en charge : la ligne de
# commande s'installe en dépendance du projet.
npm install -D supabase
npx supabase login
npx supabase link --project-ref VOTRE_REF
npx supabase db push                 # applique supabase/migrations/
```

Le paramétrage initial (réglages, statuts, référents, formulaire version 1)
est dans `supabase/seed.sql`. Sur un projet hébergé, collez-le dans
Supabase → SQL Editor. En local, `supabase db reset` applique migrations et
seed d'un coup.

### 3. Fonction Edge

```bash
npx supabase secrets set SUBMISSION_FINGERPRINT_SALT="$(openssl rand -hex 32)"
npx supabase secrets set ALLOWED_ORIGINS="https://VOTRE-PSEUDO.github.io"
npx supabase functions deploy public-submission --no-verify-jwt
```

Tout cela se fait aussi depuis le tableau de bord, sans rien installer :
Edge Functions → *Deploy a new function* → *Via Editor*, puis onglet
*Secrets*. Dans ce cas, pensez à désactiver « Verify JWT with legacy
secret » dans les réglages de la fonction — l'équivalent de
`--no-verify-jwt`, et il se réactive à chaque redéploiement.

`--no-verify-jwt` est nécessaire : les référents n'ont pas de compte, donc
pas de jeton. La fonction applique ses propres contrôles à la place — code
d'accès facultatif, limitation de débit par empreinte, champ piège, captcha.

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectées automatiquement
dans les fonctions Edge : rien à configurer.

### 4. Premier administrateur

Le rôle vient de `app_metadata`, jamais du navigateur. Créez le compte via
l'API d'administration :

```bash
curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"vous@agence.fr","password":"…","email_confirm":true,
       "app_metadata":{"role":"admin"},
       "user_metadata":{"first_name":"Prénom","last_name":"Nom"}}'
```

Le trigger `on_auth_user_created` crée le profil correspondant. Pour
promouvoir un compte existant :

```sql
update public.profiles set role = 'admin' where email = 'vous@agence.fr';
```

### 5. Lancement

```bash
npm run dev
```

- Formulaire public : <http://localhost:5173/debrief>
- Espace permanent : <http://localhost:5173/espace>

### 6. Données de démonstration

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:demo
```

140 débriefings sur six mois, cinq comptes, notes variées, rappels traités et
non traités, retours matériels. Les mots de passe sont générés aléatoirement
et affichés une seule fois dans la console.

---

## Stockage des images

Bucket **privé** `debrief-attachments`, créé par la migration `0008`.

| Étape | Mécanisme |
|---|---|
| Le référent joint une photo | Server Action → URL d'upload signée limitée à `submissions/<draft_id>/` |
| Envoi du débriefing | `submit_debrief()` refuse tout chemin hors du dossier du brouillon |
| Un permanent consulte | URL signée temporaire, générée à la demande |
| Un permanent non habilité | La politique `storage.objects` refuse l'objet |

Aucune URL permanente n'existe. La compression navigateur (`browser-image-compression`) vise 2400 px et une qualité de 0,86 — assez pour alléger l'envoi, pas assez pour effacer un défaut matériel photographié.

---

## Emails

Les notifications in-app fonctionnent sans configuration. Pour les emails, renseignez `RESEND_API_KEY` et `NOTIFICATION_FROM_EMAIL`, puis activez le réglage `email_notifications_enabled`.

L'email ne contient qu'un résumé et un lien vers la fiche — jamais les images ni le détail des réponses. Chaque permanent choisit sa préférence : immédiate, résumé quotidien, uniquement en cas de demande de rappel, ou aucune.

---

## Fonctionnement des statistiques

Toutes les fonctions statistiques suivent le même schéma :

```sql
select public.stats_kpis('{"date_from":"2026-01-01","date_to":"2026-03-31"}'::jsonb);
```

1. `assert_statistics_access()` vérifie la permission `statistics_full` ;
2. `filter_debriefs(filtres)` applique le périmètre de rôle **puis** les filtres ;
3. l'agrégation se fait en SQL et renvoie un résultat compact.

Fonctions disponibles : `stats_kpis`, `stats_rating_distribution`, `stats_rating_timeseries`, `stats_by_commercial`, `stats_by_referent`, `stats_by_client`, `stats_callbacks`, `stats_material`, `stats_custom_fields`, `stats_alerts`. Le tableau de bord utilise `dashboard_summary()`, qui n'exige pas la permission complète et reste borné au périmètre de l'utilisateur.

La comparaison avec la période précédente décale la fenêtre d'une durée identique. Sans dates, `previous` vaut `null` et l'interface affiche « comparaison impossible » plutôt qu'une évolution inventée.

### Ajouter un champ aux statistiques

1. Dans le constructeur de formulaire, activez **« Inclure ce champ dans les statistiques »** sur le module ;
2. Publiez une nouvelle version ;
3. `stats_custom_fields()` reprend automatiquement le champ : moyenne pour les notes, répartition pour les choix, pourcentage pour les oui/non.

Les textes longs sont volontairement exclus des agrégats quantitatifs — ils restent interrogeables par la recherche.

### Si le volume augmente

Les index posés en `0004` couvrent les filtres courants. Au-delà de quelques dizaines de milliers de débriefings :

```sql
create materialized view public.mv_debrief_daily as
select event_date, commercial_id,
       count(*) as debrief_count,
       avg(overall_rating) as overall_average,
       avg(internal_satisfaction_rating) as internal_average
from public.debriefs
where archived_at is null
group by 1, 2;

create unique index on public.mv_debrief_daily (event_date, commercial_id);
```

Rafraîchissez avec `refresh materialized view concurrently` via `pg_cron`, et faites lire cette vue par `stats_rating_timeseries` quand aucun filtre fin n'est actif. Le bouton « Actualiser les données » déclenche le rafraîchissement et affiche l'horodatage.

---

## Confidentialité

- `retention_months` (36 par défaut) pilote `purge_expired_data()`, à planifier via `pg_cron` ;
- la suppression d'un débriefing supprime ses pièces jointes du stockage (trigger) et laisse une trace dans le journal ;
- l'adresse IP des visiteurs n'est jamais stockée : seule une empreinte salée sert à la limitation de débit ;
- aucun service de suivi publicitaire.

---

## Tests

```bash
npm test              # validation, formats, notes, comparaisons de période
npm run test:e2e      # parcours complet du formulaire public
```

Les tests d'autorisation (`tests/security.rls.test.ts`) s'exécutent contre une instance Supabase locale et vérifient qu'un commercial ne peut lire ni les débriefings d'un autre, ni le module de statistiques, ni se réattribuer un dossier.

---

## Déploiement

Deux workflows GitHub Actions, déclenchés par une poussée sur `main` :

| Fichier | Ce qu'il fait |
| --- | --- |
| `.github/workflows/deploy-pages.yml` | vérifie les types, lance les tests, construit le front et le publie sur GitHub Pages |
| `.github/workflows/deploy-supabase.yml` | applique les migrations SQL et redéploie la fonction Edge |

Réglages à faire une fois, dans **Settings → Secrets and variables →
Actions** du dépôt :

| Type | Nom | Valeur |
| --- | --- | --- |
| Variable | `VITE_SUPABASE_URL` | URL du projet Supabase |
| Variable | `VITE_SUPABASE_ANON_KEY` | clé `anon public` |
| Variable | `VITE_BASE_PATH` | `/nom-du-depot/` — ou `/` pour un dépôt `pseudo.github.io` |
| Variable | `SUPABASE_PROJECT_REF` | référence du projet |
| Secret | `SUPABASE_ACCESS_TOKEN` | jeton personnel Supabase |
| Secret | `SUPABASE_DB_PASSWORD` | mot de passe base du projet |

La clé anon est en **variable** et non en secret : elle part de toute façon
dans le JavaScript envoyé au navigateur. C'est voulu, et sans danger tant
que les tables restent fermées à `anon`. La clé de service, elle, n'apparaît
dans aucun des deux workflows.

Dans Supabase → Authentication → URL Configuration, ajoutez l'adresse
GitHub Pages aux redirections autorisées, sinon les liens d'invitation
renvoient vers `localhost`.

Le formulaire public est servi avec `noindex`. Pour restreindre davantage
l'accès, passez `public_access_mode` à `"code"` dans les réglages et créez
un code dans `public_access_codes`.

### Le détail qui surprend

GitHub Pages ne connaît pas les routes du navigateur. Ouvrir directement
`https://…/debriefs/espace` renverrait une erreur 404. Le script
`scripts/postbuild.mjs` copie donc `index.html` en `404.html` : Pages sert
l'application depuis sa page d'erreur, le routeur reprend la main et affiche
le bon écran. C'est la méthode standard pour héberger une application à
navigation côté client sur Pages.
