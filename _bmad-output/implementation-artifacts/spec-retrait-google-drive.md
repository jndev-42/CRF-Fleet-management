---
title: 'Retrait de Google Drive (lecture, repli, migration, dépendance)'
type: 'refactor'
created: '2026-11-09'
status: 'done'
baseline_commit: 'acb3d180d874e81bc3799d767243b30c3142957c'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Depuis la v5.48.0, tous les fichiers sont sur R2 et la migration est faite en prod : plus aucune ligne de la base de prod ne référence Drive (vérifié le 2026-11-09), et les dossiers Drive ont été supprimés. Le code garde pourtant l'accès Drive en lecture seule, les replis Drive, le script de migration et la dépendance `googleapis`.

**Approach:** Supprimer tout le code et la configuration propres à Google Drive. Une référence qui n'est pas une référence R2 (sans `/`, ex. id Drive résiduel en preview) est traitée comme « aucun fichier », jamais comme une erreur.

## Boundaries & Constraints

**Always:**
- Les colonnes `Trip.driveFolderId`, `IncidentReport.driveFolderId`, `mission_reports.drive_folder_id`, `mission_reports.signed_report_drive_id`, `ExpenseReport.driveFolderId` restent (pas de migration de schéma) ; leurs valeurs R2 continuent de fonctionner à l'identique.
- Référence non R2 (id Drive résiduel, `mock-…`) : pas de photo affichée, pas d'appel réseau, pas d'erreur ; à la suppression d'un enregistrement, rien à supprimer ; à l'envoi (rendu d'un trajet), un nouveau dossier R2 est créé et remplace la référence au check-in.
- Autorisation R2 inchangée (`resolveFolderOwner`, `canAccessFolder`, `canAccessMediaKey`), seuls les alias et chemins Drive disparaissent.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` restent : ils servent à la connexion Google (NextAuth).

**Never:**
- Ne pas toucher à la connexion Google, au Web Push (`fcm.googleapis.com` n'est pas Drive), ni aux routes `/api/media/*`.
- Pas de nouvelle fonctionnalité.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Trajet R2 | `driveFolderId = trip-photos/…` | photos affichées comme avant | N/A |
| Id Drive résiduel | `driveFolderId = 1AbC…` (sans `/`) | aucune photo, aucun appel | N/A |
| Rendu d'un trajet à id Drive | upload `tripId` | nouveau préfixe R2, rattaché au check-in | N/A |
| Suppression avec id Drive | trajet / véhicule / incident / mission | enregistrement supprimé, aucun appel Drive | N/A |
| Ancienne route | `GET /api/drive/photos/…` | 404 (route supprimée) | N/A |

</frozen-after-approval>

## Code Map

- Supprimer : `src/lib/drive.ts`, `src/app/api/drive/**` (routes + AGENTS.md), `src/lib/media/drive-source.ts`, `src/lib/media/drive-migration.ts`, `src/lib/media/drive-migration-cli.ts`, `scripts/migrate-drive-images-to-r2.ts`, et leurs tests (`unit/drive.test.ts`, `integration/drive-photos.test.ts`, `unit/media-drive-migration*.test.ts`).
- `src/lib/driveAuth.ts` → `src/lib/media/access.ts` (renommage) : garder `resolveFolderOwner`, `canAccessFolder`, `canAccessMediaKey` (+ `canAccessSignedReport` pour l'ex-`canAccessDriveFile`) ; retirer les alias Drive. Mettre à jour les importeurs (`grep driveAuth`) et `integration/driveAuth.test.ts` (renommé `media-access.test.ts`).
- `src/lib/media/server.ts` -- `deleteMediaFolder` : branche Drive retirée (référence non R2 → `true`, rien à faire).
- `src/app/api/media/upload/route.ts` -- retirer `copyFromDrive` / `copyDriveTripFolder` et le 502 associé ; un id Drive en `existingFolderId` ou sur le trajet est ignoré (nouveau préfixe).
- `src/lib/imageCompression.ts` -- `mediaFileUrl` / `mediaListUrl` : plus de branche `/api/drive/…` ; référence non R2 → `null` ; appelants (`PhotoViewer.tsx`, `MissionPhotosModal.tsx`, `MissionPhotosSection.tsx`, `SignedReportLightbox.tsx`, `missions/[id]/page.tsx`) n'affichent rien si `null`.
- `src/app/api/incidents/[id]/pdf/route.ts` -- repli Drive retiré.
- Notes de frais : `src/app/expenses/page.tsx:76-80` (fetch Drive), `ExpenseDetailSidebar.tsx:273`, `ExpensePhotosPanel.tsx`, `JustificatifsModal.tsx` -- supprimer le panneau des anciens justificatifs Drive (aucune donnée en prod).
- `package.json` / `package-lock.json` -- retirer `googleapis` (seuls `src/lib/drive.ts` et `api/drive/photos` l'importent).
- Tests : retirer les `vi.mock('@/lib/drive')` devenus inutiles (liste via `grep -rl "@/lib/drive'" src/__tests__`) ; adapter `media-server`, `media-routes`, `media-binding`, `imageCompression`, composants.
- Docs : `CLAUDE.md` (ligne du script de migration Drive, mention Drive), `src/lib/CLAUDE.md` (section `drive.ts`), AGENTS.md cités par `grep -rl "Drive" src --include=AGENTS.md`, `src/lib/demo/readOnly.ts` si une entrée Drive reste ; `npm run mcp:catalog`.
- `CHANGELOG.md` (5.50.0, orienté utilisateur), `package.json` → 5.50.0.

## Tasks & Acceptance

**Execution:**
- [x] Suppressions de fichiers + renommage `driveAuth` → `media/access`.
- [x] `media/server.ts`, `media/upload`, `imageCompression.ts` + appelants, PDF d'incident, notes de frais.
- [x] `googleapis` retiré ; `npm run mcp:catalog`.
- [x] Tests adaptés + matrice (id Drive résiduel : aucun appel, aucune photo ; suppression ; rendu).
- [x] Docs, CHANGELOG, version.

**Acceptance Criteria:**
- Given le dépôt, when on cherche `googleapis`, `getDriveClient`, `/api/drive/`, `driveAuth`, then seules des occurrences hors Drive subsistent (`fcm.googleapis.com`, scopes OAuth de connexion).

## Verification

**Commands:**
- `npm run lint` -- 0 erreur, 0 avertissement
- `npm run test` -- vert
- `npm run build` -- succès

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|--------|---------|---------|----------------|
| 1 | vgap | `TripItem` : condition `isR2Ref` non testée | medium (gap) | → patch test |
| 2 | vgap | Page mission : conditions `isR2Ref` non testées ; assertion `/api/drive` devenue vide | medium (gap) | → patch test |
| 3 | blind+vgap | Justificatifs de notes de frais perdus | false | prod : 0 `ExpenseReport.driveFolderId` restant (vérifié 2026-11-09), l'utilisateur confirme qu'aucun justificatif n'était sur Drive → rejeté ; libellé CHANGELOG inexact → patch |
| 4 | blind | Pas de garde avant déploiement (références Drive restantes) | false | prod : 0 référence Drive sur les 5 colonnes (vérifié) → rejeté |
| 5 | blind | Rendu d'un trajet à id Drive : lien vers les photos d'emprunt perdu | false | voulu (Always de la spec) ; seule la preview en a → rejeté |
| 6 | blind | Écritures acceptent encore un id non R2 | low | rejet pourrait bloquer un check-in preview ; aucune donnée prod → rejeté |
| 7 | blind | `access.ts` non suivi par git | low | fichier nouveau, ajouté au commit → patch (commit) |
| 8 | blind+edge | Branche « note de frais » morte dans `access.ts`, fixtures façon Drive | low | → patch |
| 9 | blind | Seeds `mock-…` sans photo | low | dev/preview uniquement → rejeté |
| 10 | blind+edge | Commentaires `readOnly.ts` / `proxy.ts`, AGENTS racine (`react-onesignal`) | low | → patch doc |
| 11 | blind+edge | Code mort : `MissionPhotosSection`, `isPdfItem` | low | → patch (suppression) |
| 12 | blind | Tests plus faibles (sans `existingFolderId`, `deleteMediaKey`) | low | → rejeté |
| 13 | blind | Lignes vides doubles, `?? undefined` redondant | low | → patch |
