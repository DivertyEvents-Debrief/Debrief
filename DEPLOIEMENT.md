# Mise en ligne, pas à pas

Ce guide part de zéro : un dépôt GitHub vide et un compte Supabase vide.
Comptez une heure la première fois. Chaque étape indique où cliquer et
comment vérifier que ça a marché avant de passer à la suivante.

À la fin, deux adresses fonctionneront :

- le formulaire public, à envoyer aux référents ;
- l'espace équipe, réservé aux permanents.

---

## Étape 1 — Créer le projet Supabase

1. Allez sur <https://supabase.com/dashboard>, bouton **New project**.
2. Nom : `debriefs`. Région : **West EU (Ireland)** — la plus proche.
3. **Database Password** : cliquez sur *Generate a password* et **collez-le
   tout de suite dans un gestionnaire de mots de passe**. Il ne sera plus
   jamais affiché et il vous servira à l'étape 6.
4. **Create new project**, puis attendez deux à trois minutes.

Ensuite, allez dans **Project Settings** (roue dentée en bas à gauche) →
**API**. Gardez cet onglet ouvert : vous y trouverez trois valeurs.

| Sur l'écran Supabase | Ce que c'est | Où elle va |
| --- | --- | --- |
| **Project URL** | adresse du projet | variable GitHub + `.env.local` |
| **anon public** | clé publique | variable GitHub + `.env.local` |
| **service_role** | clé toute-puissante | **nulle part dans le dépôt** |

> La clé `service_role` contourne toutes les protections. Elle ne doit
> jamais être collée dans un fichier du projet, ni dans une variable
> GitHub. Elle ne servira qu'à l'étape 5, dans Supabase même.

**Vérification :** vous avez noté quelque part le mot de passe base, l'URL
du projet et les deux clés.

---

## Étape 2 — Créer les tables

1. Dans Supabase, menu de gauche : **SQL Editor**.
2. Ouvrez le premier fichier du dossier `supabase/migrations/` du projet
   (`20260804000100_foundations.sql`), copiez tout son contenu, collez-le
   dans l'éditeur, cliquez **Run**.
3. Recommencez **dans l'ordre des noms de fichiers**, un par un :

   ```
   20260804000100_foundations.sql
   20260804000200_core_tables.sql
   20260804000300_form_builder.sql
   20260804000400_debriefs.sql
   20260804000500_submission_and_workflow.sql
   20260804000600_rls_policies.sql
   20260804000700_statistics.sql
   20260804000800_storage_and_grants.sql
   20260805000100_public_form_rpc.sql
   20260805000200_workspace_rpc.sql
   ```

   L'ordre compte : chaque fichier s'appuie sur le précédent.
4. Enfin, collez et exécutez `supabase/seed.sql`. Il crée les réglages, les
   statuts, les référents d'exemple, le matériel et la **version 1 du
   formulaire**.

**Vérification :** menu **Table Editor**, vous devez voir une trentaine de
tables. Ouvrez `form_modules` : elle contient 17 lignes.

> Une fois l'étape 7 faite, vous n'aurez plus jamais à copier-coller du
> SQL : le workflow GitHub appliquera les nouvelles migrations tout seul.

---

## Étape 3 — Créer votre compte administrateur

Le rôle est stocké dans les métadonnées d'authentification, pas dans un
champ modifiable depuis le navigateur. On crée donc le compte à la main.

1. Menu **Authentication** → **Users** → **Add user** → *Create new user*.
2. Email et mot de passe, cochez **Auto Confirm User**. Créez.
3. Retournez dans **SQL Editor** et exécutez, en remplaçant l'adresse :

   ```sql
   update auth.users
      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                              || '{"role":"admin"}'::jsonb
    where email = 'vous@agence.fr';

   update public.profiles
      set role = 'admin', first_name = 'Prénom', last_name = 'Nom', active = true
    where email = 'vous@agence.fr';
   ```

