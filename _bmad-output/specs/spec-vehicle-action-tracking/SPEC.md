---
id: SPEC-vehicle-action-tracking
companions:
  - domain-model.md
  - dashboard-mockup.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Suivi technique de la flotte : dossiers, tâches et prestataires

## Why

**Douleur opérationnelle.** Les responsables véhicule et les admins d'une UL suivent aujourd'hui hors de l'appli ce qui doit avancer sur leurs véhicules : devis à demander, références de sinistre à récupérer, contrôles à caler, garages à rappeler. Rien n'est partagé entre responsables, rien n'est rattaché au véhicule concerné, et les bons prestataires d'une UL ne profitent pas aux autres. Il faut un espace de suivi technique par UL (maquette « Le point sur la flotte ») : un tableau de tâches façon Trello, des dossiers, les échéances de contrôle et un annuaire de prestataires partageable entre UL.

## Capabilities

- **CAP-1**
  - **intent:** Un responsable gère l'annuaire des contacts utiles de son UL (garage, carrossier, assureur, dépanneur…) : création, modification, suppression, recherche.
  - **success:** Un contact créé avec nom, catégorie et au moins un téléphone apparaît dans la liste de l'UL et est retrouvé par une recherche sur son nom ou sa catégorie.
- **CAP-2**
  - **intent:** Un responsable partage un contact de son UL avec les autres UL ; elles le voient en lecture seule dans une section « Prestataires proposés par l'UL X ».
  - **success:** Contact partagé par l'UL A : un responsable de l'UL B le voit sous « Prestataires proposés par l'UL A » sans pouvoir le modifier (403 côté API) ; quand A retire le partage, il disparaît chez B.
- **CAP-3**
  - **intent:** Un responsable exporte dans son téléphone les contacts de son UL et ceux partagés, comme l'annuaire de la page Aide.
  - **success:** Le bouton d'export télécharge un `.vcf` contenant chaque contact visible (nom, téléphones, e-mail, catégorie ; préfixe « UL X » pour les partagés), importable dans les contacts iOS et Android.
- **CAP-4**
  - **intent:** Un responsable crée une tâche (titre, description, priorité, échéance) et l'attribue à lui-même ou à d'autres RESP_VEHICULE / ADMIN de l'UL.
  - **success:** Le sélecteur d'assignés ne propose que les RESP_VEHICULE / ADMIN actifs de l'UL ; une assignation vers un autre profil est refusée en 400.
- **CAP-5**
  - **intent:** Un responsable fait avancer les tâches entre états fixes (À faire, En cours, En attente, Terminé) sur un tableau à colonnes, et coche une tâche pour la terminer depuis la liste « Prochaines actions ».
  - **success:** Déplacer une carte vers une autre colonne (glisser-déposer ou action au clavier/mobile) persiste le nouvel état après rechargement ; cocher une tâche la passe à « Terminé » et la retire des prochaines actions.
- **CAP-6**
  - **intent:** Un responsable rattache à une tâche des véhicules de l'UL, des contacts, un incident ou une maintenance existants, et ouvre l'objet rattaché depuis la tâche.
  - **success:** Une tâche rattachée au 75-188 et au contact « MVR Evolution » affiche ces deux pastilles cliquables et apparaît dans le filtre par véhicule 75-188 ; rattacher un objet d'une autre UL est refusé.
- **CAP-7**
  - **intent:** Un responsable joint des fichiers (devis, photos, PDF) à une tâche ou à un dossier, les consulte et les supprime.
  - **success:** Un PDF joint est consultable par tout responsable de l'UL, inaccessible à un utilisateur d'une autre UL, et disparaît du stockage quand on le supprime.
- **CAP-8**
  - **intent:** Un responsable ouvre un dossier sur un véhicule (ex. « Sinistre roue arrière droite du 188 ») qui regroupe des tâches, des pièces à récupérer et des pièces jointes, puis le clôt.
  - **success:** Un dossier ouvert est compté dans « Dossiers ouverts » et dans le compteur du véhicule ; clos, il sort des deux compteurs et reste consultable.
- **CAP-9**
  - **intent:** Un responsable liste dans un dossier les pièces à récupérer (devis, référence sinistre, facture…) et les coche à réception, avec la valeur ou le fichier reçu.
  - **success:** Le compteur « Pièces à récupérer » égale le nombre de pièces non reçues des dossiers ouverts de l'UL ; cocher une pièce le décrémente.
- **CAP-10**
  - **intent:** Le module affiche les échéances de contrôle de chaque véhicule (CT, révision, désinfection VPSP) calculées depuis les données véhicule, et permet d'y saisir une date de rendez-vous.
  - **success:** Une échéance sans rendez-vous saisi compte dans « Contrôles à dater » ; une échéance dans moins de 30 jours ou dépassée compte dans « Échéances à traiter » ; saisir un rendez-vous retire l'échéance de « Contrôles à dater ».
