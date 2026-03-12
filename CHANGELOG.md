# Changelog

## [1.15.0] — 12 mars 2026

### Ajouté
- **Utilitaire `getErrorMessage`** — Nouvelle fonction `src/lib/utils/error.ts` pour extraire de façon sûre le message d'une erreur inconnue, avec tests unitaires associés.
- **Hook pre-commit (Husky + lint-staged)** — Chaque commit exécute automatiquement ESLint avec `--max-warnings=0` sur les fichiers `.ts`/`.tsx` stagés. Tout lint non conforme bloque le commit.

### Modifié
- **Zéro erreur/avertissement ESLint** — Toutes les violations existantes corrigées (91 → 0) : remplacement des `any` par des types stricts, utilisation de `catch {}` pour les erreurs ignorées, commentaires `eslint-disable-next-line` avec justification sur les exceptions légitimes (`react-hooks/exhaustive-deps`, `@next/next/no-img-element`).
- **Composants Next.js** — `Navbar.tsx` utilise désormais `<Link>` et `<Image>` au lieu de `<a>` et `<img>`.
- **`CLAUDE.md`** — Règles de lint documentées : politique zéro tolérance, conventions pour les `any` résiduels, règles React hooks et Next.js.

---

## [1.14.0] — 12 mars 2026

### Ajouté
- **Signalement de bug** — Bouton flottant accessible sur toutes les pages authentifiées (rôle CHVL et supérieur). Ouvre une modale permettant de saisir un titre et une description, avec affichage optionnel des logs techniques (console + réseau). Crée automatiquement un ticket GitHub avec le rapport complet.
- **Tests automatisés** — Tests unitaires, d'intégration et de composants pour le module de signalement de bug (16 + 11 + 15 cas couverts). Règle : toute nouvelle fonctionnalité doit désormais embarquer ses tests.

---

## [1.13.0] — 12 mars 2026

### Modifié
- **Sécurité des routes checkin/second-driver** — Les vérifications d'autorisation utilisent maintenant `session.user.id` (FK stable) au lieu de `session.user.email` (donnée mutable), ce qui empêche les usurpations d'identité en cas de changement d'email.
- **JWT** — L'identifiant `User.id` est désormais exposé dans le token JWT et disponible via `session.user.id` dans toutes les routes API.
- **Formulaire de prise de véhicule** — `driverName` et `driverEmail` ne sont plus envoyés dans le corps de la requête POST ; le serveur résout automatiquement le chauffeur depuis la session.
- **Stats** — Les requêtes groupées par chauffeur utilisent `GROUP BY driverId` au lieu de `GROUP BY driverEmail`, ce qui garantit la cohérence même si l'email change.

---

## [1.12.0] — 9 mars 2026

### ✨ Nouveau
- **Pré-remplissage du nom de mission** — À l'ouverture du formulaire de prise de véhicule, le champ "Nom de mission" se remplit automatiquement avec le motif de la réservation la plus proche dans le temps. Le champ reste modifiable.
- **Export PDF amélioré** — Le rapport PDF affiche désormais le logo CRF, les sauts de page sont automatiques et la numérotation des pages est correcte.

### 🐛 Corrigé
- **Stats — filtre de date de fin** — Les trajets du jour sélectionné comme date de fin étaient exclus des résultats. C'est corrigé.
- **Fun Fact** — La section n'apparaît plus avec seulement 1 ou 2 trajets. Elle requiert désormais au moins 3 trajets sur le même véhicule avec ≥ 65% de domination.

---

## [1.11.0] — 9 mars 2026

### ✨ Nouveau
- **Page Statistiques** — Nouveau module accessible depuis la barre de navigation (tous les rôles sauf Invité). Affiche sur les 60 derniers jours : indicateurs globaux (emprunts, km, incidents, consommation), graphiques par chauffeur et par semaine, répartition des types de missions, et un classement des véhicules. Inclut un export CSV (données brutes) et un export PDF (rapport complet).
- **Fun Fact** — Section humoristique sur la page Statistiques, affichée quand un chauffeur se démarque nettement sur un véhicule.

---

## [1.10.0] — 9 mars 2026

### ✨ Nouveau
- **Données véhicule en temps réel** — Le kilométrage et le niveau de carburant/batterie sur la fiche véhicule sont désormais issus directement de Renault Connect pour les véhicules connectés.
- **Indicateur de vérification** — Un badge "⏳ Vérification..." s'affiche sur les données de retour en attente de confirmation Renault, avec mise à jour automatique.

---

## [1.9.2] — 8 mars 2026

### ✨ Nouveau
- **Propreté du véhicule** — Nouveau champ au départ et au retour (Propre / Correct / Sale / Très sale). La valeur est affichée dans l'historique des sorties.

---

## [1.9.1] — 8 mars 2026

### 🔧 Amélioré
- **Accessibilité** — Les modales de prise/retour de véhicule et la pagination de l'historique sont conformes WCAG 2.1 AA (lecteurs d'écran, navigation clavier).

---

## [1.9.0] — 7 mars 2026

### ✨ Nouveau
- **Jauge de carburant visuelle** — La jauge affiche des jalons (E / ¼ / ½ / ¾ / F) et change de couleur selon le niveau : rouge en dessous de 25%, orange jusqu'à 50%, vert au-delà. La jauge est interactive dans tous les formulaires de saisie.

---

