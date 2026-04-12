# Changelog

## [2.4.3] — 12 avril 2026

### ✨ Nouvelles fonctionnalités

- **Nouveau sélecteur de photos unifié** — Introduction d'un composant dédié proposant deux boutons distincts : "Appareil photo" et "Galerie". Cette approche garantit que l'utilisateur a toujours le choix, quel que soit son appareil ou son navigateur.
- **Interface cohérente** — Déploiement du nouveau sélecteur sur tous les points d'entrée : prise de véhicule, retour de véhicule, photos de mission et rapport signé.

## [2.4.2] — 12 avril 2026

### 🔧 Changements

- **Sélecteur de photos flexible** — Suppression de la contrainte d'appareil photo forcé sur mobile. Les utilisateurs peuvent désormais choisir entre prendre une photo en direct ou sélectionner des images depuis leur galerie.

## [2.4.1] — 1 avril 2026

### ✨ Nouvelles fonctionnalités

- **Signature du rapport de mission** — Nouvelle étape obligatoire lors de la saisie d'un compte rendu : l'utilisateur doit désormais joindre une photo du rapport papier signé par l'organisateur.
- **Capture simplifiée** — Prise de photo directe (mode scanner) ou import d'un document existant depuis la galerie.
- **Sauvegarde sécurisée** — Archivage automatique des rapports signés dans un espace de stockage partagé sécurisé.
- **Consultation immédiate** — Le rapport signé est désormais visible directement sur la fiche détaillée du compte rendu de mission.

### 🔧 Changements

- **Parcours utilisateur fluidifié** — Réorganisation des étapes du formulaire de mission pour intégrer la signature du rapport de manière intuitive.

## [2.4.0] — 29 mars 2026

### ✨ Nouvelles fonctionnalités

- **Environnement de développement modernisé** — Lancement automatique d'une base de données locale isolée et performante pour les tests.
- **Mode test avec données réelles** — Possibilité d'initialiser l'environnement de travail avec une copie sécurisée des données réelles pour des tests plus fiables.
- **Outils de gestion simplifiés** — Nouvelles commandes pour réinitialiser ou arrêter l'environnement de travail en toute simplicité.

### 🔧 Changements

- **Configuration adaptative** — L'environnement s'adapte désormais automatiquement au mode de travail sélectionné.
- **Documentation à jour** — Guide de contribution mis à jour avec les nouveaux outils de démarrage.

## [2.3.2] — 29 mars 2026

### 🐛 Corrections

- **Gestion des réservations** — Correction d'un problème permettant des conflits de réservation pour certains profils, y compris les administrateurs.

## [2.3.1] — 25 mars 2026

### ✨ Nouvelles fonctionnalités

- **Infos de désinfection persistantes** — Les informations de désinfection (responsable et numéro de lot) sont désormais sauvegardées et survivent au rechargement de la page pour pré-remplir le formulaire de retour.

### 🔧 Changements

- **Indicateur de saisie** — L'indicateur visuel des informations de désinfection reflète désormais l'état réel des données enregistrées en base.

### 🐛 Corrections

- _Aucune correction._

## [2.3.0] — 22 mars 2026

### ✨ Nouvelles fonctionnalités

- **Gestion des comptes inactifs** — Les utilisateurs dont le compte est désactivé sont désormais redirigés vers une page d'information dédiée.
- **Statistiques pour tous** — La section Statistiques & exports est désormais accessible à tous les membres actifs de l'organisation.

### 🔧 Changements

- **Clarification des rôles** — Le rôle "Invité" est renommé en "Inactif" pour plus de clarté.
- **Spécialisation des permis** — Les chauffeurs sont désormais restreints aux types de véhicules (VL ou VPSP) correspondant à leurs habilitations.
- **Légende des permissions** — Mise à jour des descriptions pour mieux refléter les accès réels aux statistiques et à l'inventaire.
- **Sécurité des réglages** — L'accès à la configuration avancée des menus est désormais réservé aux administrateurs.

### 🐛 Corrections

- _Aucune correction._

## [2.2.0] — 22 mars 2026

### ✨ Nouvelles fonctionnalités

