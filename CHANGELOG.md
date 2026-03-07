# Changelog

Tous les changements notables apportés à ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.0] - 2026-03-07

### Ajouté
- **Jauge de carburant améliorée** : Pour les véhicules non électriques, la jauge affiche désormais des jalons visuels (E / 1/4 / 1/2 / 3/4 / F). Tous types confondus, la couleur de la jauge est dynamique selon le niveau : rouge (< 25%), orange (25–49%), vert (≥ 50%).
- **Jauge interactive dans les modales** : Les modales de check-in, check-out (correction de données) et d'édition des métriques affichent maintenant la jauge en temps réel lors de la saisie du niveau de carburant, remplaçant les anciens champs numériques.

### Documentation
- **README.md** restructuré : présentation du projet, liste des fonctionnalités, stack technique, architecture, variables d'environnement.
- **CONTRIBUTING.md** créé : instructions de lancement local, initialisation de la base de données, tests et déploiement (Turso + Vercel).

## [1.8.0] - 2026-03-06

### Ajouté
- **Toggle notifications push** : Dans le dropdown de la cloche, un bouton permet d'activer ou désactiver les notifications push OneSignal sans passer par les paramètres du navigateur. N'affecte pas les notifications in-app (cloche). Si le navigateur a bloqué les notifications, un message d'aide s'affiche à la place.

### Modifié
- **Cloche de notifications réservée aux RESPO/ADMIN** : L'icône de cloche n'est plus affichée pour les rôles CHVL, CHVPSP et GUEST.
- **Tour de première utilisation** : L'étape de présentation de la cloche de notifications est désormais masquée pour les utilisateurs sans rôle RESPO ou ADMIN.

### Corrigé
- **Page d'aide accessible sans authentification** : La page `/aide` redirige désormais vers `/login` si l'utilisateur n'est pas connecté.
- **Navigation visible sans authentification** : Le menu de navigation (burger + liens) est désormais masqué lorsque l'utilisateur n'est pas connecté.
- **Page blanche en fin de tour (non-ADMIN/RESPO)** : La fonction `next()` du tour guidé utilisait `TOUR_STEPS.length` au lieu de `activeSteps.length`, ce qui faisait dépasser les bornes du tableau filtré et provoquait un crash client pour les utilisateurs sans rôle RESPO ou ADMIN.

## [1.7.0] - 2026-03-06

### Ajouté
- **Signalement données incorrectes** : Sur la modale de prise de véhicule (véhicules non connectés uniquement), nouvelle case à cocher "Le kilométrage et/ou le niveau d'essence est erroné". Lorsqu'elle est cochée, des champs éditables permettent de saisir les valeurs réelles. À la validation, les données corrigées sont enregistrées en base et une notification push + cloche est envoyée aux rôles RESPO et ADMIN avec les anciennes et nouvelles valeurs.
- **Pagination de l'historique des sorties** : Les sorties (trips) sur la fiche véhicule sont désormais paginées (3 par page). Des boutons Précédent / Suivant avec indicateur de page s'affichent uniquement s'il y a plus de 3 sorties. En cas de suppression d'un trip, la pagination se recale automatiquement.

### Corrigé
- **Fuseau horaire UTC+1** : Toutes les dates de l'application (`formatDate`, `ReservationBlock`, `NotificationBell`) affichent désormais l'heure en heure de Paris (Europe/Paris) au lieu de l'UTC. Les timestamps SQLite (format `YYYY-MM-DD HH:MM:SS` sans `Z`) sont normalisés à la source dans l'API notifications avant d'être envoyés au client.
- **Notifications push bloquées** : Les en-têtes de sécurité (`Permissions-Policy`) n'étaient pas appliqués aux scripts de service worker OneSignal, empêchant la réception des notifications sur mobile et desktop. Le filtre `source` dans `next.config.ts` exclut désormais les fichiers `.js`, `.json`, les assets statiques et les routes API.
- **Items de checklist hardcodés supprimés** : Les lignes "DSA vérifié", "DSA utilisé", "Vitres/Radios", "Tour véhicule" codées en dur dans `TripItem` ont été retirées.

## [1.6.1] - 2026-03-06

