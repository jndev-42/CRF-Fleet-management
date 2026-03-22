# Changelog

## [2.3.0] — 22 mars 2026

### ✨ Nouvelles fonctionnalités

- **Compte inactif** — Les utilisateurs dont le compte est désactivé (rôle INACTIF) sont automatiquement redirigés vers une page dédiée leur indiquant de contacter un administrateur. Un bouton de déconnexion est disponible.
- **Statistiques accessibles à tous** — La section Statistiques & exports est désormais accessible à tous les rôles actifs (CHVL, CHVPSP, SECOURISTE, CI/RPAPS, RESPO, ADMIN). Seuls les comptes INACTIF en sont exclus.

### 🔧 Changements

- **Renommage GUEST → INACTIF** — Le rôle "Invité" est renommé "Inactif" dans toute l'interface et les API. La migration de base de données est réalisée via le script `scripts/rename-guest-to-inactif.ts`.
- **Permissions CHVPSP** — Un chauffeur CHVPSP ne peut désormais emprunter que des véhicules VPSP. Pour emprunter les deux types, les rôles CHVL et CHVPSP sont requis simultanément.
- **Permissions CHVL** — Un chauffeur CHVL ne peut emprunter que des véhicules VL. La liste des chauffeurs filtrée par type de véhicule VL ne renvoie plus les CHVPSP.
- **Légende des rôles mise à jour** — Les descriptions de CHVL, CHVPSP, SECOURISTE, CI/RPAPS et RESPO reflètent désormais les permissions réelles (statistiques, type de véhicule, niveau d'accès inventaire).
- **Administration des menus** — L'accès à la liste des paramètres de menu (GET) est désormais réservé aux administrateurs.

### 🐛 Corrections

_Aucune correction._

---

## [2.2.0] — 22 mars 2026

### ✨ Nouvelles fonctionnalités

- **Nouveau rôle CI/RPAPS** — Un rôle dédié aux responsables CI et RPAPS donne accès à la section Missions (création, consultation et gestion des comptes rendus). Les rôles RESPO, CHVL et CHVPSP n'ont plus accès à cette section.
- **Paramétrage des menus** — Les administrateurs peuvent désormais contrôler la visibilité de chaque menu de la navbar (Statistiques, Inventaire, Missions) depuis un nouvel onglet "Menus" dans la page Administration. Trois niveaux disponibles : Activé, Admin uniquement, Désactivé.
- **Page Administration** — La page "Utilisateurs" est renommée "Administration" et inclut deux onglets : "Utilisateurs" (gestion des rôles et des papiers) et "Menus" (paramétrage de la navigation, visible ADMIN uniquement).

### 🔧 Changements

- **Rôle SECOURISTE auto-assigné** — Lors de l'attribution de tout rôle non-GUEST à un utilisateur, le rôle SECOURISTE lui est automatiquement accordé s'il ne l'a pas déjà.
- **Inventaire réservé aux SECOURISTE** — L'accès à la page Inventaire et à l'onglet Inventaire sur la fiche véhicule nécessite désormais explicitement le rôle SECOURISTE (plutôt qu'une liste de rôles compatibles).
- La navbar affiche désormais "Administration" à la place de "Utilisateurs" pour le lien de gestion des utilisateurs.

### 🐛 Corrections

_Aucune correction._

---

## [2.1.0] — 20 mars 2026

### ✨ Nouvelles fonctionnalités

- **Photos de communication dans le CR Mission** — Étape 7 (optionnelle) ajoutée au wizard de compte rendu de mission. Les bénévoles peuvent uploader jusqu'à 10 photos du poste, de l'équipe ou du terrain directement vers un dossier Google Drive dédié à la communication.
- **Galerie de photos sur le détail d'un CR Mission** — La page de détail d'un compte rendu affiche désormais les photos de communication uploadées lors de la saisie, si elles existent.

### 🔧 Changements

- Le wizard CR Mission passe de 6 à 7 étapes. L'étape "Photos" est entièrement optionnelle : les deux boutons "Passer" et "Soumettre" permettent de terminer avec ou sans photos.

### 🐛 Corrections

_Aucune correction._

---

## [2.0.2] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Qui a validé les papiers ?** — Lors de la validation des papiers d'un chauffeur, le nom du validateur (ou son email en l'absence de nom) est désormais enregistré et affiché sous la date de validation dans la colonne "Papiers" de la page utilisateurs.

### 🔧 Changements

_Aucun changement._

### 🐛 Corrections

_Aucune correction._

---

## [2.0.1] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Rôle Secouriste** — Nouveau rôle `SECOURISTE` pour les bénévoles secouristes non chauffeurs. Ils peuvent soumettre et consulter leurs propres comptes rendus de mission, sans accès aux véhicules, aux statistiques ni à la gestion des utilisateurs.

### 🔧 Changements

- La légende des rôles (page utilisateurs) affiche désormais le rôle Secouriste avec sa couleur verte distinctive et la liste de ses permissions.

### 🐛 Corrections

_Aucune correction._

---

## [2.0.0] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Compte Rendu de Mission (CRM)** — Les CI/Chefs de PAPS peuvent désormais soumettre un compte rendu directement dans cr-chauffeur via un formulaire wizard en 6 étapes, sans passer par Google Forms.
- **Formulaire en 6 étapes** — Informations générales (type, nom, date, lieu, victimes), équipage (véhicule, chauffeur, bénévoles, PEGASS), matériel consommé par catégorie (sac primaire, brûlures, hémorragies, kit DSA, hygiène), oxygène (section VPSP conditionnelle selon le véhicule), dynamique d'équipe (conditionnelle si UL<18 présents), et incidents critiques (ACR, hémorragie grave, prise en charge complexe).
- **Liste des comptes rendus** — Tableau filtrable par type de mission ; les RESPO et ADMIN voient tous les comptes rendus, les chauffeurs voient uniquement les leurs.
- **Détail d'un compte rendu** — Affichage complet par sections avec tableau du matériel consommé (quantités > 0 uniquement) et badges incidents.
- **Suppression** — Les administrateurs peuvent supprimer un compte rendu (avec suppression en cascade des lignes matériel).

### 🔧 Changements

- Nouveau lien « Missions » dans la barre de navigation (visible pour tous sauf GUEST).

### 🐛 Corrections

_Aucune correction._

---

## [1.21.1] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Modification des intervalles de révision** — Les administrateurs peuvent modifier la date de première immatriculation, l'intervalle de révision en km et en années directement depuis la fiche véhicule, sans avoir à recréer le véhicule.

### 🔧 Changements

_Aucun changement._

### 🐛 Corrections

_Aucune correction._

---

## [1.21.0] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Validation des papiers** — Les chauffeurs (CHVL et CHVPSP) doivent faire valider leur permis de conduire (et attestation préfectorale pour les CHVPSP) une fois par an auprès de leur DLUS/DLAS.
- **Bannière d'alerte** — Lorsque les papiers ne sont pas validés, une bannière rouge apparaît en haut de l'écran avec le nombre de jours restants avant blocage.
- **Blocage automatique** — Si les papiers n'ont pas été validés dans les 14 jours suivant l'échéance, l'emprunt de véhicules et les réservations sont désactivés.
- **Validation depuis la gestion des utilisateurs** — Les administrateurs et responsables peuvent marquer les papiers d'un chauffeur comme validés depuis la page Utilisateurs.
- **Accès RESPO à la gestion des utilisateurs** — Les responsables (RESPO) peuvent désormais accéder à la page Utilisateurs pour valider les papiers des chauffeurs.

### 🔧 Changements

- La colonne "Papiers" est affichée sur la fiche utilisateur avec la date de dernière validation et le statut courant.

### 🐛 Corrections

_Aucune correction._

---

## [1.20.0] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Suivi de l'entretien des véhicules** — Une nouvelle carte sur la fiche véhicule affiche le délai avant le prochain contrôle technique et la prochaine révision, avec code couleur (🟢 OK · 🟠 Bientôt · 🔴 Dépassé).
- **Historique CT & révisions** — Un clic sur la carte ouvre l'historique complet. Les administrateurs peuvent ajouter une entrée (date, type, kilométrage) ou en supprimer.
- **Nouveaux champs à l'ajout de véhicule** — Date de première immatriculation, intervalle de révision en km et en années.

### 🔧 Changements

_Aucun changement notable._

### 🐛 Corrections

_Aucune correction._

---

## [1.19.0] — 18 mars 2026

### ✨ Nouvelles fonctionnalités

- **Mission Désinfection (VPSP)** — Nouveau type de mission disponible sur les véhicules VPSP. Les dates de désinfection sont automatiquement enregistrées à chaque sortie.
- **Suivi de la prochaine désinfection** — Une carte dédiée sur la fiche VPSP affiche le décompte en jours jusqu'à la prochaine désinfection obligatoire (42 jours), avec code couleur.
- **Formulaire de retour enrichi** — Pour une mission Désinfection, les champs "Responsable" et "Numéro de lot du produit" sont obligatoires au retour.
- **Historique des désinfections** — Un clic sur la carte ouvre la main courante complète : date, responsable, numéro de lot, conducteur.

### 🔧 Changements

_Aucun changement notable._

### 🐛 Corrections

_Aucune correction._

---

## [1.18.0] — 14 mars 2026

### ✨ Nouvelles fonctionnalités

- **Réservation pour un autre utilisateur (Admin)** — Les administrateurs peuvent créer une réservation au nom d'un autre chauffeur directement depuis la fiche véhicule. La réservation est automatiquement validée et l'utilisateur concerné reçoit une notification.

### 🔧 Changements

_Aucun changement notable._

### 🐛 Corrections

_Aucune correction._

---

## [1.17.1] — 13 mars 2026

### ✨ Nouvelles fonctionnalités

- **Légende des rôles** — Une légende expliquant chaque niveau d'accès est maintenant affichée dans le panel de gestion des utilisateurs.

### 🔧 Changements

_Aucun changement notable._

### 🔒 Sécurité

- **Accès sur invitation uniquement** — La création automatique de compte à la première connexion Google est supprimée. Seuls les utilisateurs pré-enregistrés peuvent se connecter.
- **Rôle Invité exclusif** — Un utilisateur Invité ne peut pas cumuler d'autres rôles, et vice-versa.

### 🐛 Corrections

_Aucune correction._

---

## [1.17.0] — 13 mars 2026

### ✨ Nouvelles fonctionnalités

- **Capacité batterie (véhicules électriques)** — Configurable sur la fiche véhicule pour des statistiques de consommation plus précises.
- **Statistiques véhicules électriques** — Deux nouveaux indicateurs : consommation moyenne en kWh/100km et total kWh consommés sur la période.
- **Tableau chauffeurs enrichi** — Nouvelle colonne kWh/100km pour les trajets en véhicule électrique.

### 🔧 Changements

- **Colonne "Conso/100km"** — Affiche désormais "L" pour les thermiques et "kWh" pour les électriques.

### 🐛 Corrections

_Aucune correction._

---

## [1.16.0] — 13 mars 2026

### ✨ Nouvelles fonctionnalités

- **Filtres sur la page Statistiques** — Trois nouveaux filtres : par véhicule, par chauffeur et par type de mission. Les résultats se mettent à jour en temps réel.
- **KPI "L/100km réel"** — Consommation calculée à partir de la capacité réelle du réservoir, bien plus précis qu'une valeur fixe.
- **KPI "Taux d'utilisation"** — Pourcentage de jours avec au moins une sortie sur la période sélectionnée.
- **KPI "Carburant moyen au retour"** — Niveau moyen de carburant à la restitution des véhicules.
- **Taux d'incidents en inc./100 km** — Indicateur plus précis et plus parlant qu'un simple pourcentage.
- **Tableau chauffeurs enrichi** — Nouvelles colonnes "% retour" et "L/100km".
- **PDF enrichi** — 8 indicateurs sur 2 lignes, tableau chauffeurs et véhicules mis à jour.

### 🔧 Changements

- **Tableau chauffeurs** — La colonne "vs. moy." km est retirée au profit de colonnes plus utiles.

### 🐛 Corrections

_Aucune correction._

---

## [1.15.3] — 13 mars 2026

### ✨ Nouvelles fonctionnalités

- **Capacité réservoir par véhicule** — Chaque véhicule peut désormais avoir sa capacité réelle de réservoir configurée (en litres), pour des calculs de consommation plus précis.

### 🔧 Changements

_Aucun changement notable._

### 🐛 Corrections

- **Calcul du niveau de carburant** — Le pourcentage affiché utilise maintenant la capacité réelle du réservoir au lieu d'une valeur fixe de 50 L.

---

## [1.15.2] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

_Aucune nouvelle fonctionnalité._

### 🔧 Changements

_Aucun changement notable._

### 🐛 Corrections

- **Consommation moyenne** — Les trajets avec recharge ou plein d'essence ne faussaient plus le calcul de consommation.

---

## [1.15.1] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

_Aucune nouvelle fonctionnalité._

### 🔧 Changements

- **Fun Fact** — Les messages humoristiques sont maintenant variés par paire chauffeur/véhicule. Chaque combinaison affiche un message différent, stable d'un affichage à l'autre.

### 🐛 Corrections

_Aucune correction._

---

## [1.15.0] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

_Aucune nouvelle fonctionnalité._

### 🔧 Changements

- **Amélioration de la stabilité** — Refonte de la qualité interne du code. L'application est plus robuste et mieux outillée pour la suite.

### 🐛 Corrections

_Aucune correction._

---

## [1.14.0] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

- **Signalement de bug** — Un bouton flottant accessible sur toutes les pages permet de signaler un problème directement depuis l'application, avec rapport technique automatique.

### 🔧 Changements

_Aucun changement notable._

### 🐛 Corrections

_Aucune correction._

---

## [1.13.0] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

_Aucune nouvelle fonctionnalité._

### 🔧 Changements

_Aucun changement notable._

### 🔒 Sécurité

- **Identification des chauffeurs** — L'identification est maintenant basée sur un identifiant interne stable, immunisé contre un changement d'adresse e-mail.

### 🐛 Corrections

_Aucune correction._

---

## [1.12.0] — 9 mars 2026

### ✨ Nouvelles fonctionnalités

- **Pré-remplissage du nom de mission** — À l'ouverture du formulaire de prise de véhicule, le champ "Nom de mission" se remplit automatiquement avec le motif de la réservation la plus proche. Le champ reste modifiable.
- **Export PDF amélioré** — Le rapport affiche le logo CRF, avec sauts de page automatiques et pagination correcte.

### 🔧 Changements

_Aucun changement notable._

### 🐛 Corrections

- **Statistiques — filtre de date de fin** — Les trajets du dernier jour sélectionné n'étaient pas inclus dans les résultats.
- **Fun Fact** — La section n'apparaît plus avec seulement 1 ou 2 trajets ; elle requiert au moins 3 sorties avec une domination nette.

---

## [1.11.0] — 9 mars 2026

### ✨ Nouvelles fonctionnalités

- **Page Statistiques** — Nouveau module accessible depuis la navigation (tous les rôles sauf Invité). Affiche sur les 60 derniers jours : indicateurs globaux (emprunts, km, incidents, consommation), graphiques par chauffeur et par semaine, répartition des types de missions, classement des véhicules. Inclut un export CSV et un export PDF.
- **Fun Fact** — Section humoristique affichée quand un chauffeur se démarque particulièrement sur un véhicule.

### 🔧 Changements

_Aucun changement notable._

### 🐛 Corrections

_Aucune correction._

---

## [1.10.0] — 9 mars 2026

### ✨ Nouvelles fonctionnalités

- **Données véhicule en temps réel** — Le kilométrage et le niveau de carburant/batterie sur la fiche véhicule sont désormais issus directement de Renault Connect pour les véhicules connectés.
- **Indicateur de vérification** — Un badge "⏳ Vérification..." s'affiche sur les données en attente de confirmation, avec mise à jour automatique.

### 🔧 Changements

_Aucun changement notable._

### 🐛 Corrections

_Aucune correction._

---

## [1.9.2] — 8 mars 2026

### ✨ Nouvelles fonctionnalités

- **Propreté du véhicule** — Nouveau champ au départ et au retour (Propre / Correct / Sale / Très sale), visible dans l'historique des sorties.

### 🔧 Changements

_Aucun changement notable._

### 🐛 Corrections

_Aucune correction._

---

## [1.9.1] — 8 mars 2026

### ✨ Nouvelles fonctionnalités

_Aucune nouvelle fonctionnalité._

### 🔧 Changements

- **Accessibilité** — Les modales de prise/retour de véhicule et la pagination de l'historique sont conformes WCAG 2.1 AA (lecteurs d'écran, navigation clavier).

### 🐛 Corrections

_Aucune correction._

---

## [1.9.0] — 7 mars 2026

### ✨ Nouvelles fonctionnalités

- **Jauge de carburant visuelle** — Affiche des jalons (E / ¼ / ½ / ¾ / F) et change de couleur selon le niveau : 🔴 < 25%, 🟠 jusqu'à 50%, 🟢 au-delà. Interactive dans tous les formulaires de saisie.

### 🔧 Changements

_Aucun changement notable._

### 🐛 Corrections

_Aucune correction._

---

## [1.8.0] — 6 mars 2026

### ✨ Nouvelles fonctionnalités

- **Contrôle des notifications push** — Un bouton dans la cloche permet d'activer ou désactiver les notifications push sans passer par les paramètres du navigateur.

### 🔧 Changements

- **Cloche de notifications** — Réservée aux rôles Responsable et Administrateur uniquement.

### 🐛 Corrections

- **Page d'aide** — Redirige maintenant vers la connexion si l'utilisateur n'est pas authentifié.
- **Menu de navigation** — Masqué sur la page de connexion.
- **Tour guidé** — Ne plantait plus à la fin pour les utilisateurs sans rôle Responsable ou Admin.

---

## [1.7.0] — 6 mars 2026

### ✨ Nouvelles fonctionnalités

- **Signalement de données incorrectes** — Lors de la prise d'un véhicule non connecté, il est possible de signaler et corriger un kilométrage ou un niveau d'essence erroné. Les responsables et admins reçoivent une notification.
- **Pagination de l'historique** — Les sorties sur la fiche véhicule sont paginées (3 par page).

### 🔧 Changements

_Aucun changement notable._

### 🐛 Corrections

- **Heure d'affichage** — Toutes les dates sont désormais affichées en heure de Paris (UTC+1).

---

## [1.6.0] — 6 mars 2026

### ✨ Nouvelles fonctionnalités

_Aucune nouvelle fonctionnalité._

### 🔧 Changements

_Aucun changement notable._

### 🔒 Sécurité

- **Renforcement de l'authentification** sur l'ensemble des accès de l'application.
- **Protection HTTP** renforcée (anti-clickjacking, anti-sniffing, HSTS).
- **Validation stricte des fichiers** uploadés (taille, type, nombre).

### 🐛 Corrections

- **Modales** — La fermeture ne se déclenche plus avant confirmation du succès.
- **Déconnexion** — Redirige correctement vers la page de connexion.

---

## [1.5.0] — 6 mars 2026

### ✨ Nouvelles fonctionnalités

- **Validation des réservations** — Les chauffeurs soumettent une demande. Les Responsables et Admins reçoivent une notification et peuvent la valider. Un badge "En attente" / "Validée" s'affiche sur chaque réservation. Les réservations Admin/Respo sont auto-validées.

### 🔧 Changements

- **Responsivité mobile** — Les boutons d'action de la fiche véhicule s'affichent correctement sur petits écrans.

### 🐛 Corrections

_Aucune correction._

---

## [1.4.0] — 5 mars 2026

### ✨ Nouvelles fonctionnalités

- **Checklists personnalisées** — Les administrateurs peuvent configurer des checklists sur-mesure par véhicule (départ et retour), avec items obligatoires bloquant la soumission si non cochés.
- **Création d'utilisateurs** — Les administrateurs peuvent créer des comptes directement depuis le panel d'administration.

### 🔧 Changements

_Aucun changement notable._

### 🐛 Corrections

- **Installation PWA** — Le bouton "Ajouter à l'écran d'accueil" réapparaît correctement sur mobile.

---

## [1.3.0] — 5 mars 2026

### ✨ Nouvelles fonctionnalités

- **Réservations** — Nouveau système de réservation avec calendrier des créneaux à venir sur la fiche véhicule.
- **Squelettes de chargement** — Les pages affichent une structure animée pendant le chargement, sans sauts de mise en page.
- **Application installable (PWA)** — L'application peut être installée sur mobile comme une app native (Android et iOS).

### 🔧 Changements

_Aucun changement notable._

### 🐛 Corrections

_Aucune correction._

---

## [1.2.3] — 5 mars 2026

### ✨ Nouvelles fonctionnalités

- **Export QR Code** — Chaque fiche véhicule propose un bouton pour générer et télécharger un QR Code pointant vers la fiche (pratique pour les étiquettes physiques).

### 🔧 Changements

_Aucun changement notable._

### 🐛 Corrections

_Aucune correction._

---

## [1.2.2] — 4 mars 2026

### ✨ Nouvelles fonctionnalités

- **Easter egg Konami** — ↑ ↑ ↓ ↓ ← → ← → B A 🎮

### 🔧 Changements

_Aucun changement notable._

### 🐛 Corrections

- **Redirection après connexion** — L'utilisateur est redirigé vers la page qu'il tentait d'atteindre, et non vers l'accueil.

---

## [1.2.1] — 4 mars 2026

### ✨ Nouvelles fonctionnalités

_Aucune nouvelle fonctionnalité._

### 🔧 Changements

- **Gestion des utilisateurs** — Barre de recherche (nom ou e-mail) et pagination dans la vue administrateur.

### 🐛 Corrections

_Aucune correction._

---

## [1.2.0] — 4 mars 2026

### ✨ Nouvelles fonctionnalités

- **Tutoriel interactif** — Un guide étape par étape accompagne les nouveaux utilisateurs à la prise en main. Relançable depuis la page Aide.

### 🔧 Changements

_Aucun changement notable._

### 🐛 Corrections

_Aucune correction._

---

## [1.1.0] — 2 mars 2026

### ✨ Nouvelles fonctionnalités

- **Alerte mouvement suspect** — Notification push envoyée aux administrateurs si un véhicule est utilisé de manière inhabituelle.

### 🔧 Changements

- **Notifications** — Passage aux notifications push (mobile et web) en remplacement des e-mails pour les alertes incidents.
- **URLs des véhicules** — Les adresses utilisent la nomenclature opérationnelle (ex. `/vehicles/VL186`).

### 🐛 Corrections

_Aucune correction._

---

## [1.0.0] — 2 mars 2026

### 🚀 Lancement

- Authentification Google sécurisée, restreinte aux adresses `@croix-rouge.fr`.
- Gestion du parc automobile : tableau de bord, fiches véhicules, statuts.
- Cycle complet d'emprunt et de retour : état du véhicule, niveau d'énergie, DSA, type de mission, commentaires, photos.
- Gestion des conducteurs secondaires.
- Galerie photos connectée à Google Drive.
- Intégration Renault Connect (kilométrage et batterie en direct).
- Panel administrateur : gestion des rôles, historiques, notes.
- Mode sombre natif, design responsive.
