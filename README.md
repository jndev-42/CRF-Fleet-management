# 🚑 Croix-Rouge Chauffeur

Application de gestion de flotte de véhicules pour la Croix-Rouge, permettant le suivi des départs en mission et des retours de véhicules (kilométrage, niveau d'essence, vérification de l'état, équipement).

## 🛠️ Stack Technique

- **Frontend / Backend** : [Next.js](https://nextjs.org/) (App Router)
- **Style** : [Tailwind CSS](https://tailwindcss.com/)
- **Base de données** : [Turso](https://turso.tech/) (SQLite in the cloud via libSQL)
- **Hébergement** : [Vercel](https://vercel.com/)

---

## 💻 Développement Local

### Prérequis

- [Node.js](https://nodejs.org/) (version 18 ou supérieure)
- Un compte [Turso](https://turso.tech/) (optionnel pour le dev local si vous utilisez un fichier SQLite local, mais recommandé pour avoir les mêmes données).

### Installation

1. Clonez le dépôt :
   ```bash
   git clone <votre-url-git>
   cd cr-chauffeur
   ```

2. Installez les dépendances :
   ```bash
   npm install
   ```

3. Configurez les variables d'environnement en créant un fichier `.env` à la racine :
   ```env
   TURSO_DATABASE_URL=file:./dev.db
   # Laissez TURSO_AUTH_TOKEN vide pour un fichier local en développement
   ```

4. Lancez le serveur de développement :
   ```bash
   npm run dev
   ```

5. L'application sera accessible sur [http://localhost:3000](http://localhost:3000).

---

## 🚀 Déploiement Manuel (Vercel + Turso)

Suivez ces étapes pour déployer l'application manuellement ou configurer un nouvel environnement de production.

### Partie 1 : Configuration de la Base de Données (Turso)

Turso nous permet d'héberger la base de données SQLite dans le cloud, avec une API accessible depuis Vercel.

1. Installez l'outil en ligne de commande Turso :
   - Mac/Linux : `brew install tursodatabase/tap/turso` ou `curl -sSfL https://get.tur.so/install.sh | bash`
   - Windows : Consultez la [documentation Turso](https://docs.turso.tech/cli/installation).

2. Connectez-vous à votre compte Turso :
   ```bash
   turso auth login
   ```

3. Créez une nouvelle base de données :
   ```bash
   turso db create cr-chauffeur
   ```

4. Récupérez les identifiants de connexion :
   - L'URL de la base de données :
     ```bash
     turso db show cr-chauffeur --url
     # Exemple : libsql://cr-chauffeur-votrenom.turso.io
     ```
   - Le token d'authentification :
     ```bash
     turso db tokens create cr-chauffeur
     # Exemple : eyJhbGciOiJFZ...
     ```

### Partie 2 : Déploiement du Code (Vercel)

L'application est optimisée pour être déployée sur Vercel.

1. Créez un compte sur [Vercel](https://vercel.com/) si vous n'en avez pas.
2. Connectez votre dépôt GitHub à Vercel :
   - Allez sur le Dashboard Vercel.
   - Cliquez sur **Add New...** > **Project**
   - Importez le dépôt Git contenant l'application `cr-chauffeur`.
3. **Configuration des variables d'environnement** :
   Dans l'étape de configuration du projet (avant de cliquer sur Deploy), ajoutez les deux variables suivantes :
   - `TURSO_DATABASE_URL` : l'URL récupérée à l'étape 1.4 (ex: `libsql://cr-chauffeur-...`)
   - `TURSO_AUTH_TOKEN` : le token généré à l'étape 1.4
4. Cliquez sur **Deploy**.

> **Note technique** : L'API de l'application utilise directement le package `@libsql/client` (SQL natif) pour se connecter à Turso, s'affranchissant ainsi des incompatibilités connues entre Prisma v7 et l'environnement Vercel Node.js Serverless.

Et voilà ! L'application est maintenant en ligne, et connectée à votre base de données cloud 🎉.