### Modifié
- **Cache session Renault** : Remplacement du cache en mémoire (`cachedSession`) dans `src/lib/renault.ts` par un cache persistant en base de données (table `RenaultSession`). La session Gigya/Renault survit désormais aux cold-starts Vercel et est partagée entre toutes les instances serverless.
- **Migration DB** : Ajout du script `scripts/add-renault-session-table.ts` pour créer la table `RenaultSession` (singleton, ligne `id=1`).

## [1.6.0] - 2026-03-06

### Sécurité
- **Auth API véhicules** : Les routes `GET /api/vehicles` et `GET /api/vehicles/[id]` exigent désormais une session authentifiée (401 si absent). `POST /api/vehicles` est restreint aux ADMIN (403 sinon).
- **Auth API Renault** : `GET /api/renault/[vin]` exige une session authentifiée (401).
- **Auth API trips** : L'appel `auth()` est déplacé en tout premier dans `POST /api/trips`, avant tout parsing du corps ou requête DB.
- **VINs codés en dur supprimés** : `src/lib/renault.ts` ne contient plus de VINs en fallback. `getVehicleVin()` est désormais async et interroge d'abord la colonne `vin` de la table `Vehicle`, puis se rabat sur les variables d'environnement.
- **En-têtes de sécurité HTTP** : Ajout de `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` et `Strict-Transport-Security` via `next.config.ts`.
- **Validation `callbackUrl`** : La page de connexion valide que le `callbackUrl` est un chemin relatif avant de l'utiliser dans `signIn`, prévenant les redirections ouvertes.
- **Validation fichiers upload** : `POST /api/drive/upload` valide côté serveur le nombre de fichiers (≤ 10), la taille (≤ 10 Mo) et le type MIME (images uniquement) avant tout envoi vers Google Drive.
- **URLs de notifications encodées** : Tous les noms de véhicules insérés dans des URLs de notifications push utilisent désormais `encodeURIComponent` (`trips`, `reservations/[id]`).

### Corrigé
- **CheckOutModal / CheckInModal** : `onSuccess()` est désormais appelé uniquement après confirmation du succès de la requête API (`res.ok`), éliminant la perte silencieuse de données due à l'ancienne fermeture optimiste.
- **Navbar — déconnexion** : Remplacement de `window.location.href = '/api/auth/signout'` par `signOut({ callbackUrl: '/login' })` de `next-auth/react`.
- **GuidedTour — XSS** : Suppression de `dangerouslySetInnerHTML`. Le type `body` des étapes du tour passe de `string` à `React.ReactNode` ; les contenus HTML sont convertis en JSX.
- **DSA checklist — effet de bord GET** : La logique d'upsert DSA est retirée du handler GET de `/api/vehicles/[id]/checklist`. Elle est déplacée dans le PATCH de `/api/vehicles/[id]` : insertion lors du passage `hasDSA` false→true, suppression lors du passage true→false.
- **`next.config.ts`** : Suppression du bloc `outputFileTracingIncludes` référençant des fichiers Prisma inexistants (le projet utilise libSQL).

### Ajouté
- **Composant `AddVehicleModal`** : Extraction de la modale d'ajout de véhicule en composant réutilisable (`src/components/vehicle/modals/AddVehicleModal.tsx`), partagé entre `app/page.tsx` et `app/vehicles/page.tsx`. La version extraite est la plus complète (avec VIN, type de carburant, DSA, sélecteur de parking).

## [1.5.0] - 2026-03-06

### Added
- **Workflow de Validation des Réservations :** Les utilisateurs CHVL/CHVPSP soumettent désormais une demande de réservation (statut `PENDING`). Les ADMIN et RESPO reçoivent une notification Push et peuvent valider depuis la fiche véhicule (bouton "✓ Valider"). À la validation, une notification in-app est envoyée au demandeur. Les réservations ADMIN/RESPO sont auto-validées à la création.
- **Badges de statut sur les réservations :** Indicateur visuel "En attente" (orange) / "Validée" (vert) sur chaque réservation dans le bloc `ReservationBlock`.