- **Accès dédié aux missions** — Nouveau rôle permettant aux responsables de gérer les comptes rendus de mission de manière isolée.
- **Contrôle d'affichage des menus** — Les administrateurs peuvent désormais activer ou masquer chaque menu de la navigation pour les utilisateurs.
- **Page Administration unifiée** — Refonte de la page de gestion regroupant désormais les utilisateurs et le paramétrage des menus.

### 🔧 Changements

- **Attribution automatique du rôle Secouriste** — Simplification de la gestion des droits avec l'attribution automatique du rôle de base lors de la création d'un compte.
- **Accès Inventaire** — L'accès aux fiches d'inventaire nécessite désormais explicitement le rôle correspondant pour plus de sécurité.

### 🐛 Corrections

- _Aucune correction._

## [2.1.0] — 20 mars 2026

### ✨ Nouvelles fonctionnalités

- **Photos de communication** — Possibilité d'ajouter des photos du poste ou de l'équipe (jusqu'à 10) lors de la saisie d'un compte rendu de mission.
- **Galerie photos intégrée** — Visualisation directe des photos de communication sur la page de détail du compte rendu.

### 🔧 Changements

- **Formulaire de mission enrichi** — Ajout d'une étape optionnelle dédiée aux photos en fin de saisie.

### 🐛 Corrections

- _Aucune correction._

## [2.0.2] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Traçabilité des validations** — Affichage du nom du validateur lors de la vérification des papiers d'un chauffeur.

### 🔧 Changements

- _Aucun changement._

### 🐛 Corrections

- _Aucune correction._

## [2.0.1] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Nouveau rôle Secouriste** — Création d'un profil dédié pour les bénévoles effectuant des missions sans conduite de véhicule.

### 🔧 Changements

- **Légende visuelle** — Mise à jour des couleurs et descriptions dans la gestion des utilisateurs.

### 🐛 Corrections

- _Aucune correction._

## [2.0.0] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Module Comptes Rendus de Mission (CRM)** — Saisie directe des rapports de mission dans l'application via un formulaire guidé.
- **Formulaire complet en 6 étapes** — Saisie détaillée de l'équipage, du matériel consommé, de l'oxygène et des incidents.
- **Tableau de bord des missions** — Liste filtrable des rapports pour les chauffeurs et les responsables.
- **Gestion simplifiée** — Possibilité pour les administrateurs de supprimer ou modifier les rapports erronés.

### 🔧 Changements

- **Navigation enrichie** — Ajout d'un lien direct "Missions" dans la barre de navigation.

### 🐛 Corrections

- _Aucune correction._

## [1.21.1] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Flexibilité des révisions** — Possibilité de modifier les dates d'immatriculation et les intervalles de maintenance sans recréer le véhicule.

### 🔧 Changements

- _Aucun changement._

### 🐛 Corrections

- _Aucune correction._

## [1.21.0] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Validation annuelle des papiers** — Mise en place d'un contrôle obligatoire de la validité du permis de conduire.
- **Alertes visuelles** — Bannière d'information indiquant le délai restant avant le blocage pour non-validation.
- **Blocage de sécurité** — Désactivation automatique des réservations si les papiers ne sont pas validés à temps.
- **Gestion déléguée** — Les responsables peuvent désormais valider les papiers des chauffeurs directement.

### 🔧 Changements

- **Suivi administratif** — Ajout d'un statut clair sur la validité des documents dans la fiche utilisateur.

### 🐛 Corrections

- _Aucune correction._

## [1.20.0] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Suivi d'entretien visuel** — Indicateurs colorés pour le contrôle technique et les révisions à venir.
- **Historique de maintenance** — Journal complet des interventions effectuées sur chaque véhicule.
- **Configuration précise** — Paramétrage des intervalles de révision lors de l'ajout d'un véhicule.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.19.0] — 18 mars 2026

### ✨ Nouvelles fonctionnalités

- **Gestion de la désinfection** — Suivi automatique de la désinfection périodique obligatoire pour les véhicules sanitaires (VPSP).
- **Indicateur de validité** — Décompte visuel en jours jusqu'à la prochaine désinfection obligatoire.
- **Formulaire de retour renforcé** — Saisie obligatoire des informations de désinfection lors des missions sanitaires.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.18.0] — 14 mars 2026

