---
title: 'Retours terrain : fenêtres qui défilent, carte Entretien, responsable de la mission, seuil carburant par UL'
type: 'feature'
created: '2026-11-22'
status: 'done'
baseline_commit: '6c0d7303f24a5057281cdc141e0b3925531488fc'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/src/__tests__/CLAUDE.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Retours d'une utilisatrice (rapport `rapport-retours-martine.md`, points 1, 2, 5, 6) :
(2) la fenêtre de réservation (et 4 autres) ne défile pas : le bas, donc « Valider », est inaccessible ;
(1) la carte « Entretien » affiche l'échéance du CT sans la nommer et des « km restants » faux sans révision connue ;
(5) aucun moyen de noter le responsable de la mission (CI, CDPE…) à l'emprunt ;
(6) le seuil carburant « 25 % (1/4) » est écrit en dur, alors que certaines UL demandent un retour à 50 %.

**Approach:** Un correctif CSS global ; une carte Entretien à deux lignes nommées ; un champ texte optionnel « Responsable de la mission » sur le trajet (colonne `Trip.missionLeadName`) affiché dans l'historique des sorties ; un seuil par UL (`UniteLocale.minFuelReturnPercent`, défaut 25) réglé dans l'onglet « Unités Locales » et repris par les textes d'aide de prise et de retour. Une seule spec, une seule PR (choix de l'utilisateur).

## Boundaries & Constraints

**Always:**
- Champ affiché « Responsable de la mission », **optionnel**, texte libre (≤ 120 car., espaces rognés, vide → NULL), présent à la prise dans les deux parcours (fiche véhicule et QR) et modifiable dans « Modifier la prise ».
- S'il est rempli, il apparaît dans chaque ligne de « Historique des sorties » (`TripItem`) ; sinon rien ne s'affiche.
- Seuil : entier 0–100, défaut 25 si NULL ; modifiable par qui peut déjà modifier l'UL (`PATCH /api/ul/[id]` : SUPER_ADMIN, ou ADMIN de son UL).
- Le seuil ne s'applique qu'aux véhicules thermiques ; le texte « batterie 50 % » des électriques reste inchangé.
- Fraction affichée seulement pour 25/50/75 (« 1/4 », « 1/2 », « 3/4 »).
- Script de migration idempotent (dry-run par défaut, `--apply`, `--env`), ajouté dans `CLAUDE.md` avec la mention « À EXÉCUTER AVANT LE DÉPLOIEMENT ».
- Version 5.57.0, `package-lock.json` synchronisé, entrée CHANGELOG en français, orientée utilisateur.