### Changed
- **Conflit de réservation :** La détection de chevauchement ne porte plus que sur les réservations `VALIDATED`. Une demande en attente ne bloque plus la création d'une autre réservation ni l'emprunt du véhicule.
- **Cron de surveillance kilométrique :** Fréquence passée de `23:59 chaque soir` à `toutes les 30 minutes` pour une détection plus réactive des mouvements suspects.
- **Responsivité mobile :** Les boutons d'action de la fiche véhicule (Prendre, Rendre, Maintenance, Gérer la checklist) s'affichent désormais en colonne pleine largeur sur mobile au lieu de déborder hors écran.

## [1.4.0] - 2026-03-05

### Added
- **Checklists Personnalisées par Véhicule :** Possibilité pour les administrateurs de configurer des listes de vérifications (checklists) entièrement sur-mesure pour chaque véhicule (prises et rendus). Les items peuvent être marqués comme obligatoires (bloquant ainsi la soumission côté chauffeur si non cochés).
- **Gestion des Utilisateurs :** Ajout de la création d'utilisateurs directement depuis le panel Admin avec vérification d'unicité de l'email et assignation immédiate des rôles.

### Fixed
- **Installation PWA (Progressive Web App) :** Résolution d'un bug où le middleware bloquait le `manifest.json` et empêchait l'apparition du bouton "Ajouter à l'écran d'accueil" sur mobiles. 
- **Conflits de Service Worker :** Suppression d'un double enregistrement du Service Worker causant des interférences avec les notifications Push de OneSignal.
- **Sécurité :** Mise à jour et retrait de dépendances vulnérables (`npm audit`).

## [1.3.0] - 2026-03-05

### Added
- **Système de Réservation :** Nouvelle table `Reservation` en base de données et endpoints API (`GET`, `POST`, `DELETE /api/vehicles/[id]/reservations` et `/api/reservations/[id]`). Un composant `ReservationBlock` affiche les réservations à venir sur la page de détail d'un véhicule avec une modale de création.
- **Interface Squelettons (Skeletons) :** Nouveau composant générique `Skeleton` + `VehicleCardSkeleton` et `VehicleDetailSkeleton`. Les spinners de chargement sont remplacés par des blocs grisés animés qui reproduisent la structure de chaque page pour éviter les sauts de layout (CLS).
- **PWA (Progressive Web App) :** Ajout de `manifest.json`, des meta-tags iOS (`apple-mobile-web-app-capable`) et Android (`theme-color`), et d'un Service Worker manuel (`sw.js`) avec stratégie cache-first pour les assets statiques et network-first pour les pages. L'application peut désormais être installée sur mobile comme une application native.
- **Validation Zod Stricte :** Les endpoints `POST /api/vehicles/[id]/reservations`, `POST /api/trips` et `PATCH /api/trips/[id]/checkin` utilisent maintenant des schémas Zod formels avec des messages d'erreur explicites, rejetant toute donnée invalide avec un code HTTP 400 et le détail des erreurs.

### Changed
- **Optimistic UI :** Les actions "Prendre le véhicule" (Check-Out), "Rendre le véhicule" (Check-In) et "Activer/Désactiver la Maintenance" ferment maintenant instantanément leur modale/interface pendant que la requête réseau se complète en arrière-plan. En cas d'erreur serveur, l'état est automatiquement rétabli.
- **QR Code :** Le bouton d'accès au QR Code est maintenant une petite icône `<QrCode>` positionnée directement à côté du nom du véhicule pour un accès discrèt et intuitif.
- **Pluie Konami :** Les images de l'easter egg tombent maintenant progressivement avec des délais aléatoires (style pluie naturelle) au lieu de toutes apparaître simultanément.

## [1.2.3] - 2026-03-05


### Added
- **Export QR Code :** Ajout d'un bouton sur les pages des véhicules permettant de générer et de télécharger un QR Code menant directement à l'URL du véhicule (pratique pour un usage mobile ou l'impression d'étiquettes à mettre dans les véhicules).

## [1.2.2] - 2026-03-04

### Added
- **Konami code :** Ajout d'un easter egg qui permet de lancer une simulation de physique avec des images qui tombent.