### ✨ Nouvelles fonctionnalités

- **Réservation pour tiers** — Les administrateurs peuvent désormais réserver un véhicule au nom d'un autre chauffeur.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.17.1] — 13 mars 2026

### ✨ Nouvelles fonctionnalités

- **Aide à la gestion** — Ajout d'une légende détaillée des rôles et des niveaux d'accès.

### 🔧 Changements

- _Aucun changement notable._

### 🔒 Sécurité

- **Accès restreint** — Suppression de la création automatique de compte ; seuls les utilisateurs invités peuvent se connecter.

### 🐛 Corrections

- _Aucune correction._

## [1.17.0] — 13 mars 2026

### ✨ Nouvelles fonctionnalités

- **Suivi électrique** — Gestion de la capacité batterie et statistiques de consommation en kWh/100km pour les véhicules électriques.

### 🔧 Changements

- **Unités adaptatives** — Affichage dynamique des consommations en Litres ou en kWh selon le type de moteur.

### 🐛 Corrections

- _Aucune correction._

## [1.16.0] — 13 mars 2026

### ✨ Nouvelles fonctionnalités

- **Filtres de statistiques** — Nouveaux filtres par véhicule, chauffeur et type de mission.
- **Indicateurs de performance** — Taux d'utilisation, niveau moyen de carburant au retour et taux d'incidents précis.
- **Export PDF complet** — Rapport d'activité enrichi pour le partage des statistiques.

### 🔧 Changements

- **Tableaux enrichis** — Ajout de colonnes de performance dans le classement des chauffeurs.

### 🐛 Corrections

- _Aucune correction._

## [1.15.3] — 13 mars 2026

### ✨ Nouvelles fonctionnalités

- **Capacité de réservoir personnalisée** — Paramétrage précis pour chaque véhicule afin d'améliorer la fiabilité des calculs de consommation.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Précision du carburant** — Correction du calcul du pourcentage restant basé sur la capacité réelle.

## [1.15.2] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Calcul de consommation** — Les pleins de carburant et recharges ne faussent plus la moyenne de consommation.

## [1.15.1] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- **Messages personnalisés** — Diversification des messages humoristiques selon les habitudes des chauffeurs.

### 🐛 Corrections

- _Aucune correction._

## [1.15.0] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- **Amélioration de la stabilité** — Optimisation interne du code pour une application plus fluide.

### 🐛 Corrections

- _Aucune correction._

## [1.14.0] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

- **Signalement de bug** — Bouton direct pour signaler un problème technique aux administrateurs.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.13.0] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- _Aucun changement notable._

### 🔒 Sécurité

- **Protection des profils** — Renforcement de l'identification des utilisateurs contre les changements d'adresse email.

### 🐛 Corrections

- _Aucune correction._

## [1.12.0] — 9 mars 2026

### ✨ Nouvelles fonctionnalités

- **Saisie prédictive** — Pré-remplissage automatique du nom de la mission basé sur la réservation en cours.
- **Rapports PDF officiels** — Intégration du logo et mise en page professionnelle pour les exports.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Filtres de dates** — Correction de l'inclusion du dernier jour dans les statistiques.
- **Affichage des faits marquants** — Ajustement du seuil d'apparition des anecdotes sur les chauffeurs.

## [1.11.0] — 9 mars 2026

### ✨ Nouvelles fonctionnalités

- **Tableau de bord Statistiques** — Analyse visuelle de l'activité sur les 60 derniers jours (emprunts, kilomètres, incidents).
- **Anecdotes chauffeurs** — Section humoristique mettant en avant les habitudes marquantes des utilisateurs.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.10.0] — 9 mars 2026

### ✨ Nouvelles fonctionnalités

- **Véhicules connectés** — Récupération automatique et en temps réel du kilométrage et de l'énergie.
- **Badge de vérification** — Indicateur visuel lorsque les données sont en cours de mise à jour.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.9.2] — 8 mars 2026

### ✨ Nouvelles fonctionnalités

- **Contrôle de propreté** — Nouveau critère d'état du véhicule lors du départ et du retour.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.9.1] — 8 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- **Accessibilité améliorée** — Interface optimisée pour la navigation au clavier et les lecteurs d'écran.