**Vérification :** dans **Table Editor** → `profiles`, votre ligne affiche
`role = admin`.

---

## Étape 4 — Vérifier le stockage des images

Le bucket est créé par la migration `000800`.

1. Menu **Storage**. Vous devez voir `debrief-attachments`.
2. Il doit être marqué **Private**. S'il apparaît public, ouvrez-le,
   **Configuration**, décochez *Public bucket*, enregistrez.

Un bucket privé signifie qu'aucune photo n'est accessible par une simple
URL devinée : l'espace permanent génère un lien signé, valable quelques
minutes, à chaque affichage.

---

## Étape 5 — Déployer la fonction d'envoi

C'est la pièce qui remplace le serveur. Elle détient la clé de service et
reste la seule à pouvoir écrire un débriefing.

Sur votre ordinateur, dans le dossier du projet :

```bash
npm install -g supabase
supabase login
supabase link --project-ref VOTRE_REF
```

`VOTRE_REF` est la suite de lettres dans l'URL du tableau de bord :
`https://supabase.com/dashboard/project/`**`abcdefghijklm`**.

Puis :

```bash
# Sel de hachage des empreintes visiteurs. Aucune adresse IP n'est
# stockée en clair : seul ce hachage salé sert à limiter les abus.
supabase secrets set SUBMISSION_FINGERPRINT_SALT="$(openssl rand -hex 32)"

# Adresse autorisée à appeler la fonction (à ajuster à l'étape 8).
supabase secrets set ALLOWED_ORIGINS="https://VOTRE-PSEUDO.github.io"

supabase functions deploy public-submission --no-verify-jwt
```

Sous Windows sans `openssl`, remplacez la première commande par :

```powershell
supabase secrets set SUBMISSION_FINGERPRINT_SALT=(-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) }))
```

**Vérification :** menu **Edge Functions**, `public-submission` apparaît
avec le statut *Deployed*.

---

## Étape 6 — Envoyer le projet sur GitHub

1. Sur GitHub, **New repository**. Nom : `debriefs`. **Privé** de
   préférence — le code n'a pas besoin d'être public pour que le site le
   soit.
2. Dans le dossier du projet :

   ```bash
   git init
   git add .
   git commit -m "Application de débriefing"
   git branch -M main
   git remote add origin https://github.com/VOTRE-PSEUDO/debriefs.git
   git push -u origin main
   ```

`.gitignore` exclut déjà `.env.local` et `node_modules`.

**Vérification :** le dépôt affiche vos fichiers, et **aucun** fichier
`.env.local`.

---

## Étape 7 — Renseigner les réglages GitHub

Dans le dépôt : **Settings** → **Secrets and variables** → **Actions**.

Onglet **Variables**, bouton *New repository variable*, quatre fois :

| Nom | Valeur |
| --- | --- |
| `VITE_SUPABASE_URL` | l'URL du projet (étape 1) |
| `VITE_SUPABASE_ANON_KEY` | la clé `anon public` (étape 1) |
| `VITE_BASE_PATH` | `/debriefs/` — le nom du dépôt entre deux barres |
| `SUPABASE_PROJECT_REF` | la référence du projet (étape 5) |

Onglet **Secrets**, bouton *New repository secret*, deux fois :

| Nom | Valeur |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | à générer sur <https://supabase.com/dashboard/account/tokens> |
| `SUPABASE_DB_PASSWORD` | le mot de passe base noté à l'étape 1 |

> Pourquoi la clé anon est-elle une simple *variable* et pas un *secret* ?
> Parce qu'elle finit forcément dans le JavaScript envoyé au navigateur :
> la cacher dans GitHub ne la cacherait de personne. Elle n'ouvre rien
> toute seule — les tables sont fermées à `anon`, et seule la fonction
> `get_public_form()` lui répond.

Ensuite : **Settings** → **Pages** → *Build and deployment* → **Source :
GitHub Actions**.

---

## Étape 8 — Lancer le déploiement

