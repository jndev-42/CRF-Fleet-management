---
title: 'Photos obligatoires au retour du véhicule (même règle qu''à la prise)'
type: 'feature'
created: '2026-11-23'
status: 'done'
baseline_commit: '8661551c975e2a471b75ba44a43236e16b0fb052'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/src/__tests__/CLAUDE.md', '{project-root}/src/components/CLAUDE.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La v5.58.0 rend les photos obligatoires à la **prise** (réglage d'UL, fenêtre « Photos obligatoires », trace « Sans photo »). Au **retour**, les photos restent « (Optionnel) » ; l'utilisatrice veut la même règle.

**Approach:** Réutiliser le réglage existant `UniteLocale.checkoutPhotosRequired` pour la prise **et** le retour (décision de l'utilisateur : un seul réglage) ; reprendre `PhotosRequiredModal` dans `CheckInModal` ; tracer la dérogation dans une nouvelle colonne `Trip.photosSkippedIn` ; distinguer dans l'historique « 📷 Départ sans photo » et « 📷 Retour sans photo » (décision de l'utilisateur).

## Boundaries & Constraints

**Always:**
- UL sans obligation : retour strictement inchangé (« (Optionnel) », pas de fenêtre, rien envoyé).
- UL avec obligation, retour depuis la fiche : pas de « (Optionnel) », consigne « Au minimum 4 photos : avant, arrière, côté gauche et côté droit. » ; validation sans aucune photo → `PhotosRequiredModal` (« Prendre des photos » ne soumet rien et met le sélecteur en avant ; « Continuer sans photo » soumet avec `photosSkipped: true`). Échap dans la fenêtre ne ferme pas la modale de retour. Photos choisies mais envoi sans dossier obtenu → `photosSkipped: true` aussi.
- L'ordre existant de `CheckInModal` est respecté : la fenêtre photos s'ouvre avant toute écriture, comme la fenêtre d'anomalie kilométrique ; si les deux s'appliquent, une seule fenêtre à la fois, et la décision de l'une n'annule pas l'autre.
- `PATCH /api/trips/[id]/checkin` accepte `photosSkipped?: boolean` → `Trip.photosSkippedIn = 1` seulement si aucune photo n'est jointe au retour (pas de `driveFolderId` reçu) ; renvoyé en `trips[].photosSkippedIn` par `GET /api/vehicles/[id]`.
- Historique (`TripItem`) : `photosSkipped` → « 📷 Départ sans photo » (renomme l'actuel « 📷 Sans photo ») ; `photosSkippedIn` → « 📷 Retour sans photo ». Aucune mention d'« urgence », aucune notification.
- Réglage d'UL : libellé et aide de `ULsTab` mis à jour pour dire que l'obligation vaut à la prise et au retour depuis la fiche du véhicule (le parcours QR n'a pas de photos).
- Script de migration idempotent `scripts/add-trip-photos-skipped-in.ts` (dry-run, `--apply`, `--env`, test d'intégration comme `add-checkout-photos-and-dossier-tickets.test.ts`), listé dans `CLAUDE.md` « À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.59.0 » ; colonne ajoutée à `scripts/setup-dev.ts` et aux deux définitions de Trip de `src/__tests__/integration/setup.ts`. Version 5.59.0, CHANGELOG français orienté utilisateur.

**Never:** Pas de photos ajoutées au retour QR ; pas de nouveau réglage d'UL ; pas de vérification « 4 photos minimum » (fenêtre seulement sans aucune photo, comme à la prise).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| UL optionnelle | retour sans photo | aucune fenêtre, `photosSkippedIn = 0` | N/A |
| Obligatoire, continuer | retour sans photo → « Continuer sans photo » | retour enregistré, `photosSkippedIn = 1`, pastille « Retour sans photo » | N/A |
| Obligatoire, prendre | retour sans photo → « Prendre des photos » | aucune requête, sélecteur mis en avant | N/A |
| Obligatoire, avec photo | ≥ 1 photo | pas de fenêtre, `photosSkippedIn = 0` | N/A |
| Flag + photos | `photosSkipped: true` avec `driveFolderId` | `photosSkippedIn = 0` | N/A |
| Anomalie km + sans photo | km excessif, 0 photo, UL obligatoire | les deux fenêtres l'une après l'autre, puis un seul envoi avec `confirmMileageAnomaly` et `photosSkipped` | N/A |

</frozen-after-approval>

## Code Map

- `src/components/vehicle/modals/CheckInModal.tsx` -- `handleSubmit` (~l.175-199 : validations puis fenêtre d'anomalie km `setMileageConfirm`, puis `doSubmit(false)`), `doSubmit(confirmed)` (~l.201 : upload `uploadMediaSafely` stage `rendu` dans le dossier de la sortie, `uploadedFolderIdRef`, PATCH checkin), `PhotoPicker` « 📸 Photos après le retour (Optionnel) » (~l.585), `useEscapeKey`.
- `src/components/vehicle/modals/CheckOutModal.tsx` + `PhotosRequiredModal.tsx` -- modèle à reproduire (v5.58.0) : `photosRequired`, `showPhotosRequired`, `highlightPhotos`, `photosRef`, `useEscapeKey(onClose, !showPhotosRequired)`, `photosSkipped` si pas de dossier obtenu.
- `src/app/api/trips/[id]/checkin/route.ts` -- schéma Zod, UPDATE Trip (~l.208), `driveFolderId` (~l.79-92 : le dossier de la prise est réutilisé ; décider « photo jointe au retour » sur `data.driveFolderId` reçu).
- `src/app/api/vehicles/[id]/route.ts:183` -- `photosSkipped` des trajets ; `vehicle.checkoutPhotosRequired` déjà exposé.
- `src/components/vehicle/TripItem.tsx:34` -- pastille actuelle ; `src/app/vehicles/[id]/types.ts`.
- `src/components/admin/ULsTab.tsx:487` -- libellé/aide du réglage.
- `scripts/add-checkout-photos-and-dossier-tickets.ts` + `src/__tests__/integration/add-checkout-photos-and-dossier-tickets.test.ts` -- modèles du script et de son test.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/add-trip-photos-skipped-in.ts` + test, `setup-dev.ts`, `integration/setup.ts` -- colonne `Trip.photosSkippedIn INTEGER`.
- [x] `src/app/api/trips/[id]/checkin/route.ts`, `src/app/api/vehicles/[id]/route.ts`, `types.ts` -- accepter, écrire, renvoyer.
- [x] `CheckInModal.tsx` -- obligation, fenêtre, enchaînement avec l'anomalie km, Échap.
- [x] `TripItem.tsx`, `ULsTab.tsx` -- pastilles et libellés.
- [x] Tests -- intégration (checkin `photosSkippedIn` avec/sans dossier, GET renvoie), composants (CheckInModal : chaque ligne de la matrice + Échap ; TripItem : deux pastilles ; ULsTab : libellé).
- [x] `CHANGELOG.md`, `package.json`/lock 5.59.0, `CLAUDE.md`.

**Acceptance Criteria:**
- Given une UL à photos obligatoires et une sortie partie sans photo puis rendue sans photo, when on ouvre l'historique, then la ligne porte « 📷 Départ sans photo » et « 📷 Retour sans photo ».

## Implementation Notes

- Implémenté par un sous-agent (v5.59.0), diff relu.
- `CheckInModal` : fenêtre photos d'abord, puis fenêtre d'anomalie km ; décision « Continuer sans photo » gardée dans une ref jusqu'à l'envoi unique.
- `integration/setup.ts` ne contient qu'un `CREATE TABLE "Trip"` (l'autre occurrence est un INSERT) : colonne ajoutée à celui-là.

## Spec Change Log

## Review Triage Log

Passe 1 (blind-hunter, edge-case-hunter, verification-gap — ce dernier sans manque).

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | blind+edge | La fenêtre réutilisée au retour dit « photos avant le départ » | medium | `PhotosRequiredModal` non modifié, texte figé côté prise | patch |
| 2 | blind | Confirmation km renvoyée par le serveur (`MILEAGE_CONFIRM_REQUIRED`) non testée avec la dérogation | low (gap) | seul le chemin client « excessive » est testé ; ajout d'un test | patch |
| 3 | blind | `CLAUDE.md` annonce un 500 sur la fiche véhicule sans la colonne | low | `GET /api/vehicles/[id]` lit `t.*` et retombe à `false` | defer (fichier de contexte agent) |
| 4 | blind+edge | Le serveur ne vérifie pas le réglage de l'UL avant d'écrire `photosSkippedIn` | low | seul notre client l'envoie, et seulement si l'UL l'exige ; même choix qu'à la prise (v5.58.0) | rejet |
| 5 | blind | Branche « Corriger » de la fenêtre km non testée | low | la ref est remise à `false` par `handleSubmit` à chaque nouvel envoi | rejet |
| 6 | blind | « Prendre des photos » ne déplace pas le focus ; contour non réinitialisé | low | cosmétique, identique à la prise | rejet |
| 7 | blind | L'aide « obligatoire » perd la mention de la destination des photos | low | identique à la prise (v5.58.0) ; mention « Google Drive » déjà obsolète (R2) | rejet |
| 8 | blind | `package-lock.json` absent du diff revu | false | le patch excluait ce fichier ; `package-lock.json` est bien en 5.59.0 (deux occurrences) | rejet |
| 9 | edge | Entrée pendant la fenêtre km → fenêtre photos empilée | low | focus dans la fenêtre km ; correctif = garde supplémentaire | rejet |
| 10 | edge | Double envoi pendant l'upload | false | bouton d'envoi `disabled={submitting…}` : la soumission implicite par Entrée est bloquée | rejet |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 avertissement
- `npx tsc --noEmit` -- expected: aucune erreur
- `npm run test` -- expected: tout passe