### Fixed
- **Sécurité et Redirection :** Ajout d'un Middleware global pour bloquer l'accès direct aux vues profondes de l'application sans être connecté. La redirection dynamique après la connexion via l'authentification Google reconduit désormais fidèlement l'utilisateur à sa requête initiale plutôt qu'à la page d'accueil par défaut.

## [1.2.1] - 2026-03-04

### Added
- **Gestion des Utilisateurs :** Ajout d'une barre de recherche dynamique (par nom ou e-mail) et d'une pagination (6 utilisateurs par page) dans la vue administrateur pour faciliter la gestion d'un grand nombre de volontaires existants.

## [1.2.0] - 2026-03-04

### Added
- **Tutoriel Interactif :** Nouveau guide étape par étape (Guided Tour) avec mise en évidence (spotlight) des éléments clés de l'interface pour accompagner les nouveaux utilisateurs dans la prise en main (Dashboard et processus d'Emprunt/Retour). Relançable depuis la page Aide.

## [1.1.0] - 2026-03-02

### Added
- **Alerte Mouvement Suspect (Cron) :** Notification Push (`OneSignal`) envoyée aux `ADMIN` lors d'une utilisation suspecte d'un véhicule la journée.

### Changed
- **Notifications d'incidents :** Passage aux Notifications Push Serverless (`OneSignal`) en lieu et place des emails pour alerter en temps réel les rôles `RESPO` et `ADMIN` sur mobile/web lors d'un incident.
- **Envoi des alertes :** Substitution de `Nodemailer`/`Resend` par les notifications Push de OneSignal.
- **URLs lisibles :** Refonte des adresses web des véhicules pour utiliser leur nomenclature opérationnelle (ex. `/vehicles/VL186`) plutôt que leur ID de base de données.
- **Sécurisation des Emprunts :** Auto-complétion et verrouillage en lecture seule de l'identité du conducteur principal sur le formulaire de Check-Out.
- **Permissions de Maintenance :** Les accès pour basculer le statut du véhicule en maintenance sont désormais adossés au système de rôles dynamique en base de données.

## [1.0.0] - 2026-03-02

### Added
- **Cœur de l'application :** Lancement initial de "Gestion de flotte" pour la Croix-Rouge Française (Unité Locale Paris 18).
- **Authentification :** Connexion sécurisée Google OAuth, automatiquement restreinte aux adresses `@croix-rouge.fr`.
- **Rôles structurés :** Gestion des permissions RBAC via base de données (ADMIN, RESPO, CHVL, CHVPSP, GUEST).
- **Interface Véhicules :** Tableau de bord dynamique, vue détaillée, formulaires d'édition, gestion du parc automobile et bascule de statut de maintenance.
- **Emprunts & Retours :** Cycle complet de Check-Out et Check-In. Formulaires incluant l'état du véhicule, l'énergie (diesel, essence, électrique), les commentaires, la vérification du DSA, les types de missions (DPS, PAPS, Réseaux, Urgence, Logistique, Maraude) et la gestion du stationnement.
- **Multiconducteur :** Prise en charge d'un conducteur secondaire, assignable au départ ou en cours de route par l'administrateur ou le conducteur principal via recherche textuelle intelligente (datalist).
- **Galerie Photos Sécurisée :** Connexion Backend serveur avec Google Drive (OAuth Refresh Token) contournant les restrictions des comptes Service Google. Upload transparent et proxy d'images hébergées sécurisées.
- **Visionneuse Plein Écran :** Module d'affichage (PhotoViewer) intégré pour visualiser ou observer au zoom l'état du véhicule.
- **Connectivité Renault :** Synchronisation automatique avec l'API Télématique de Renault Connect pour récupérer l'autonomie, l'état de branchement, l'état de la batterie (%) et le kilométrage réel directement depuis la voiture.
- **Espace Administrateur :** Modération des profils utilisateurs, purge sécurisée en cascade des historiques de véhicules, notes cachées.
- **UI/UX et Thème :** Application responsive avec mode sombre natif, navigation fluide et intégration des marqueurs de marque (Croix-Rouge SVG).
- **Informations Légales:** Nouveau pied de page (Footer) de copyright global et page d'Aide recensant les numéros d'urgence et d'assurance.