Onglet **Actions** du dépôt. Deux workflows apparaissent. Lancez
*Déploiement GitHub Pages* avec **Run workflow**, ou poussez n'importe
quelle modification.

Le workflow vérifie les types, lance les tests, construit le site et le
publie. Comptez deux minutes. Une pastille verte signale la réussite ;
l'adresse s'affiche dans l'encadré *deploy*.

Votre site est à `https://VOTRE-PSEUDO.github.io/debriefs/`.

Deux réglages à corriger maintenant que vous connaissez l'adresse :

```bash
supabase secrets set ALLOWED_ORIGINS="https://VOTRE-PSEUDO.github.io"
```

et dans Supabase → **Authentication** → **URL Configuration** :

- **Site URL** : `https://VOTRE-PSEUDO.github.io/debriefs/`
- **Redirect URLs** : ajoutez la même adresse.

Sans ça, la connexion à l'espace équipe renvoie vers `localhost`.

---

## Étape 9 — Vérifier que tout marche

Dans cet ordre :

1. Ouvrez `https://VOTRE-PSEUDO.github.io/debriefs/` → le formulaire
   s'affiche avec les questions et la liste des référents. **Si la liste
   est vide**, le seed de l'étape 2 n'est pas passé.
2. Remplissez-le entièrement et envoyez. Un tampon vert affiche une
   référence du type `DBF-2026-000001`. **Si l'envoi échoue**, ouvrez la
   console du navigateur (F12) : une erreur CORS signifie que
   `ALLOWED_ORIGINS` ne correspond pas à votre adresse.
3. Ouvrez `https://VOTRE-PSEUDO.github.io/debriefs/espace`, connectez-vous
   avec le compte de l'étape 3 → le tableau de bord affiche 1 débriefing.
4. Rechargez la page du formulaire juste après l'envoi, puis renvoyez : la
   même référence revient, sans créer de doublon. C'est le comportement
   attendu.

---

## Les pièges qu'on rencontre vraiment

**Page blanche sur GitHub Pages.** `VITE_BASE_PATH` ne correspond pas au
nom du dépôt. Ouvrez la console (F12) : les fichiers cherchés à la racine
au lieu de `/debriefs/` confirment le diagnostic. Corrigez la variable et
relancez le workflow.

**404 en ouvrant directement `/espace`.** Le fichier `404.html` n'a pas été
généré. Vérifiez que l'étape *Construction* du workflow affiche bien
« Post-build : 404.html et .nojekyll ajoutés. »

**« Le formulaire n'est pas publié ».** Aucune version n'a le statut
`published`. Dans **Table Editor** → `form_versions`, passez la ligne 1 à
`published`.

**Erreur CORS à l'envoi.** `ALLOWED_ORIGINS` doit contenir l'origine seule,
sans le chemin : `https://pseudo.github.io` et non
`https://pseudo.github.io/debriefs/`.

**« Identifiants incorrects » avec le bon mot de passe.** Le compte n'est
pas confirmé. Dans **Authentication** → **Users**, ouvrez-le et utilisez
*Confirm email*.

**Les migrations ne s'appliquent pas automatiquement.** Vérifiez
`SUPABASE_ACCESS_TOKEN` et `SUPABASE_DB_PASSWORD` dans les secrets du
dépôt : ce sont les deux causes habituelles.

---

## Au quotidien

- **Modifier le formulaire** : passera par l'écran d'administration une
  fois le lot 4 livré. En attendant, `form_modules` se modifie dans le
  Table Editor.
- **Ajouter un permanent** : étape 3, en mettant `commercial` ou
  `commercial_plus` à la place de `admin`.
- **Publier une correction** : `git push` sur `main`. Les deux workflows
  se déclenchent seuls, le site est à jour en deux minutes.
- **Protéger le formulaire** : passez `public_access_mode` à `"code"` dans
  `application_settings` et ajoutez une ligne dans `public_access_codes`.
  Le formulaire demandera alors ce code avant de s'afficher.
