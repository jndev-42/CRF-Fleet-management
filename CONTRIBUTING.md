# Guide de contribution

Ce document explique comment lancer le projet en local, le tester et le déployer.

---

## Prérequis

- [Node.js](https://nodejs.org/) 18 ou supérieur
- Un compte [Turso](https://turso.tech/) (ou un fichier SQLite local)
- Un projet OAuth2 [Google Cloud](https://console.cloud.google.com/) (pour l'authentification)
- Optionnel : un compte [OneSignal](https://onesignal.com/) (pour les notifications push)

---

## Lancement en local

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

Créez un fichier `.env` à la racine :

```env
# NextAuth
AUTH_SECRET=une_valeur_aleatoire_longue   # npx auth secret

# Google OAuth2
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Base de données (fichier local SQLite pour le dev)
TURSO_DATABASE_URL=file:./dev.db
TURSO_AUTH_TOKEN=                         # laisser vide pour un fichier local

# OneSignal (optionnel en dev)
ONESIGNAL_ID=
ONESIGNAL_API_KEY=

# Renault Connect (optionnel)
RENAULT_MAIL=
RENAULT_PASS=
```

> Pour l'OAuth2 Google, configurez l'URI de redirection autorisée sur `http://localhost:3000/api/auth/callback/google` dans la Google Cloud Console.

### 4. Initialiser la base de données

Le projet utilise des scripts de migration dans `scripts/`. Pour initialiser une base vierge, exécutez-les dans l'ordre (ils sont idempotents) :

```bash
npx tsx scripts/migrate-roles.ts
npx tsx scripts/add-second-driver.ts
npx tsx scripts/add-vehicle-fields.ts
npx tsx scripts/add-notifications-table.ts
npx tsx scripts/add-reservation-table.ts
npx tsx scripts/add-reservation-status.ts
npx tsx scripts/add-vehicle-checklist.ts
npx tsx scripts/add-trip-drive-folder.ts
npx tsx scripts/add-renault-session-table.ts
```

Pour créer le premier compte ADMIN (après une première connexion Google) :

```bash
npx tsx scripts/setup-admin.ts votre.email@croix-rouge.fr
```

### 5. Lancer le serveur de développement

```bash
npm run dev
```

L'application est accessible sur [http://localhost:3000](http://localhost:3000).

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
