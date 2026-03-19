# Changelog

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
