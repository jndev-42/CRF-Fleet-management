---
title: 'Images et rapports signés sur R2, rangés par type, UL et dossier lisible (fin de Google Drive)'
type: 'feature'
created: '2026-11-08'
status: 'done'
baseline_commit: 'd99227bad122d89263841a2be5406db94c4ee3b1'
route: 'dispatch'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les photos (emprunt/rendu, incidents, communication de mission) et le rapport de mission signé partent sur Google Drive dans des dossiers `{véhicule|mission}-{date}` toutes UL mélangées ; la base ne garde que des ids Drive.

**Approach:** Tout nouveau fichier est écrit sur R2 sous `{type}/{slug UL}/{dossier lisible}/…` ; un script copie les fichiers Drive existants vers R2, réécrit les références en base et met les originaux Drive à la corbeille avec `--delete-old`.

**Décisions utilisateur :**
- Découpage : le rangement par UL des objets R2 existants hors UL est reporté (deferred-work).
- Le rapport de mission signé (PDF) est migré aussi.
- Arborescence (3ᵉ niveau lisible après le slug) :
  - `trip-photos/{slug}/{véhicule}-{horodatage}/emprunt|rendu/…`
  - `incident-photos/{slug}/{véhicule}-{horodatage}/…`
  - `mission-com-photos/{slug}/{mission}-{horodatage}/…`
  - `mission-report-photo/{slug}/{mission}-{horodatage}/{fichier}.pdf`
- Originaux Drive : `--delete-old` (avec `--apply`) les met à la corbeille après UPDATE réussi.
- Notes de frais : la copie publiée passe de `ndf/{slug}/{reportId}.pdf` à `ndf/{slug}/{demandeur}-{horodatage}/note-de-frais.pdf` (horodatage = `createdAt` de la note, stable entre signatures ; demandeur = nom du créateur de la note). Les copies publiées existantes sont déplacées par le script de rangement NDF existant. Justificatifs hors périmètre : ni sous-dossier `justificatifs/`, ni migration des anciens justificatifs Drive (`ExpenseReport.driveFolderId` reste sur Drive, lu via le proxy).