**Never:**
- Pas de modification de `getNextRevision` / `getNextCtDate` (consommés par `fleetTracking/controls.ts`, qui ne doit pas changer).
- Aucune règle bloquante sur le carburant (texte d'aide seulement), aucune alerte nouvelle.
- Pas de sélection de compte pour le responsable (texte libre), pas d'export CSV ni de stats.
- Rien sur la DT.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Responsable saisi | `missionLeadName: "  Paul D. (CI) "` à la prise | `Trip.missionLeadName = "Paul D. (CI)"`, visible dans l'historique | N/A |
| Responsable vide | absent ou `""` | NULL, rien d'affiché | N/A |
| Responsable trop long | 121 caractères | 400 Zod, aucun trajet créé | message d'erreur |
| Seuil UL absent | `minFuelReturnPercent` NULL | aide « … 25 % (1/4) … » | N/A |
| Seuil 50 | UL à 50, véhicule diesel | aide « … 50 % (1/2) … » à la prise et au retour | N/A |
| Seuil invalide | PATCH `minFuelReturnPercent: 150` | 400 | « Données invalides » |
| Révision sans historique | intervalles 2 ans / 30 000 km, aucune révision | « Révision : dans X » sans km | N/A |
| Révision km seul | `revisionYearInterval` NULL, dernière révision à 40 000 km | « Révision : dans N km », pas de date | N/A |

</frozen-after-approval>

## Code Map

- `src/app/globals.css:1071` -- `.modal-overlay` / `.modal` existent ; `.modal-content` n'est défini nulle part (5 usages : `ReservationFormModal.tsx:179`, `QRCodeModal`, `ReservationBlock`, `ULQRCodeModal`, `UniformQRCodeModal`).
- `src/components/vehicle/MaintenanceCard.tsx` -- carte Entretien ; valeur = CT non nommé, ligne révision via `getNextRevision`.
- `src/lib/maintenanceUtils.ts` -- `getNextCtDate`, `getNextRevision` (à ne pas modifier), `formatDuration` ; y ajouter un helper d'affichage pur.
- `src/lib/fleetTracking/controls.ts:174` -- modèle de la règle « vraie date de révision » (`revisionYearInterval !== null` et base existante).
- `src/app/api/trips/schema.ts` -- `checkOutSchema` (parcours fiche) ; `src/app/api/trips/route.ts:187` INSERT Trip.
- `src/app/api/qr/[token]/checkout/route.ts:23,149` -- schéma et INSERT du parcours QR.
- `src/app/api/trips/[id]/checkout/route.ts:16,138,200` -- modification de la prise (schéma, UPDATE, réponse).
- `src/app/api/vehicles/[id]/route.ts:71,160` -- lecture des trajets (`SELECT t.*`) et mapping → ajouter `missionLeadName` ; y joindre le seuil de l'UL du véhicule.
- `src/app/api/qr/[token]/vehicle/route.ts:35` -- lecture QR (véhicule + trajet ouvert) → ajouter `missionLeadName` et le seuil de l'UL.
- `src/app/vehicles/[id]/types.ts`, `src/app/qr/[token]/types.ts` -- types `Trip` / `Vehicle`.
- `src/components/vehicle/modals/CheckOutModal.tsx:330-342`, `src/app/qr/[token]/CheckOutForm.tsx`, `src/components/vehicle/modals/EditCheckOutModal.tsx:186` -- formulaires (le texte « 25 % » est en `CheckOutModal.tsx:341`).
- `src/components/vehicle/modals/CheckInModal.tsx:383`, `src/app/qr/[token]/CheckInForm.tsx:201` -- champ carburant au retour.
- `src/components/vehicle/TripItem.tsx:25` -- ligne de l'historique des sorties.
- `src/app/api/ul/route.ts:31` (GET) et `src/app/api/ul/[id]/route.ts` (PATCH, `updateUlSchema`) ; `src/components/admin/ULsTab.tsx` -- édition de l'UL.
- `scripts/add-inventory-ordered-at.ts` -- modèle du script de migration ; `scripts/setup-dev.ts:95,300` -- colonnes du schéma dev ; `src/__tests__/integration/setup.ts:88,140,495,537` -- schémas de test (Trip et UniteLocale, deux fois chacun).

## Tasks & Acceptance

**Execution:**
- [x] `src/app/globals.css` -- définir `.modal-content` (fond, bordure, rayon, padding, `width:100%`, `max-height:90vh`, `overflow-y:auto`, `overscroll-behavior:contain`) -- corrige les 5 fenêtres d'un coup.
- [x] `src/lib/maintenanceUtils.ts` -- `getRevisionDisplay(vehicle, records)` → `{ nextDate: Date | null; remainingKm: number | null }` (date seulement si intervalle années + base ; km seulement si intervalle km + révision avec km connu) ; `fuelThresholdLabel(percent)` → « 50 % (1/2) ».
- [x] `src/components/vehicle/MaintenanceCard.tsx` -- valeur = échéance la plus proche, nommée (« CT dans 9 mois ») ; deux lignes « Contrôle technique : … » et « Révision : … [· N km] » ; couleur selon l'échéance la plus proche.
- [x] `scripts/add-mission-lead-and-fuel-threshold.ts` -- ajoute `Trip.missionLeadName TEXT` et `UniteLocale.minFuelReturnPercent INTEGER` ; mêmes ajouts dans `scripts/setup-dev.ts` et `src/__tests__/integration/setup.ts`.
- [x] Routes trips / QR checkout / edit checkout / vehicles[id] / qr vehicle -- lire, écrire et renvoyer `missionLeadName` (Zod `z.string().trim().max(120).optional()`) ; renvoyer `vehicle.minFuelReturnPercent` (seuil de l'UL du véhicule, défaut 25).
- [x] `src/app/api/ul/route.ts`, `src/app/api/ul/[id]/route.ts`, `src/components/admin/ULsTab.tsx` -- lecture, PATCH (`z.number().int().min(0).max(100).nullable().optional()`), champ « Seuil carburant au retour (%) ».
- [x] Formulaires de prise (fiche + QR), modification de la prise, retour (fiche + QR), `TripItem` -- champ, textes d'aide et affichage.
- [x] Tests -- unitaires (`getRevisionDisplay`, `fuelThresholdLabel`), intégration (trajet avec/sans responsable, 400 longueur ; PATCH UL seuil 400/200), composants (`TripItem`, `CheckOutModal`, `QRCheckOutForm`, `MaintenanceCard`, `ULsTab`).
- [x] `package.json`/lock 5.57.0, `CHANGELOG.md`, `CLAUDE.md` (ligne du script), `npm run mcp:catalog` si le catalogue change.

**Acceptance Criteria:**
- Given une fenêtre de réservation plus haute que l'écran, when on fait défiler à la molette, then c'est la fenêtre qui défile, la page derrière ne bouge pas et « Valider » est atteignable.
- Given un véhicule avec CT dans 9 mois et révision dans 18 jours, when on ouvre sa fiche, then la carte affiche « Révision dans 18 jours » en valeur et les deux échéances nommées.
- Given une sortie avec responsable « Paul D. », when on consulte l'historique des sorties, then la ligne affiche « Responsable : Paul D. ».

## Implementation Notes

- Implémenté par un sous-agent, puis relu sur le diff complet.
- `.modal-content` : les 5 fenêtres n'avaient ni fond ni marge interne ; aucune ne pose son propre padding, donc pas de double marge. `StockQRCodeModal` l'utilise aussi (6ᵉ fenêtre).
- Carte Entretien : helper `getRevisionDisplay` (sans toucher `getNextRevision`). Libellés retenus : « Révision : dans 18 jours ou 12 000 km », « dans 12 000 km » (km seul), « · dépassée de N km ».
- Seuil : texte d'aide ajouté aussi au retour (fiche + QR), comme le demande le tableau ; dans le parcours QR de prise, l'aide est placée sous les champs km/carburant.
- Tests ajoutés après relecture : km seul / km dépassés (`MaintenanceCard`), aide au retour (`CheckInModal`, `QRCheckInForm`).
- `report-pdf.test.ts` (2 tests) échoue dans ce worktree pour une raison d'environnement : `pdf.worker.mjs` introuvable, résolu dans le `node_modules` du dépôt parent ; sans lien avec ce changement.

## Spec Change Log

## Review Triage Log

Passe 1 (blind-hunter, edge-case-hunter, verification-gap).

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | edge | PATCH de la prise sans `missionLeadName` efface le responsable | medium | `trips/[id]/checkout/route.ts` : `data.missionLeadName \|\| null` écrit toujours ; un appel MCP sans la clé efface la valeur | patch |
| 2 | edge+blind | Révision dépassée en km ne pilote ni la valeur ni la couleur | medium | `nearest` ne considère que les dates (`MaintenanceCard.tsx`) | patch |
| 3 | edge+blind | Sous-ligne contradictoire (« dans 18 jours · dépassée », « En retard … ou 5 000 km ») | low | texte assemblé sans tenir compte de l'état ; correction directe | patch (même racine que 2) |
| 4 | blind+edge | Dates de test en UTC (`toISOString`) → décalage d'un jour entre minuit local et minuit UTC | low | `isoDaysFromNow` dans `MaintenanceCard.test.tsx` | patch |
| 5 | blind | `.modal-content` absent du bloc mobile (`.modal` y a son rayon et 95vh) | low | `globals.css` bloc `@media` ~l.1168 ; ajout d'un sélecteur | patch |
| 6 | vg | Corps POST de `CheckOutModal` jamais vérifié pour `missionLeadName` | gap | pré-vérifié | patch |
| 7 | vg+blind | Édition de la prise (route + modale) sans test du responsable | gap | pré-vérifié | patch |
| 8 | vg | `GET /api/vehicles/[id]` → `trips[].missionLeadName` non testé | gap | pré-vérifié | patch |
| 9 | vg | Test `ULsTab` ne vérifie pas le `null` annoncé | gap | pré-vérifié | patch |
| 10 | vg | Onglet Contrôles garde les km de révision inventés (`getNextRevision`) | low (pré-existant) | `controls.ts:184` ; AGENTS interdit de changer `getNextRevision` depuis le suivi | defer |
| 11 | vg | Couleur et casse « en retard » de la carte non testées | low | cosmétique ; couvert en partie par le patch 2 | defer |
| 12 | blind | Révision sans historique : date depuis la 1ʳᵉ immatriculation, parfois « en retard (N ans) » | false | comportement voulu par la spec (ligne « Révision sans historique ») ; aucune révision enregistrée = révision à faire | rejet |
| 13 | blind | Les 6 fenêtres changent d'aspect (fond, padding) | low | elles n'avaient ni fond ni padding ; aucune ne pose son padding ; contrôle visuel à faire | rejet |
| 14 | blind | Seuil 0 % accepté | low | choix explicite d'un admin ; texte cohérent | rejet |
| 15 | blind | Seuil non saisissable à la création d'UL | low | modifiable juste après ; création réservée au SUPER_ADMIN | rejet |
| 16 | blind+edge | Saisie décimale du seuil → 400 générique | low | `type=number step=1`, cas improbable ; correction = validation client en plus | rejet |
| 17 | blind | 401/403 non testés sur routes existantes modifiées | low | routes existantes déjà couvertes ailleurs (`ul-parking`, QR) | rejet |
| 18 | blind | AGENTS.md des routes non mis à jour | low | fichiers de contexte agent | defer |
| 19 | blind | Responsable absent de l'export CSV / calendrier / écrans QR | false | hors intention : la demande ne vise que la liste des sorties | rejet |
| 20 | blind | Aide électrique absente de 3 écrans | low | pré-existant, hors changement | rejet |
| 21 | blind | Pas d'alerte au retour sous le seuil | false | exclu par l'intention (« texte d'aide seulement ») | rejet |
| 22 | blind | Script de migration non transactionnel / table absente / URL non vérifiée | low | ALTER idempotents, relance sûre ; erreur brute lisible | rejet |
| 23 | blind | Rapport et spec en intent-to-add | low | rapport retiré de l'index ; spec = artefact BMAD | rejet |
| 24 | blind | Regex « 2.000 » vs espace insécable littéral | low | cosmétique de test | rejet |
| 25 | blind | Test d'intégration : `'${UL}'` interpolé dans le SQL | low | constante de test, sans entrée externe | rejet |
| 26 | edge | Dates « YYYY-MM-DD » lues en UTC dans `getRevisionDisplay` | low | même convention que `getNextRevision`/`getNextCtDate` ; fuseaux UTC+ (France) non affectés | rejet |
| 27 | edge | La page derrière défile si la molette est hors de la fenêtre | low | comportement de toutes les fenêtres ; l'AC vise la molette sur la fenêtre | rejet |
| 28 | edge | Format « · N km » de la Code Map vs « ou N km » | false | libellé consigné dans Implementation Notes | rejet |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 avertissement
- `npm run test` -- expected: tout passe
- `npx tsx scripts/add-mission-lead-and-fuel-threshold.ts --env .env.local` -- expected: dry-run lisible, aucune écriture

**Manual checks (if no CLI):**
- Dans le navigateur (dev), petite fenêtre : réservation récurrente ouverte, « Valider » atteignable à la molette.
