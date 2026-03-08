# Guide de contribution

Ce document explique comment lancer le projet en local, le tester et le déployer.

---

## Prérequis

- [Node.js](https://nodejs.org/) 18 ou supérieur
- Optionnel : un compte [OneSignal](https://onesignal.com/) (pour les notifications push)
- Optionnel : un compte [Turso](https://turso.tech/) et un projet [Google Cloud](https://console.cloud.google.com/) (uniquement pour tester la prod en local)

---

## Lancement en local (mode développement)

Le mode développement n'exige **ni OAuth Google ni base de données cloud**. Tout fonctionne en local avec un fichier SQLite et des comptes de test préconfigurés.

### 1. Cloner le dépôt

```bash
git clone <url-du-repo>
cd cr-chauffeur
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Configurer les variables d'environnement

Créez un fichier `.env.local` à la racine avec le minimum requis :

```env
# NextAuth
AUTH_SECRET=une_valeur_aleatoire_longue   # npx auth secret

# Base de données locale (SQLite fichier)
TURSO_DATABASE_URL=file:./dev.db
TURSO_AUTH_TOKEN=                         # laisser vide pour un fichier local
```

Les variables Google OAuth, OneSignal et Renault Connect sont **optionnelles en développement** — l'app fonctionne sans elles.

### 4. Initialiser la base de données locale

Un seul script crée toutes les tables et insère 4 utilisateurs de test + 4 véhicules de démo :

```bash
npm run dev:setup
```

Ce script est **idempotent** — vous pouvez le relancer sans risque.

### 5. Lancer le serveur de développement

```bash
npm run dev
```

L'application est accessible sur [http://localhost:3000](http://localhost:3000).

### 6. Se connecter (sans OAuth)

Sur la page de connexion, un panneau **"Mode développement"** propose 4 boutons de connexion rapide :

| Bouton | Rôles simulés |
|---|---|
| Admin | `ADMIN`, `CHVL` |
| Responsable | `RESPO`, `CHVL` |
| Chauffeur | `CHVL` |
| Invité | `GUEST` |

Le bouton "Connexion Google" reste présent pour tester le flux OAuth si nécessaire (nécessite `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` configurés).

---

## Lancement en local (connecté à la prod / staging)

Pour tester avec la vraie base Turso et l'authentification Google :

```env
AUTH_SECRET=...

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```

> Configurez l'URI de redirection `http://localhost:3000/api/auth/callback/google` dans la Google Cloud Console.

Pour créer le premier compte ADMIN après une première connexion Google :

```bash
npx tsx scripts/setup-admin.ts votre.email@croix-rouge.fr
```

---

## Tests

Le projet n'a pas encore de suite de tests automatisés. La vérification se fait via :

```bash
# Vérification TypeScript et lint
npm run lint
```

Pour tester l'intégration Renault Connect :

```bash
npx tsx scripts/renault-login-test.ts
npx tsx scripts/renault-discover.ts
```

Pour inspecter le schéma de la base de données :

```bash
npx tsx scripts/show-schema.ts
```

---

## Déploiement

### Base de données (Turso)

1. Installez le CLI Turso :
   ```bash
   # macOS / Linux
   brew install tursodatabase/tap/turso
   # ou
   curl -sSfL https://get.tur.so/install.sh | bash
   ```

2. Connectez-vous et créez la base :
   ```bash
   turso auth login
   turso db create cr-chauffeur
   ```

3. Récupérez les identifiants :
   ```bash
   turso db show cr-chauffeur --url        # → TURSO_DATABASE_URL
   turso db tokens create cr-chauffeur     # → TURSO_AUTH_TOKEN
   ```

4. Pointez les scripts de migration vers la base cloud (`TURSO_DATABASE_URL` et `TURSO_AUTH_TOKEN` dans l'environnement) et exécutez-les dans le même ordre qu'en local.

### Application (Vercel)

1. Importez le dépôt depuis le [Dashboard Vercel](https://vercel.com/) : **Add New > Project**.

2. Ajoutez toutes les variables d'environnement listées dans le [README](./README.md#variables-denvironnement) avant de déployer.

3. Cliquez sur **Deploy**. Vercel détecte automatiquement Next.js et configure les serverless functions.

> **Note :** Le projet utilise `@libsql/client` en SQL natif plutôt que Prisma pour éviter les incompatibilités connues entre les migrations Prisma v7 et l'environnement Node.js serverless de Vercel.

Les déploiements suivants se font automatiquement à chaque push sur la branche `main`.

---

## Conventions

- Les routes API se trouvent dans `src/app/api/` (serverless functions Next.js)
- Les requêtes SQL sont **toutes paramétrées** (`db.execute({ sql, args })`) — ne jamais interpoler directement les valeurs
- Les accès aux routes API vérifient systématiquement la session (`auth()`) en tout premier
- Les rôles sont vérifiés côté serveur dans chaque route sensible
