---
title: 'Retours terrain (2) : vues Semaine/Jour du calendrier, photos obligatoires avec dérogation, dossiers créés depuis les incidents'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_commit: 'a388ef9e53ef61d4f8ddbb44d3215d66149c8a8c'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/src/__tests__/CLAUDE.md', '{project-root}/src/components/CLAUDE.md', '{project-root}/src/lib/fleetTracking/AGENTS.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Retours d'une utilisatrice (rapport `rapport-retours-martine.md`, points 4, 7, 9) :
(4) le calendrier n'a qu'une vue mois, illisible au-delà de 3 réservations par jour (jusqu'à 10 chez eux) ;
(7) les photos de départ sont « (Optionnel) », alors que leur règle est « obligatoires, dérogation possible en urgence » ;
(9) les dossiers du suivi technique sont créés à la main : une déclaration d'incident (accident, flash) n'y apparaît pas, et chacun (UL, assurance) finit avec une vision différente.

**Approach:** (4) sélecteur Mois / Semaine / Jour côté interface ; (7) réglage par UL + fenêtre de dérogation + trace sur la sortie ; (9) création automatique d'un dossier « Nouveau » à partir des déclarations d'incident envoyées, statuts Nouveau / En cours / En attente / Clos avec motif de clôture. Une spec, une PR depuis `preview` (choix de l'utilisateur), version 5.58.0.

## Boundaries & Constraints

**Always:**
- (4) Données et API inchangées (`GET /api/vehicles/calendar?month=`) ; une semaine à cheval charge les deux mois. Mêmes événements, filtre véhicule, modale de détail et `dtView` qu'en vue mois. Choix de vue mémorisé (`localStorage`), défaut Mois.
- (7) `UniteLocale.checkoutPhotosRequired` (NULL/0 = optionnel, comportement actuel strictement inchangé). Obligatoire : pas de « (Optionnel) », consigne « au minimum 4 photos : avant, arrière, côté gauche et côté droit » ; validation sans photo → fenêtre « Photos obligatoires » (« Prendre des photos » / « Continuer sans photo ») ; la dérogation pose `Trip.photosSkipped = 1`, affichée « 📷 Sans photo » dans l'historique des sorties. **Aucune mention d'« urgence »** nulle part (fenêtre, bouton, historique) — décision de l'utilisateur. Dérogation = trace seule, aucune notification. Réglable par qui peut modifier l'UL.
- (9) Statuts `NEW` (Nouveau), `OPEN` (En cours — valeur existante conservée, aucune reprise de données), `WAITING` (En attente), `CLOSED` (Clos). « Ouvert » = tout sauf `CLOSED`, partout (liste, filtre « Ouverts », vue d'ensemble, sélecteur de dossier, compteurs, gardes). Motif de clôture `closeReason` obligatoire à la clôture parmi `NO_ACTION` (Sans suite), `REPAIRED` (Réparé), `INSURANCE` (Pris en charge par l'assurance), `OTHER` (Autre) ; effacé à la réouverture.
- (9) Déclencheur (décision de l'utilisateur) : **uniquement les déclarations d'incident** (`IncidentReport`, types ACCIDENT et FLASH) au moment où elles passent à `SUBMITTED` — à la création directement envoyée (`POST /api/incidents` avec `status: SUBMITTED`) comme au passage DRAFT → SUBMITTED (`PATCH /api/incidents/[id]`). **Rien depuis le carnet de bord** (prise, retour).
- (9) Dossier automatique : statut `NEW`, UL et véhicule de la déclaration, `sourceType = 'INCIDENT_REPORT'` + `sourceId` = id de la déclaration (un seul dossier par source : index unique partiel), titre généré (« Accident — <véhicule> » / « Avis de contravention (flash) — <véhicule> »), description générée (déclarant, date et lieu de l'incident, description saisie), lien vers la déclaration. Création **après** l'écriture de la déclaration, non bloquante (erreur journalisée, la requête réussit).
- Migrations idempotentes (dry-run, `--apply`, `--env`), listées dans `CLAUDE.md` « À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.58.0 » ; CHANGELOG français orienté utilisateur ; `package.json`/lock 5.58.0.

**Never:**
- Rien sur la DT (pas de transmission du dossier à la DT, pas de vue partagée).
- (7) Pas de photos ajoutées au parcours QR (il n'en a pas aujourd'hui).
- (9) Pas de journal d'événements du dossier, pas de modification du parcours manuel de création de dossier (statut initial `OPEN` inchangé pour un dossier créé à la main).
- (4) Pas de flux iCal, pas de modification d'API.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Semaine à cheval | semaine 27 oct → 2 nov | deux fetch (2026-10, 2026-11), événements fusionnés sans doublon | N/A |
| Journée chargée | 10 réservations le même jour | toutes visibles en vue Jour | N/A |
| Photos UL optionnelles | UL sans réglage, aucune photo | prise envoyée, pas de fenêtre, `photosSkipped` absent | N/A |
| Photos obligatoires, aucune | UL obligatoire, 0 photo, « Continuer quand même » | prise créée, `photosSkipped = 1` | N/A |
| Photos obligatoires, présentes | UL obligatoire, ≥ 1 photo | aucune fenêtre, `photosSkipped = 0` | N/A |
| Déclaration d'accident envoyée | POST `/api/incidents` `type: ACCIDENT, status: SUBMITTED` | 1 dossier `NEW` « Accident — VL186 », `sourceType = INCIDENT_REPORT`, `sourceId` = id | échec dossier → déclaration 201 quand même |
| Flash envoyé après brouillon | PATCH DRAFT → SUBMITTED, `type: FLASH` | 1 dossier `NEW` « Avis de contravention (flash) — VL186 » | idem |
| Brouillon | POST/PATCH avec `status: DRAFT` | aucun dossier | N/A |
| Déclaration envoyée deux fois | passage à SUBMITTED répété | un seul dossier (unicité source) | N/A |
| Prise ou retour avec incident | carnet : `conditionOut = 'Dégradé'`, `conditionIn = 'Problème signalé'` | **aucun** dossier (comportement actuel inchangé) | N/A |
| Clôture sans motif | PATCH `status: CLOSED` sans `closeReason` | 400 | message français |
| Réouverture | PATCH `CLOSED → OPEN` | `closedAt` et `closeReason` effacés | N/A |

</frozen-after-approval>

## Code Map

- `src/components/vehicle/VehicleCalendar.tsx` (+ `.module.css` ~l.281 `max-height:110px`) -- vue mois actuelle : navigation mois (`handlePrevMonth`…), `monthParam`, fetch `/api/vehicles/calendar?month=`, rendu des événements (onClick → `setSelectedEvent`), modale de détail, `dtView`.
- `src/components/vehicle/modals/CheckOutModal.tsx` (~l.400 `PhotoPicker` « (Optionnel) », envoi `uploadMediaSafely` puis `POST /api/trips`) -- prise depuis la fiche ; seul parcours avec photos.
- `src/app/api/ul/route.ts` (GET), `src/app/api/ul/[id]/route.ts` (PATCH `updateUlSchema`), `src/components/admin/ULsTab.tsx` -- modèle : `minFuelReturnPercent` (v5.57.0), à reproduire ; `src/app/api/vehicles/[id]/route.ts` expose déjà `minFuelReturnPercent` de l'UL du véhicule.
- `src/app/api/trips/route.ts` + `schema.ts` (INSERT Trip) -- prise depuis la fiche (`photosSkipped`). Le carnet (prise/retour, `src/lib/checkout.ts`, routes checkin) ne crée PAS de dossier : ne pas y toucher pour le point 9.
- `src/app/api/incidents/route.ts:91` (POST, `status: SUBMITTED` direct → notification) et `src/app/api/incidents/[id]/route.ts:201` (PATCH, passage DRAFT → SUBMITTED, notification unique) -- les deux points d'accroche du dossier automatique ; `IncidentReport` : `type` ACCIDENT | FLASH, `vehicleId`, `userId`, `occurredAt`, `location`, `description` ; UL = celle du véhicule. Il n'y a pas de page de déclaration : le « lien vers la déclaration » du dossier est son PDF `/api/incidents/<id>/pdf` (consultation existante : `src/components/vehicle/modals/IncidentHistoryModal.tsx`).
- `src/lib/fleetTracking/schema.ts` (`FLEET_DOSSIER_DDL`, index), `dossiers.ts` (`DOSSIER_STATUSES`, labels, Zod, `dossierFiltersSchema`, `dossierSummary`, tri), `dossiersStore.ts` (`createDossier`, `updateDossier` : `closedAt`, `listDossiers`), `dossierGuards.ts:40`, `overview.ts:127,141,163`, `overviewStore.ts:16` -- tout test `=== 'OPEN'` devient « ouvert = ≠ CLOSED ».
- `src/components/fleetTracking/` : `DossierHeader.tsx:62,86` (bouton Clore/Rouvrir → sélecteur de statut + motif), `DossiersTab.tsx:28` (filtre), `useFleetDossiers.ts:15`, `DossierSelect.tsx:19`, `DossierListItem.tsx:19,34`.
- `src/components/vehicle/TripItem.tsx`, `src/app/vehicles/[id]/types.ts` -- historique des sorties.
- `scripts/add-mission-lead-and-fuel-threshold.ts` (modèle de migration), `scripts/add-fleet-tracking.ts` (migration du suivi), `scripts/setup-dev.ts`, `src/__tests__/integration/setup.ts` (deux définitions de Trip / UniteLocale ; tables du suivi).
- `npm run mcp:catalog` si une route change de signature.

## Tasks & Acceptance

**Execution:**
- [x] `src/components/vehicle/` -- extraire l'état du calendrier dans un hook (`useCalendarView`), composants `CalendarWeekView`, `CalendarDayView`, sélecteur de vue ; clic sur un numéro de jour (mois) → vue Jour.
- [x] `scripts/add-checkout-photos-and-dossier-tickets.ts` -- `UniteLocale.checkoutPhotosRequired INTEGER`, `Trip.photosSkipped INTEGER`, `FleetDossier.closeReason/sourceType/sourceId TEXT`, index unique partiel `(sourceType, sourceId) WHERE sourceId IS NOT NULL` ; mêmes ajouts dans `setup-dev.ts`, `integration/setup.ts`, `fleetTracking/schema.ts`.
- [x] Photos (7) -- UL (GET/PATCH/ULsTab), `GET /api/vehicles/[id]` (`vehicle.checkoutPhotosRequired`, `trips[].photosSkipped`), `POST /api/trips` (`photosSkipped`), `CheckOutModal` + composant `PhotosRequiredModal`, `TripItem`.
- [x] Dossiers (9) -- `src/lib/fleetTracking/incidentDossiers.ts` : `createIncidentDossier(reportId)` (lit la déclaration et son véhicule, INSERT OR IGNORE sur la source, ligne `FleetDossierVehicle`) ; appel non bloquant depuis `POST /api/incidents` et `PATCH /api/incidents/[id]` au passage à SUBMITTED ; statuts, motif, filtres, UI.
- [x] Tests -- unitaires (libellés/motifs, `isDossierActive`, génération titre/description), intégration (création auto par source, unicité, non-blocage, 400 clôture sans motif, réouverture, filtre ouverts, PATCH UL, POST trips `photosSkipped`), composants (vues calendrier, fenêtre photos, en-tête de dossier).
- [x] `CHANGELOG.md`, `package.json`/lock 5.58.0, `CLAUDE.md` (script), `npm run mcp:catalog`.

**Acceptance Criteria:**
- Given une UL à photos obligatoires, when un chauffeur valide la prise sans photo et choisit « Prendre des photos », then rien n'est envoyé et le sélecteur de photos est mis en avant.
- Given un dossier automatique `NEW`, when le responsable véhicule le passe « En attente » puis le clôt « Pris en charge par l'assurance », then il quitte le filtre « Ouverts » et affiche son motif dans « Clos ».
- Given des dossiers `NEW`/`OPEN`/`WAITING`, when on ouvre la vue d'ensemble, then tous comptent comme ouverts.
- Given une déclaration d'accident envoyée pour VL186, when le responsable ouvre « Dossiers », then un dossier « Nouveau » « Accident — VL186 » y figure avec un lien vers la déclaration.

## Implementation Notes

- Implémenté par un sous-agent (v5.58.0), diff relu.
- Calendrier : `src/lib/calendarEvents.ts`, `useCalendarView.ts`, `CalendarEventCard/ViewSwitcher/WeekView/DayView.tsx` ; clé `localStorage` `vehicle_calendar_view`.
- Photos : `PhotosRequiredModal.tsx` (« Continuer sans photo » / « Prendre des photos »), aucune mention d'urgence (testé) ; `photosSkipped` n'est posé que si aucun dossier de photos n'est envoyé.
- Dossiers : `incidentDossiers.ts` (INSERT OR IGNORE + index unique partiel `idx_FleetDossier_source`), appelé après l'écriture de la déclaration dans les deux seules routes qui écrivent `IncidentReport` (le parcours QR passe aussi par elles). Filtre `status=OPEN` = tout sauf clos. `DossierStatusControl.tsx` pour statut et motif.
- Migration `scripts/add-checkout-photos-and-dossier-tickets.ts` (lot atomique) ; dry-run preview : 5 colonnes + index absents.

## Spec Change Log

## Review Triage Log

Passe 1 (blind-hunter, edge-case-hunter, verification-gap).

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | edge+blind | `DossierStatusControl` garde `closing`/`reason` après clôture → formulaire de clôture réaffiché après réouverture | medium | état local jamais réinitialisé, composant reste monté | patch |
| 2 | edge | PATCH `{ closeReason: null }` sur un dossier clos efface le motif obligatoire | medium | le refine Zod ne s'applique que si `status: CLOSED` est envoyé ; `updateDossier` écrit `closeReason` seul | patch |
| 3 | edge | Échap dans la fenêtre « Photos obligatoires » ferme aussi la prise (formulaire perdu) | medium | `CheckOutModal` : `useEscapeKey(onClose)` sans condition, deux écouteurs window | patch |
| 4 | edge | UL obligatoire, photos choisies mais envoi échoué → sortie sans photo ni trace | low | `driveFolderId` indéfini, `photosSkipped` non envoyé ; correction directe | patch |
| 5 | edge | Navigation rapide : une réponse ancienne écrase la période affichée | medium | effet de fetch sans annulation | patch |
| 6 | edge+blind | Libellé de semaine à cheval sur deux années sans l'année de début | low | `calendarRangeLabel` ; correction directe | patch |
| 7 | edge | `INSERT OR IGNORE` masque les autres violations de contrainte | low | remplacement par `ON CONFLICT … DO NOTHING` ciblé | patch |
| 8 | edge | `??` : nom vide → pas de repli sur l'e-mail | low | correction directe | patch |
| 9 | blind | Migration : `FleetDossierVehicle` non vérifiée | low | `createIncidentDossier` y écrit ; ajout d'une précondition | patch |
| 10 | blind | Couleurs NEW/WAITING codées en dur | low | autres statuts sur variables du thème | patch |
| 11 | blind | Réglage UL ne dit pas que seule la prise depuis la fiche est concernée | low | texte d'aide | patch |
| 12 | blind | CHANGELOG : « Ouvert » → « En cours » et dossiers auto non mentionnés, double « depuis » | low | texte | patch |
| 13 | vg | NEW/WAITING jamais testés comme « ouverts » (vue d'ensemble, résumé, tri, historique) | gap | pré-vérifié | patch |
| 14 | vg | Semaine à cheval : double chargement non vérifié dans le composant | gap | pré-vérifié | patch |
| 15 | vg | Script de migration sans test (ses voisins en ont) | gap | pré-vérifié | patch |
| 16 | vg | Lien PDF, « Motif : », sélecteur de statut non testés | gap | pré-vérifié | patch |
| 17 | blind | Règle « 4 photos minimum » non vérifiée (1 à 3 passent) | false | conforme à la spec : fenêtre seulement sans aucune photo (ligne « ≥ 1 photo ») ; même comportement que l'outil actuel de l'UL | rejet |
| 18 | edge+blind | Le serveur ne déduit pas `photosSkipped` du réglage de l'UL (QR, API) | false | QR exclu par l'intention ; marquer chaque prise QR « Sans photo » contredirait l'intention | rejet |
| 19 | edge | `photosSkipped: true` accepté pour une UL sans obligation | low | seul notre client l'envoie, uniquement si l'UL l'exige | rejet |
| 20 | blind | Parcours QR non couvert | false | exclu par l'intention (« Pas de photos ajoutées au parcours QR ») ; texte d'aide complété (#11) | rejet |
| 21 | edge+blind | Déclaration supprimée → lien PDF en 404 sur le dossier | low | suppression d'une déclaration envoyée rare ; correctif = nouvelle écriture dans la route de suppression | rejet |
| 22 | edge | Échec d'un des deux mois → anciennes données affichées | low | même comportement qu'avant pour un mois unique | rejet |
| 23 | edge | Contour rouge persistant après ajout/retrait de photos | low | cosmétique | rejet |
| 24 | blind | Déclarations déjà envoyées sans dossier | low | hors intention (création à l'envoi) ; mentionné au CHANGELOG (#12) | defer |
| 25 | blind | Motif « Autre » sans précision ; sélecteur de statut sans confirmation | low | choix d'interface | rejet |
| 26 | blind | Réglage absent à la création d'UL | low | modifiable juste après ; même choix que le seuil carburant | rejet |
| 27 | blind | Cartes d'événement du calendrier non atteignables au clavier | low | pré-existant (vue mois) | rejet |
| 28 | blind | Dossier = instantané ; `createdBy` = déclarant ; notification sans lien vers le dossier | low | choix assumés, sans dommage nommé | rejet |
| 29 | vg | Nom du déclarant écrit dans la description du dossier (déclarations anonymes) | false | lecteurs des dossiers (`requireFleetManager` = `canManageVehicles`) = ceux à qui `canRevealIncidentAuthor` révèle l'auteur ; voulu par la spec | rejet |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 avertissement
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run test` -- expected: tout passe
- `npx tsx scripts/add-checkout-photos-and-dossier-tickets.ts --env /Users/jn/Projects/CRF-Fleet-management/.env.preview` -- expected: dry-run lisible, aucune écriture

**Manual checks (if no CLI):**
- Vue Semaine/Jour sur mobile et desktop ; fenêtre « Photos obligatoires » au-dessus de la modale de prise.