### 🐛 Corrections

- _Aucune correction._

## [1.9.0] — 7 mars 2026

### ✨ Nouvelles fonctionnalités

- **Jauge d'énergie visuelle** — Indicateur graphique interactif avec code couleur pour le carburant et la batterie.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.8.0] — 6 mars 2026

### ✨ Nouvelles fonctionnalités

- **Gestion des notifications push** — Contrôle simplifié de l'activation des alertes en temps réel.

### 🔧 Changements

- **Sécurité des alertes** — Notifications push réservées aux administrateurs et responsables.

### 🐛 Corrections

- **Navigation de secours** — Correction des redirections et du fonctionnement du tour guidé.

## [1.7.0] — 6 mars 2026

### ✨ Nouvelles fonctionnalités

- **Correction de données** — Possibilité de signaler une erreur de kilométrage ou de carburant lors de la prise d'un véhicule.
- **Historique paginé** — Navigation fluide dans les sorties passées du véhicule.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Fuseau horaire** — Toutes les heures sont désormais calées sur l'heure de Paris.

## [1.6.0] — 6 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- _Aucun changement notable._

### 🔒 Sécurité

- **Protection renforcée** — Mise en place de mesures anti-piratage et validation stricte des documents uploadés.

### 🐛 Corrections

- **Validation des formulaires** — Amélioration de la fiabilité des fenêtres de saisie.

## [1.5.0] — 6 mars 2026

### ✨ Nouvelles fonctionnalités

- **Validation des réservations** — Nouveau flux de demande d'emprunt avec approbation par les responsables.

### 🔧 Changements

- **Optimisation mobile** — Amélioration de l'affichage sur les petits écrans.

### 🐛 Corrections

- _Aucune correction._

## [1.4.0] — 5 mars 2026

### ✨ Nouvelles fonctionnalités

- **Checklists personnalisées** — Listes de contrôle sur-mesure obligatoires au départ et au retour de chaque véhicule.
- **Gestion simplifiée des comptes** — Création directe d'utilisateurs par les administrateurs.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Installation mobile** — Correction de l'affichage du bouton d'installation sur smartphone.

## [1.3.0] — 5 mars 2026

### ✨ Nouvelles fonctionnalités

- **Système de réservation** — Calendrier complet pour planifier les utilisations futures.
- **Fluidité d'affichage** — Mise en place de structures animées pendant le chargement des pages.
- **Application mobile (PWA)** — Possibilité d'installer l'outil comme une application native sur Android et iPhone.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.2.3] — 5 mars 2026

### ✨ Nouvelles fonctionnalités

- **QR Codes véhicules** — Génération de codes à flasher pour accéder directement à la fiche d'un véhicule.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.2.2] — 4 mars 2026

### ✨ Nouvelles fonctionnalités

- **Easter egg Konami** — ↑ ↑ ↓ ↓ ← → ← → B A 🎮

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Reprise de navigation** — Redirection automatique vers la page demandée après la connexion.

## [1.2.1] — 4 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- **Recherche utilisateurs** — Ajout d'une barre de recherche et d'une pagination dans la gestion des comptes.

### 🐛 Corrections

- _Aucune correction._

## [1.2.0] — 4 mars 2026

### ✨ Nouvelles fonctionnalités

- **Guide de bienvenue** — Tutoriel interactif pour faciliter la première prise en main de l'application.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.1.0] — 2 mars 2026

### ✨ Nouvelles fonctionnalités

- **Détection de mouvements suspects** — Alertes automatiques en cas d'utilisation inhabituelle hors planning.

### 🔧 Changements

- **Notifications push** — Abandon des e-mails au profit des alertes directes sur smartphone.

### 🐛 Corrections

- _Aucune correction._

## [1.0.0] — 2 mars 2026

### 🚀 Lancement

- Connexion sécurisée avec les adresses Croix-Rouge française.
- Gestion complète du parc automobile et fiches d'état.
- Cycle d'emprunt et de retour guidé (photos, énergie, commentaires).
- Historique complet des sorties et gestion des conducteurs secondaires.
- Synchronisation automatique avec les données constructeur.
- Interface moderne avec mode sombre et design mobile.