## [1.8.0] — 6 mars 2026

### ✨ Nouveau
- **Contrôle des notifications push** — Un bouton dans la cloche permet d'activer ou désactiver les notifications push sans passer par les paramètres du navigateur.

### 🔧 Amélioré
- **Cloche de notifications** — Réservée aux rôles Responsable et Administrateur uniquement.

### 🐛 Corrigé
- **Page d'aide** — Redirige vers la page de connexion si l'utilisateur n'est pas authentifié.
- **Menu de navigation** — Masqué sur la page de connexion.
- **Tour guidé** — Ne crashait plus à la fin pour les utilisateurs sans rôle Responsable ou Admin.

---

## [1.7.0] — 6 mars 2026

### ✨ Nouveau
- **Signalement de données incorrectes** — Lors de la prise d'un véhicule non connecté, il est possible de signaler et corriger un kilométrage ou un niveau d'essence erroné. Les responsables et admins reçoivent une notification.
- **Pagination de l'historique** — Les sorties sur la fiche véhicule sont paginées (3 par page).

### 🐛 Corrigé
- **Heure d'affichage** — Toutes les dates sont désormais affichées en heure de Paris (UTC+1).

---

## [1.6.0] — 6 mars 2026

### 🔒 Sécurité
- Renforcement de l'authentification sur l'ensemble des endpoints (véhicules, Renault, emprunts).
- Ajout d'en-têtes de sécurité HTTP (anti-clickjacking, anti-sniffing, HSTS).
- Validation stricte des fichiers uploadés (taille, type, nombre).

### 🐛 Corrigé
- **Modales** — La fermeture ne se déclenche plus avant confirmation du succès côté serveur.
- **Déconnexion** — La déconnexion redirige correctement vers la page de connexion.

---

## [1.5.0] — 6 mars 2026

### ✨ Nouveau
- **Validation des réservations** — Les chauffeurs soumettent une demande, les Responsables et Admins reçoivent une notification et peuvent valider. Un badge "En attente" / "Validée" s'affiche sur chaque réservation. Les réservations Admin/Respo sont auto-validées.

### 🔧 Amélioré
- **Responsivité mobile** — Les boutons d'action de la fiche véhicule s'affichent correctement sur petits écrans.

---

## [1.4.0] — 5 mars 2026

### ✨ Nouveau
- **Checklists personnalisées** — Les administrateurs peuvent configurer des checklists sur-mesure par véhicule (départ et retour), avec items obligatoires bloquant la soumission si non cochés.
- **Création d'utilisateurs** — Les administrateurs peuvent créer des comptes utilisateurs directement depuis le panel d'administration.

### 🐛 Corrigé
- **Installation PWA** — Le bouton "Ajouter à l'écran d'accueil" réapparaît correctement sur mobile.

---

## [1.3.0] — 5 mars 2026

### ✨ Nouveau
- **Réservations** — Nouveau système de réservation de véhicule avec calendrier des créneaux à venir sur la fiche véhicule.
- **Squelettes de chargement** — Les pages affichent une structure animée pendant le chargement, sans sauts de mise en page.
- **Application installable (PWA)** — L'application peut être installée sur mobile comme une application native (Android et iOS).

---

## [1.2.3] — 5 mars 2026

### ✨ Nouveau
- **Export QR Code** — Chaque fiche véhicule dispose d'un bouton pour générer et télécharger un QR Code pointant directement vers son URL (pratique pour l'impression d'étiquettes).

---

## [1.2.2] — 4 mars 2026

### ✨ Nouveau
- **Easter egg Konami** — ↑ ↑ ↓ ↓ ← → ← → B A

### 🐛 Corrigé
- **Redirection après connexion** — L'utilisateur est redirigé vers la page qu'il tentait d'atteindre, et non vers l'accueil.

---

## [1.2.1] — 4 mars 2026

### 🔧 Amélioré
- **Gestion des utilisateurs** — Ajout d'une barre de recherche (nom ou e-mail) et d'une pagination dans la vue administrateur.

---

## [1.2.0] — 4 mars 2026

### ✨ Nouveau
- **Tutoriel interactif** — Un guide étape par étape accompagne les nouveaux utilisateurs à la prise en main. Relançable depuis la page Aide.

---

## [1.1.0] — 2 mars 2026

### ✨ Nouveau
- **Alerte mouvement suspect** — Notification push envoyée aux administrateurs si un véhicule est utilisé de manière inhabituelle.

### 🔧 Amélioré
- **Notifications** — Passage aux notifications push (mobile et web) en remplacement des e-mails pour les alertes incidents.
- **URLs des véhicules** — Les adresses utilisent désormais la nomenclature opérationnelle (ex. `/vehicles/VL186`).

---

## [1.0.0] — 2 mars 2026

### 🚀 Lancement
- Authentification Google sécurisée, restreinte aux adresses `@croix-rouge.fr`.
- Gestion du parc automobile avec tableau de bord, fiches véhicules et statuts de maintenance.
- Cycle complet d'emprunt et de retour : état du véhicule, niveau d'énergie, DSA, type de mission, commentaires, photos.
- Gestion des conducteurs secondaires.
- Galerie photos connectée à Google Drive.
- Intégration Renault Connect (kilométrage et batterie en direct).
- Panel administrateur : gestion des rôles, historiques, notes.
- Mode sombre natif, design responsive.