**Décisions utilisateur (revue 1) — priment sur toute règle contraire ci-dessous :**
- Trajet emprunté avant bascule (id Drive) puis rendu avec photos : au premier envoi de rendu, le serveur copie les photos d'emprunt du dossier Drive dans le nouveau préfixe R2 (`…/emprunt/`), puis le check-in REMPLACE l'id Drive par le préfixe R2 (le dossier Drive n'est pas mis à la corbeille ici ; la migration le traitera ou l'ignorera puisqu'il n'est plus référencé). Échec de la copie → l'envoi échoue (rien n'est rattaché, l'utilisateur réessaie).
- Droits d'envoi : photos de trajet → gestionnaire de l'UL du véhicule, ou conducteur / second conducteur du trajet visé (`tripId`, quelle que soit l'UL) ; à l'emprunt (pas encore de trajet), tout utilisateur pouvant emprunter le véhicule (même règle que `POST /api/trips`) ; photos d'incident → tout utilisateur connecté non INACTIF (même règle que `POST /api/incidents`) ; mission → `ulId` accepté seulement si l'utilisateur en est membre (`UserUL`) ou SUPER_ADMIN, sinon repli sur son UL de rattachement (corrige les missions DT dont la session est `default`).
- Copie NDF publiée : `ndf/{slug}/{demandeur}-{horodatage}-{4 premiers car. alphanumériques de l'id de la note}/note-de-frais.pdf`.
- Fichiers orphelins : la suppression d'un incident, d'un compte rendu de mission (et du véhicule, pour ses incidents) supprime aussi ses fichiers (R2 : préfixe/clé ; id Drive : dossier Drive, comme pour les trajets), en best-effort, uniquement si aucun autre enregistrement ne référence la même valeur.
- Liaison référence ↔ enregistrement : une référence R2 écrite en base (trajet, check-in, incident, mission) n'est acceptée que si son segment UL est celui de l'enregistrement ET qu'aucun AUTRE enregistrement ne la référence déjà (sinon 400). `deletePrefix` n'accepte qu'un préfixe de dossier complet (`parseMediaFolderRef`).
- Migration : `--delete-old` ne met à la corbeille un dossier Drive que si TOUS ses fichiers ont été copiés ; un id Drive référencé par plusieurs types est traité en un seul groupe ; journal persistant JSON (`table, rowId, ancien id, nouvelle référence, corbeille`) écrit à chaque `--apply` ; noms (suffixe, uuid8) dérivés de façon déterministe de l'id Drive (dry-run = apply) ; lignes sans UL et dossiers partagés entre UL différentes → signalés et sautés, jamais fusionnés.
- Rangement NDF : supprime avec `--delete-old` toute copie publiée de la note sous `ndf/{slug}/` qui n'est pas la courante (ancien nom de demandeur compris), repérée par le suffixe d'id ; la suppression d'une note fait de même.
- AGENTS.md périmés (missions, incidents, drive) mis à jour.
- (validé le 2026-11-09) Liaison mission : le segment de l'UL de rattachement de l'auteur est aussi accepté (cohérent avec le repli de l'envoi).
- (validé le 2026-11-09) Rendu d'un trajet Drive dont le dossier Drive est introuvable : rien à reprendre, l'envoi continue (pas de 502) ; 502 seulement si la copie d'un fichier existant échoue.

## Boundaries & Constraints

**Always:**
- Segment UL = `expenseUlSegment(slug, ulId)` existant. Segment lisible = nom assaini (accents retirés, minuscules, `[a-z0-9-]`, 60 car. max, repli `sans-nom`) + `-{AAAAMMJJ-HHmmss}` (Europe/Paris) + `-{4 hex aléatoires}` contre les collisions. Nom de fichier = `{uuid8}-{nom assaini}`.
- Pas de changement de schéma : `Trip.driveFolderId`, `IncidentReport.driveFolderId`, `mission_reports.drive_folder_id` contiennent un préfixe R2 (sans `/` final) ; `mission_reports.signed_report_drive_id` une clé complète. Une référence R2 contient `/`, un id Drive jamais.
- UL résolue CÔTÉ SERVEUR : `Vehicle.ulId` (via `vehicleId`) pour trajet/incident ; pour une mission, `ulId` envoyé s'il existe en base, sinon l'UL de la session. Le client n'envoie jamais de clé ni de préfixe à créer.
- Autorisation inchangée : qui lit le trajet/l'incident/la note/le compte rendu voit ses fichiers (règles de `driveAuth.ts`, appariement de la colonne sur les 3 premiers segments de la clé, ou sur la clé exacte pour le rapport signé). Clé validée : pas de `..`, type connu.
- Transition : une référence encore Drive est lue via l'ancien proxy (lecture seule) ; l'appli marche avant et après la migration.
- Migration : dry-run par défaut, `--apply`, `--delete-old`, `--env <fichier>` ; bilan ; code ≠ 0 si un échec ; UPDATE gardé `WHERE col = <id Drive>` ; idempotente ; un dossier Drive partagé par plusieurs comptes rendus → un seul préfixe ; horodatage = `createdTime` du dossier Drive.
- Démo : écritures R2 sous `demo/` (déjà assuré par `r2.ts`) ; la route d'envoi n'est plus bloquée en démo.
- NDF : le dossier publié est recalculé à chaque scellement depuis `createdAt` + nom du demandeur (assainis comme le segment lisible, sans suffixe aléatoire) ; écriture post-commit best-effort inchangée. Rangement : écrit la nouvelle copie depuis la révision courante, puis, avec `--delete-old`, supprime `ndf/{slug}/{reportId}.pdf` et toute copie publiée périmée de la note. La suppression d'une note supprime sa copie publiée à la nouvelle clé (et à l'ancienne, best-effort).

**Never:**
- Ne pas toucher `referentiels/`, `ndf-revisions/`, `vehicle-*`, `expenses-staging/`, `demo/` ; sous `ndf/`, seules les copies publiées changent de clé.
- Pas de déplacement automatique quand le demandeur ou le slug est renommé (le script de rangement regroupe au passage suivant).
- Pas de renommage de colonnes, pas de nouvelle dépendance, pas de déplacement au renommage d'un slug ou d'un véhicule.
- Jamais de corbeille Drive avant un UPDATE réussi.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Emprunt | VSAV 1, UL `paris-18` | `trip-photos/paris-18/vsav-1-20261108-143000-a1b2` en base, photos sous `…/emprunt/` | N/A |
| Rendu | trajet avec préfixe | photos sous `{préfixe}/rendu/`, colonne inchangée | 403 si préfixe inaccessible |
| Mission | photos + rapport signé | deux préfixes `mission-com-photos/…` et `mission-report-photo/…` | N/A |
| Référence Drive | colonne sans `/` | affichage via proxy Drive | N/A |
| Clé forgée | `../x`, type inconnu | 400 | N/A |
| Suppression trajet/véhicule | préfixe R2 | objets du préfixe supprimés | échec journalisé, suppression maintenue |
| Migration trajet | dossier `emprunt/`+`rendu/` | copiés, colonne repointée, Drive à la corbeille si `--delete-old` | fichier illisible → ligne sautée, listée, Drive intact |
| Id `mock-…` | preview | ignoré, signalé | N/A |
| Scellement NDF | Jean Dupont, note créée le 08/11/2026 14:30:00, UL `paris-18` | `ndf/paris-18/jean-dupont-20261108-143000/note-de-frais.pdf`, même clé à l'étape suivante | échec journalisé, transition validée |
| Rangement NDF | copie `ndf/paris-18/{id}.pdf` | nouvelle copie écrite ; ancienne supprimée si `--delete-old` | source absente → note sautée, listée |
| Rendu d'un trajet Drive | `driveFolderId` = id Drive, 2 photos de rendu | photos d'emprunt Drive copiées sous `{préfixe}/emprunt/`, rendu sous `{préfixe}/rendu/`, colonne = préfixe R2 | copie Drive en échec → 502, rien rattaché |
| Rendu inter-UL | conducteur d'une autre UL, `tripId` | 200 | autre utilisateur hors UL → 403 |
| Incident QR hors UL | utilisateur connecté d'une autre UL | 200 | INACTIF → 403 |
| Mission UL étrangère | `ulId` d'une UL dont l'utilisateur n'est pas membre | rangé sous son UL de rattachement | N/A |
| Référence d'autrui | `driveFolderId` déjà référencé par un autre trajet, ou d'une autre UL | 400 | N/A |
| Suppression préfixe large | `trip-photos/paris-18` | refusé, rien supprimé | erreur journalisée |
| Suppression incident / mission | préfixe R2 ou id Drive non partagé | fichiers supprimés | échec journalisé, suppression maintenue |
| Corbeille partielle | dossier Drive avec fichier ignoré | colonne repointée, dossier Drive conservé, signalé | N/A |
| NDF homonymes | deux « Jean Dupont » même seconde | deux dossiers distincts (suffixe d'id) | N/A |
| Demandeur renommé | copie sous l'ancien nom | supprimée au rangement `--delete-old` et à la suppression de la note | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/r2.ts` -- ajouter `listObjects(prefix)` (pagination de `listKeys`, repli démo) et `deletePrefix(prefix)` (démo : seul `demo/`).
- `src/lib/media/refs.ts` (nouveau, pur) -- types de média, `isR2Ref`, `readableSegment(nom, date, rand)`, `buildMediaFolderRef`, `buildMediaFileKey`, `folderRefOfKey`, `validateMediaKey`.
- `src/lib/driveAuth.ts` -- `resolveFolderOwner` accepte une référence R2 (même SQL, même règles) ; fonctions Drive conservées.
- `src/app/api/drive/upload/route.ts` → `src/app/api/media/upload/route.ts` (même validation 4,2 Mo / images / PDF optionnel ; champs `type`, `vehicleId` | `ulId`, `name`, `existingFolderId`, `stage`) ; réponse `folderId`, `subfolderId`, `fileIds` (= clés). Supprimer l'ancienne.
- `src/app/api/media/photos/route.ts`, `src/app/api/media/file/route.ts` (nouveaux) -- liste (formes `{emprunt, rendu}` / `{photos}` actuelles) et stream R2 (`?key=`, Content-Type par extension, `Cache-Control: private`).
- `src/app/api/drive/photos/**` -- conservées, lecture seule.
- `src/lib/imageCompression.ts:134` -- `uploadFilesToDriveSafely` → `uploadMediaSafely` ; `mediaFileUrl(ref, id)` choisit `/api/media/file` ou `/api/drive/photos/{id}`, `mediaListUrl(ref)` idem.
- Envoi : `CheckOutModal.tsx:159`, `CheckInModal.tsx:220`, `IncidentReportModal.tsx:194`, `MissionWizard.tsx:388,407` (retirer `MISSION_COMM_FOLDER_ID`/`SIGNED_REPORTS_FOLDER_ID`).
- Affichage : `PhotoViewer.tsx`, `MissionPhotosModal.tsx`, `MissionPhotosSection.tsx`, `SignedReportLightbox.tsx`, `missions/[id]/page.tsx:341`. Inchangés (justificatifs Drive) : `expenses/page.tsx:80`, `ExpensePhotosPanel.tsx`, `JustificatifsModal.tsx`.
- `src/app/api/incidents/[id]/pdf/route.ts:56` -- images du préfixe R2, repli Drive.
- `trips/[id]/route.ts:44`, `vehicles/[id]/trips/route.ts:46`, `vehicles/[id]/route.ts:394` -- `deletePrefix` si référence R2, sinon `deleteDriveFolder`.
- `src/lib/demo/readOnly.ts:40`, `src/lib/demo/fetchInterceptor.ts` -- retirer `drive/upload`.
- NDF : `src/lib/r2.ts:110` `buildExpensePublishedKey(ulSegment, folderName)` → `ndf/{seg}/{folderName}/note-de-frais.pdf` + `expensePublishedFolder(requesterName, createdAt)` ; `src/lib/expenses/sealing.ts:125` `loadReport` lit `createdAt` et le nom du créateur (`JOIN User`), 4 appels l.244/310/456/496 ; `src/app/api/expenses/[id]/route.ts:742` ; `scripts/backfill-signed-pdfs.ts:239` ; `src/lib/expenses/r2-relocation.ts:153,180` (périmées = ancienne forme `{id}.pdf` + autres dossiers) ; `scripts/move-expense-pdfs-to-ul-folders.ts` (SELECT nom + `createdAt`). Tests : `r2.test.ts`, `expense-r2-relocation.test.ts`, `expenses.test.ts`, `expense-sealing-chain.test.ts`.
- `scripts/migrate-drive-images-to-r2.ts` (nouveau) -- CLI sur le modèle de `scripts/move-expense-pdfs-to-ul-folders.ts` ; logique dans `src/lib/media/drive-migration.ts` (Drive, R2, SQL injectés).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/r2.ts`, `src/lib/media/refs.ts`, `src/lib/driveAuth.ts` -- clés, liste, suppression, autorisation.
- [x] Routes `api/media/{upload,photos,file}` + tests intégration (401, 403, 400, nominal) ; suppression de `api/drive/upload` et de ses tests.
- [x] Client : helpers, 4 appelants, 8 composants d'affichage ; tests composants mis à jour.
- [x] PDF d'incident, suppressions, démo.
- [x] `src/lib/media/drive-migration.ts` + `scripts/migrate-drive-images-to-r2.ts` ; tests unitaires de la matrice.
- [x] NDF : clé publiée par dossier demandeur-horodatage, scellement, suppression, backfill, rangement + tests.
- [x] `npm run mcp:catalog` ; `CLAUDE.md` (Commands : script à lancer APRÈS déploiement) ; `CHANGELOG.md` ; `package.json`/`package-lock.json` → 5.48.0.

**Revue 1 (corriger le code existant, ne pas le réécrire) :**
- [x] `src/app/api/media/upload/route.ts` -- champ `tripId` ; règles d'envoi des décisions revue 1 (trajet / incident / mission) ; copie des photos d'emprunt Drive quand `existingFolderId` est un id Drive (logique de copie réutilisée de `src/lib/media/drive-migration.ts`) ; extension du fichier repliée sur `extensionOfMimeType(file.type)`.
- [x] `src/app/api/trips/[id]/checkin/route.ts:204` -- remplacer un id Drive par le préfixe R2 reçu (garder un préfixe R2 déjà en place).
- [x] `src/lib/media/server.ts` (nouveau helper `assertRefBindable(ref, {table, rowId, ulId})`) appelé par `POST /api/trips`, check-in, `POST`/`PATCH /api/incidents`, `create-mission-report.ts` -- 400 si UL différente ou référence d'un autre enregistrement.
- [x] `src/lib/r2.ts` `deletePrefix` / `deleteMediaFolder` -- exiger `parseMediaFolderRef` ; `deleteMediaKey` pour le rapport signé.
- [x] Suppressions : `DELETE /api/incidents/[id]`, `DELETE /api/missions/[id]`, suppression de véhicule (incidents) -- fichiers supprimés si non partagés.
- [x] `src/lib/media/drive-migration.ts` + script -- corbeille seulement si tout copié ; regroupement par id Drive tous types ; journal JSON (`scripts/out/drive-migration-<horodatage>.json`, ignoré par git) ; noms déterministes (hash de l'id Drive) ; sans UL / multi-UL signalés et sautés.
- [x] NDF : `expensePublishedFolder(name, createdAt, reportId)` ; nettoyage des copies périmées par suffixe d'id (`r2-relocation.ts`, `expenses/[id]/route.ts`).
- [x] `src/lib/media/refs.ts` -- `ulSegmentOf` : retirer les caractères initiaux non `[A-Za-z0-9_]`.
- [x] `src/lib/imageCompression.ts` -- `mediaFileUrl(id)` sans paramètre `ref`.
- [x] Tests : PDF d'incident R2 ; routes de suppression (trajet, véhicule, incident, mission) ; arguments d'envoi (CheckOut, MissionWizard, IncidentReportModal) ; `PhotoViewer` R2 ; 400 sur référence forgée/d'autrui (trajets, incidents, missions) ; règles d'envoi inter-UL ; rendu d'un trajet Drive ; matrice migration revue 1 ; NDF homonymes et renommage.
- [x] Tests du câblage CLI de `scripts/migrate-drive-images-to-r2.ts` (demande utilisateur) : extraire la lecture des lignes (SQL, alias, repli d'UL des missions via `UserUL`), l'adaptateur Drive et le calcul du code de sortie dans des fonctions exportées/injectables, et les tester sur une base SQLite en mémoire (`@libsql/client` `file::memory:`) avec un Drive et un R2 factices : UL résolue = slug attendu (slug ≠ id), mission DT → UL de rattachement, code de sortie 1 si un échec, dry-run sans écriture.
- [x] AGENTS.md : `src/components/missions/`, `src/app/api/incidents/`, `src/app/api/incidents/[id]/pdf/`, `src/app/api/drive/`.

**Acceptance Criteria:**
- Given un emprunt après déploiement, when on liste `trip-photos/{slug}/`, then un dossier `{véhicule}-{horodatage}-{xxxx}/emprunt/` contient les photos, visibles dans l'historique du véhicule.
- Given la migration appliquée, when on ouvre un ancien trajet, incident, note ou compte rendu, then ses fichiers s'affichent depuis R2 et plus aucune colonne trajet/incident/mission ne contient d'id Drive (hors échecs listés).
- Given le rangement NDF appliqué avec `--delete-old`, when on liste `ndf/{slug}/`, then chaque note scellée y figure une seule fois sous `{demandeur}-{horodatage}/note-de-frais.pdf`.
- Given le dry-run, when il termine, then rien n'est écrit et le plan liste chaque ligne et sa future référence.

## Verification

**Commands:**
- `npm run lint` -- 0 erreur, 0 avertissement
- `npm run test` -- vert
- `npx tsx scripts/migrate-drive-images-to-r2.ts` -- dry-run lisible, aucune écriture

## Implementation Notes

**Pause revue 1 (2026-11-08)**
- Faites (cochées), vérifiées par `npm run lint` (0/0), `tsc --noEmit` (0) et `npm run test` (344 fichiers, 4748 tests verts) avant l'ajout de la tâche CLI : les 11 premières tâches Revue 1 — envoi (`tripId`, droits, copie Drive au rendu via `collectDriveSources`/`copyDriveSources` + `src/lib/media/drive-source.ts`, `fileNameWithMimeExtension`), check-in (remplacement de l'id Drive), `assertRefBindable` / `deleteMediaRefIfUnshared` / `isMediaRefReferenced` (`src/lib/media/server.ts`) branchés sur trajets, check-in, incidents, missions et suppressions, `deletePrefix` + `deleteMediaKey`, migration (corbeille si tout copié, groupe par id Drive, `stableHex`, journal `scripts/out/`, sans UL / multi-UL sautés), NDF (`expensePublishedFolder(name, createdAt, reportId)`, `isExpensePublishedKeyOf`), `toMediaUlSegment`, `mediaFileUrl(id)`, tests, AGENTS.md. Aucun travail à moitié fait sur ces tâches.
- Non commencée : « Tests du câblage CLI de `scripts/migrate-drive-images-to-r2.ts` » (décochée) — la lecture des lignes (SQL, repli d'UL via `UserUL`), la création des dépendances et le code de sortie sont encore dans `main()` du script ; à extraire en fonctions exportées puis tester sur `file::memory:`.
- Écarts à valider : liaison mission accepte aussi l'UL de rattachement de l'auteur (`create-mission-report.ts`) ; au rendu, un dossier Drive introuvable = rien à reprendre (pas de 502).
- Rien n'est commité.

**Reprise revue 1 (2026-11-09)** — tâche « Tests du câblage CLI » faite (cochée) : lecture des lignes (`readMigrationRows`, `migrationUlSegment`), assemblage (`createMigrationDeps`), déroulé et bilan (`runDriveMigration`), code de sortie (`exitCodeOf`) extraits dans `src/lib/media/drive-migration-cli.ts` ; adaptateur Drive injectable (`createDriveSource(client?)`, `src/lib/media/drive-source.ts`) ; le script ne garde que l'environnement, le journal JSON et `process.exit`. Tests : `src/__tests__/unit/media-drive-migration-cli.test.ts` (SQLite `file::memory:`, Drive et R2 factices). Toutes les tâches Revue 1 sont cochées.

## Spec Change Log

- **Revue 1 (2026-11-08)** — Déclencheurs : constats #1-#15, #17-#19, #21-#25 du journal de tri (rendu Drive orphelin, régression inter-UL, liaison référence ↔ enregistrement absente, corbeille Drive partielle, collisions NDF, orphelins). Amendé : décisions utilisateur revue 1 dans le bloc figé (renégocié par l'humain), 11 lignes de matrice, tâches « Revue 1 ». État évité : photos perdues au rendu, rendu QR inter-UL bloqué, lecture/suppression des photos d'autrui, perte Drive irréversible. Décision utilisateur : corriger le code existant au lieu de le réécrire. KEEP : `src/lib/media/refs.ts` (validation de clé, segments), `listObjects`/repli démo, routes `media/photos` et `media/file`, helpers client, adaptation NDF scellement/backfill, tests existants.

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|--------|---------|---------|----------------|
| 1 | blind+edge+vgap | Trajet emprunté avant bascule (id Drive) puis rendu : photos de rendu écrites sur R2 mais jamais référencées | high | `checkin/route.ts:204` garde `trip.driveFolderId \|\| data.driveFolderId` ; l'upload ouvre un nouveau préfixe → intent_gap (règle de transition) |
| 2 | vgap | Upload refuse (403) le conducteur inter-UL au rendu et l'auteur d'un incident QR hors UL | high | `media/upload` applique `isOutsideUl` au véhicule ; `checkin/route.ts:50-55` exempte le conducteur, `POST /api/incidents` n'a pas de garde UL → intent_gap (règle d'accès) |
| 3 | blind+edge+vgap | Un client peut enregistrer le préfixe/la clé d'un autre enregistrement : lecture de ses photos, et `deletePrefix` des photos d'autrui à la suppression | high | refine `isAcceptableMediaRef` ne vérifie que le type ; `resolveFolderOwner` prend `rows[0]` → bad_spec (liaison référence ↔ enregistrement absente) |
| 4 | blind+edge | Upload mission : `ulId` de n'importe quelle UL existante accepté | medium | `upload/route.ts` ne contrôle pas l'appartenance → intent_gap (qui peut ranger sous quelle UL) |
| 5 | edge | Mission DT, session `ulId = default` → 400 | medium | repli seulement sur la session ; la migration, elle, retombe sur l'UL de rattachement → rattaché à #4 |
| 6 | blind+edge | Copie NDF publiée : collision `{demandeur}-{horodatage}` (homonymes / même seconde / `createdAt` NULL) → écrasement dans Drive | medium | format sans suffixe imposé par le bloc figé → intent_gap |
| 7 | blind+edge | Demandeur renommé : copie publiée sous l'ancien nom jamais supprimée (suppression, rangement) | medium | périmées = `{id}.pdf` + dossier courant seulement → bad_spec |
| 8 | blind | `deletePrefix` accepte `trip-photos/paris-18` (toute l'UL) | medium | garde = un seul `/` ; `deleteMediaFolder` ne valide pas → bad_spec (exiger `parseMediaFolderRef`) |
| 9 | edge | `--delete-old` met à la corbeille un dossier Drive dont des fichiers ont été ignorés (non copiés) | high | `drive-migration.ts` corbeille sans regarder `ignoredFiles` → bad_spec (perte de données irréversible) |
| 10 | edge | Même id Drive référencé par deux types (trajet + incident) : second groupe trouve la corbeille | medium | regroupement par type → bad_spec |
| 11 | edge | Fichier sans extension connue → servi `octet-stream` + nosniff (PDF téléchargé) | low | clé construite sans repli `extensionOfMimeType(file.type)` → patch |
| 12 | edge | Slug commençant par `-`/`.` → `buildMediaFolderRef` lève → 500 | low | slugs validés `^[a-z0-9-]+$` : `-x` possible mais improbable ; correction directe → patch |
| 13 | blind | Pas de journal persistant de migration (rollback après `--delete-old`) | medium | seule la sortie console garde la correspondance → bad_spec |
| 14 | blind | Dry-run : noms aléatoires ≠ ceux écrits par `--apply` | low | `readableSegment`/`uuid8` aléatoires → bad_spec (dériver de l'id Drive) |
| 15 | blind | Migration : rows sans UL → `sans-ul` ; dossier Drive partagé entre UL différentes fusionné sous une seule | medium | regroupement sur la 1ʳᵉ ligne → bad_spec (signaler) |
| 16 | blind | Upload non atomique : objets orphelins sur échec partiel, doublons au réessai | low | orphelins inoffensifs (règle NDF) → rejeté |
| 17 | blind | Suppression incident / mission / préfixes jamais rattachés : orphelins | medium | pré-existant (Drive non supprimé non plus) → defer |
| 18 | blind | `mediaFileUrl(ref, id)` : `ref` ignoré | low | `void ref` → patch (retirer le paramètre) |
| 19 | blind | AGENTS.md périmés (missions, incidents) | low | fichiers de contexte agent → defer |
| 20 | edge | Preview écrit désormais de vrais objets R2 | maybe-false | dépend du bucket R2 configuré en preview (NDF y écrit déjà) → à vérifier ; low si bucket dédié → rejeté |
| 21 | vgap | PDF d'incident : branche R2 non testée | medium (gap) | → patch test |
| 22 | vgap | Routes de suppression : appel `deleteMediaFolder` avec préfixe R2 non testé | medium (gap) | → patch test |
| 23 | vgap | Arguments d'envoi non vérifiés (CheckOut, MissionWizard, Incident) | medium (gap) | → patch test |
| 24 | vgap | `PhotoViewer` : routage R2/Drive non testé | medium (gap) | → patch test |
| 25 | vgap | Refines de schéma (400 sur référence forgée) non testés en route | medium (gap) | → rattaché à #3 |
| 26 | vgap+blind | CLI de migration non testée (SQL, repli UL, code de sortie) | medium (gap) | exécution manuelle après dry-run → defer |
| 27 | blind | Spec `in-progress`, journaux vides | false | statut géré par le workflow ; journaux remplis à la revue → rejeté |
| 26b | — | (mise à jour 2026-11-09) #26 traité à la demande de l'utilisateur : tests CLI ajoutés | carried | `media-drive-migration-cli.test.ts` |
| R2-1 | blind | Rendu : `existingFolderId` client (id Drive périmé) prime sur le préfixe R2 du trajet → nouveau préfixe, ignoré au check-in, photos perdues sans erreur | medium | `upload/route.ts:229` `data.existingFolderId ?? tripCtx…` ; check-in garde le R2 → patch (préfixe R2 du trajet toujours prioritaire) |
| R2-2 | blind | Droit de lecture suffit pour verser des photos dans le dossier rattaché d'un autre trajet/incident | medium | `upload/route.ts:238` `canAccessFolder` = lecture → patch (dossier rattaché accepté seulement s'il est celui du `tripId`, sinon 403 hors SUPER_ADMIN) |
| R2-3 | blind+vgap+edge | Suppression véhicule : photos d'incident supprimées, lignes `IncidentReport` conservées | medium | `vehicles/[id]/route.ts:394-427` ; lignes orphelines pré-existantes (CASCADE inactif) → defer |
| R2-4 | vgap+edge | Mission : envoi replié sur `session.user.ulId`, absent des UL acceptées par `insertMissionReport` → 400, fichiers orphelins | medium | `upload/route.ts:216` vs `create-mission-report.ts:278` → patch (ajouter l'UL de session aux UL acceptées) |
| R2-5 | blind | Dossier de mission horodaté à l'envoi, pas à la date de mission | low | décision utilisateur « nom de mission - timestamp » sans précision ; l'heure d'envoi est conforme → rejeté |
| R2-6 | blind+edge | Demandeur renommé entre deux signatures : deux copies publiées jusqu'au rangement | low | renommage rare, correction = listing à chaque scellement → rejeté |
| R2-7 | blind | Suppression NDF liste tout `ndf/{UL}/` | low | suppression SUPER_ADMIN rare → rejeté |
| R2-8 | blind | Journal de migration écrit seulement en fin d'exécution | medium | `scripts/migrate-drive-images-to-r2.ts` `writeFileSync` après `runDriveMigration` ; arrêt en cours = aucun journal → patch (ajout ligne à ligne JSONL) |
| R2-9 | blind+edge | Requêtes de partage sans index, séquentielles | low | tables de taille UL, SQLite → rejeté |
| R2-10 | blind+edge | Envois abandonnés / échec partiel : objets orphelins | medium | nouvelle fonctionnalité (balayage) → defer |
| R2-11 | blind+edge | PATCH incident remplaçant `driveFolderId` : ancien dossier orphelin | low | `incidents/[id]/route.ts:154` → patch (supprimer l'ancien si non partagé) |
| R2-12 | blind+edge | Dossier Drive d'un trajet copié au rendu jamais mis à la corbeille ; doublons au réessai | false | décision revue 1 : « le dossier Drive n'est pas mis à la corbeille ici » → rejeté |
| R2-13 | edge | Copie Drive au rendu > `maxDuration` 30 s | low | correction directe → patch (`maxDuration = 60`) |
| R2-14 | edge | Image au type MIME inconnu (svg, jfif…) stockée mais jamais listée | low | correction directe → patch (refuser les types hors `MIME_BY_EXT`) |
| R2-15 | edge | Course sur la liaison d'une même référence | low | improbable → rejeté |
| R2-16 | edge | Suppression véhicule à nombreux trajets : timeout | low | rare → rejeté |
| R2-17 | edge | Slug d'UL renommé : copie NDF de l'ancien dossier survit à la suppression | low | rare → rejeté |
| R2-18 | edge | 502 quand Drive non configuré au rendu | low | bloque plutôt que perdre les photos d'emprunt, conforme à l'intention → rejeté |
| R2-19 | edge | Horodatage de repli `now()` non déterministe | low | Drive fournit toujours `createdTime` → rejeté |
| R2-20 | edge | `src/components/missions/AGENTS.md:39` encore périmé | low | demande utilisateur (docs) → patch |
| R2-21 | edge | Groupes sautés (sans UL, multi-UL) : code de sortie 0 | medium | `drive-migration-cli.ts` `exitCodeOf` → patch (code 2 si au moins une ligne sautée, documenté) |
| R2-22 | vgap | CheckInModal : `tripId`/`existingFolderId` non vérifiés | medium (gap) | → patch test |
| R2-23 | vgap | MissionWizard : envoi du rapport signé non testé | medium (gap) | → patch test |
| R2-24 | vgap | Câblage SQL de `move-expense-pdfs-to-ul-folders.ts` non testé | medium (gap) | déjà au ledger → defer |
