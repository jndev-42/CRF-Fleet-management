# Changelog

Tous les changements notables apportés à ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-03-02

### Added
- **Alertes Incidents :** Notification automatique envoyée aux rôles `RESPO` lors du signalement d'un incident (matériel ou autre) au Check-Out et Check-In.
- **Vérifications Kilométriques (Cron) :** Mise en place d'une tâche planifiée (23h59) de détection des anomalies kilométriques journalières (API Renault) avec signalement aux `ADMIN`. Ignore automatiquement les véhicules en maintenance.
- **Branding Croix-Rouge :** Mise à jour visuelle intégrant le logo officiel de la Croix-Rouge Française et la dénomination "Gestion de flotte" (Favicon et en-tête).

### Changed
- **Notifications par email :** Passage à `Nodemailer` avec configuration SMTP générique (via `SMTP_USER` et `SMTP_PASS`) pour des envois fiables et gratuits depuis le serveur Vercel, sans dépendance à Resend.
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