- **CAP-11**
  - **intent:** Le responsable arrive sur un tableau de bord « Le point sur la flotte » qui résume l'UL : quatre compteurs, prochaines actions, encart « À confirmer en priorité », véhicules avec leur nombre de dossiers ouverts.
  - **success:** Sur une UL de démo, chaque compteur égale le décompte obtenu en interrogeant la base ; chaque carte mène à la liste filtrée correspondante (voir `dashboard-mockup.md`). Un responsable épingle autant de dossiers ou de tâches que nécessaire : tous apparaissent dans l'encart « À confirmer en priorité » ; sans aucune épingle, l'encart montre la tâche prioritaire non terminée à l'échéance la plus proche.
- **CAP-12**
  - **intent:** Une personne à qui un autre responsable attribue une tâche en est notifiée (in-app et push).
  - **success:** S'auto-attribuer une tâche n'envoie rien ; être ajouté par un tiers crée une notification in-app et un push menant à la tâche.
- **CAP-13**
  - **intent:** Un responsable consulte, pour un véhicule, l'historique complet de ses dossiers et tâches, clos et terminés compris : c'est la vie technique du véhicule.
  - **success:** Un dossier clos il y a plus d'un an et ses tâches terminées restent listés dans l'historique du véhicule, avec leurs pièces jointes consultables.

## Constraints

- Accès réservé à `canManageVehicles` (SUPER_ADMIN, ADMIN, RESP_VEHICULE), cloisonné à l'UL ; INACTIF bloqué ; contrôle côté API, pas seulement dans l'UI.
- Au sein de l'UL, tous les responsables voient et modifient toutes les tâches et tous les dossiers, quel qu'en soit le créateur ou l'assigné.
- Le module est un nouvel onglet de `/vehicles`, visible des seuls responsables ; pas d'entrée de menu dédiée ni de `MenuSetting`.
- Aucune purge : tâches terminées, dossiers clos et leurs pièces jointes sont conservés indéfiniment. Seule une suppression explicite par un responsable les retire.
- Seule exception au cloisonnement : la lecture et l'export des contacts partagés (CAP-2, CAP-3). Aucune autre donnée (tâches, dossiers, pièces jointes) ne traverse les UL.
- États des tâches fixes : À faire, En cours, En attente, Terminé. Pas de colonnes configurables.
- Pièces jointes écrites sur R2 via `src/lib/r2.ts`, rangées par UL (convention des autres modules ; écritures démo sous `demo/`) ; servies à un utilisateur autorisé de l'UL seulement.
- Échéances CT / révision / désinfection lues depuis les données véhicule existantes (`maintenanceUtils`, `nextDesinfMaxDate`), jamais ressaisies dans ce module.
- Schéma livré par un script de migration prod idempotent (dry-run ; `--apply`), documenté dans `CLAUDE.md`, à exécuter avant le déploiement.
- Toute écriture tracée par `withAudit` ; nouvelles routes ajoutées au catalogue MCP (`npm run mcp:catalog`).
- Tests : chaque route avec 401, 403, 400 (Zod) et cas nominal, plus refus inter-UL ; composants à logique testés ; `npm run lint` à 0 erreur et 0 warning.
- Interface en français, utilisable sur mobile (changement d'état sans glisser-déposer possible), clair et sombre via les variables CSS existantes ; la maquette donne la structure, pas un thème dédié.

## Non-goals

- Colonnes de tableau personnalisables, sous-tâches, commentaires en fil, mentions.
- Assignation de tâches à une autre UL ou à un profil hors RESP_VEHICULE / ADMIN.
- Copie d'un contact partagé dans l'annuaire local ; modification d'un contact d'une autre UL.
- Entrées « Messages » (messagerie interne) et « Réglages » de la maquette.
- Gestion des devis et factures (montants, validation, paiement) : un devis n'est qu'une pièce jointe ou une pièce à récupérer.
- Modification du calcul des échéances CT / révision / désinfection existant.

## Success signal

- Un RESP_VEHICULE de Paris XVIII ouvre « Sinistre roue du 188 », y ajoute la pièce « Référence sinistre » et une tâche « Confirmer devis auprès de Renault » attribuée à un autre responsable avec le contact du garage partagé par une autre UL ; l'assigné reçoit le push, joint le devis PDF, passe la tâche à « Terminé », et le tableau de bord reflète aussitôt les compteurs mis à jour. Un utilisateur CHVL ou d'une autre UL n'accède à rien de cela.

## Assumptions

- CAP-12 (notification à l'attribution) ajoutée par analogie avec les autres modules ; non demandée explicitement.
- Les assignés sont limités aux RESP_VEHICULE / ADMIN de la même UL.
- Seuil « Échéances à traiter » fixé à 30 jours avant l'échéance.
- Les échéances CT / révision / désinfection réutilisent les calculs existants plutôt qu'une nouvelle table de contrôles.
