---
title: 'Objets R2 existants rangés par UL (photos et documents de véhicule, justificatifs en attente)'
type: 'feature'
created: '2026-11-09'
status: 'done'
baseline_commit: '7ac6144854984098f45487dfe47b71219b069309'
route: 'dispatch'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trois familles d'objets R2 ne sont pas rangées par UL : `vehicle-photos/{vehicleId}/…`, `vehicle-guides/{vehicleId}/…` (documents PDF du véhicule) et `expenses-staging/{stagingId}/…` (justificatifs en attente de scellement). L'utilisateur veut que tout objet R2, hors `referentiels/`, soit sous un dossier au slug de l'UL.

**Approach:** Nouvelles clés écrites sous `{type}/{slug UL}/…` ; un script de rangement déplace les objets existants et repointe la base. Au passage, les clés de justificatifs envoyées par le client sont validées (faille existante).

**Décisions utilisateur (spec précédente) :**
- `vehicle-photos/{slug}/{nom véhicule}/{attempt}.jpg`
- `vehicle-documents/{slug}/{nom véhicule}/{attempt}.pdf` (remplace `vehicle-guides/`)
- `expenses-staging/{slug}/{stagingId}/{uuid}-{nom}`

**Décisions utilisateur (revue 1, 2026-11-09) — priment sur toute règle contraire ci-dessous :**
- UL d'un justificatif = celle de la NOTE : le formulaire envoie l'id de la note (`reportId`) au dépôt quand elle existe ; le dépôt vérifie que la note appartient à l'utilisateur et est en brouillon, et range sous l'UL de la note ; sans `reportId` (nouvelle note), UL active de la session.
- Liaison au déposant : le `stagingId` est émis par le serveur et signé (HMAC `AUTH_SECRET` sur l'id de l'utilisateur + un nonce, ex. `{nonce}-{sig}`) ; une clé nouvelle forme n'est acceptée que si son `stagingId` est signé pour l'utilisateur courant (le créateur de la note). Pas de table.
- Anciennes clés `expenses-staging/{x}/…` : acceptées seulement si elles figurent déjà dans `pendingReceiptKeys` de CETTE note (jamais pour une nouvelle note).
- Les clés stockées sont validées aussi : au PATCH sans `receiptKeys`, `finalReceiptKeys` passe par la même validation avant tout scellement.
- Véhicule sans UL (`ulId` NULL / `default`) : envoi de photo ou de document refusé (400), comme le script qui saute ces lignes.

## Boundaries & Constraints

**Always:**
- Segment UL = `toMediaUlSegment` / `expenseUlSegment` existants (slug assaini, repli id). Nom de véhicule = `sanitizeName` (`src/lib/media/refs.ts`), repli `sans-nom`. Clés VERSIONNÉES inchangées : suffixe `attempt`, jamais d'écrasement.
- UL : celle du véhicule (`Vehicle.ulId`) ; pour un justificatif, celle sous laquelle la note est créée (`session.user.ulId`, même repli que `POST /api/expenses`).
- Justificatifs : `POST /api/expenses` et `PATCH /api/expenses/[id]` refusent (400) toute clé de `receiptKeys` qui n'est pas une clé `expenses-staging/{segment UL de la note}/…` valide (pas de `..`) — aujourd'hui une clé arbitraire est lue, intégrée au PDF puis SUPPRIMÉE. Les anciennes clés `expenses-staging/{stagingId}/…` restent acceptées jusqu'au rangement (une note en brouillon ne doit pas devenir insoumettable).
- Rangement (`scripts/move-r2-objects-to-ul-folders.ts`) : dry-run par défaut, `--apply`, `--delete-old` (avec `--apply`), `--env <fichier>` ; journal JSONL au fil de l'eau sous `scripts/out/` ; bilan ; codes de sortie comme la migration Drive (1 échec, 2 ligne sautée, 0 sinon). Ordre : copie → UPDATE gardé (`WHERE … = <ancienne clé>`) → suppression de l'ancienne clé seulement avec `--delete-old` et après UPDATE réussi. Idempotent : une clé déjà à la bonne place n'est pas recopiée ; slug ou nom de véhicule renommé → regroupé au passage suivant.
- `Vehicle.guideR2Key` égal à une `VehicleDocument.r2Key` déplacée est repointé dans la même transaction.
- Justificatifs : seules les notes en `brouillon` avec `pendingReceiptKeys` non vide ; le JSON est réécrit entier, gardé sur l'ancienne valeur.
- Objet source absent → ligne sautée, listée, base intacte.

**Never:**
- Ne pas toucher `referentiels/`, `ndf/`, `ndf-revisions/`, `demo/`, les médias `trip-photos/…` & co, ni les objets orphelins non référencés en base.
- Pas de changement de schéma ; pas de déplacement automatique au renommage d'un véhicule, d'un slug ou au changement d'UL d'un véhicule.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Photo véhicule | VSAV 1, UL `paris-18` | `vehicle-photos/paris-18/vsav-1/{att}.jpg` | N/A |
| Document véhicule | PDF déposé | `vehicle-documents/paris-18/vsav-1/{att}.pdf` | N/A |
| Justificatif | session UL `paris-18` | `expenses-staging/paris-18/{stagingId}/{uuid}-{nom}` | N/A |
| Clé forgée | `receiptKeys: ["ndf-revisions/…"]` | 400, rien lu ni supprimé | N/A |
| Ancienne clé de brouillon | `expenses-staging/{stagingId}/…` | acceptée | N/A |
| Rangement photo | `vehicle-photos/{id}/{att}.jpg` | copiée, `photoR2Key` repointée ; ancienne supprimée si `--delete-old` | source absente → sautée, listée |
| Guide repris | `VehicleDocument.r2Key = Vehicle.guideR2Key` | les deux repointées ensemble | N/A |
| Déjà rangé | clé sous `{type}/{slug}/{nom}/` | rien | N/A |
| Véhicule renommé | clé sous `…/ancien-nom/` | déplacée sous `…/nouveau-nom/` (même fichier) | N/A |
| Concurrence | clé changée avant UPDATE | sautée (0 ligne), copie supprimée | avertissement |

</frozen-after-approval>

## Code Map

- `src/lib/r2.ts:141,149,128` -- `buildVehicleGuideKey`, `buildVehiclePhotoKey`, `buildExpenseStagingKey` prennent `(ulSegment, …)` ; ajouter `isExpenseStagingKey(key, ulSegment)` (nouvelle forme, ou ancienne forme `expenses-staging/{uuid}/…`).
- `src/app/api/vehicles/[id]/photo/route.ts:133`, `src/app/api/vehicles/[id]/documents/route.ts:86` -- lire `ulId`, `name` du véhicule et le slug (`ulSegmentOf`, `src/lib/media/server.ts`).
- `src/app/api/expenses/upload/route.ts:75` -- segment de `session.user.ulId || 'ul-paris-18'`.
- `src/app/api/expenses/route.ts:30`, `src/app/api/expenses/[id]/route.ts:34` -- refine des `receiptKeys` (segment de l'UL de la note : session pour POST, `report.ulId` pour PATCH).
- `src/lib/vehicleDocuments/server.ts`, `src/app/api/vehicles/[id]/documents/[documentId]/route.ts:100` -- lecture/suppression par clé en base : inchangées.
- Modèle de script : `scripts/migrate-drive-images-to-r2.ts` + `src/lib/media/drive-migration-cli.ts` (logique injectable, tests sur `file::memory:`) ; logique pure dans `src/lib/media/r2-relocation.ts` (nouveau).
- Commentaires de préfixe : `src/lib/vehicleDocuments/schema.ts:5`, routes photo/documents, `src/app/api/expenses/upload/AGENTS.md:26`.
- Tests : `r2.test.ts`, `vehicle-photo*.test.ts`, `vehicle-documents*.test.ts`, `expenses*.test.ts`, upload des justificatifs.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/r2.ts` -- constructeurs avec segment UL + `isExpenseStagingKey`.
- [x] Routes photo, documents, dépôt de justificatifs -- nouvelles clés.
- [x] `POST /api/expenses`, `PATCH /api/expenses/[id]` -- validation des `receiptKeys` + tests 400.
- [x] `src/lib/media/r2-relocation.ts` + `scripts/move-r2-objects-to-ul-folders.ts` (câblage extrait et testé sur base en mémoire, R2 factice) -- matrice complète.
- [x] `CLAUDE.md` (Commands : script à lancer APRÈS déploiement), AGENTS.md concernés, `CHANGELOG.md`, `package.json`/`package-lock.json` → 5.49.0.

**Acceptance Criteria:**
- Given le rangement appliqué avec `--delete-old`, when on liste le bucket, then toute clé hors `referentiels/` et `demo/` commence par `{type}/{slug}/`.
- Given le dry-run, when il termine, then rien n'est écrit et le plan liste chaque clé et sa destination.

**Revue 1 (corriger le code existant) :**
- [x] `src/app/api/expenses/upload/route.ts` + `src/components/expenses/ExpenseForm.tsx` -- `reportId` optionnel (note de l'utilisateur, en brouillon → UL de la note ; sinon 403/404) ; `stagingId` émis et signé par le serveur (HMAC `AUTH_SECRET`, id utilisateur + nonce) ; un `stagingId` client non signé pour l'utilisateur est ignoré.
- [x] `src/lib/r2.ts` + `POST /api/expenses` + `PATCH /api/expenses/[id]` -- validation : nouvelle forme = UL de la note ET `stagingId` signé pour le créateur de la note ; ancienne forme = seulement si déjà dans `pendingReceiptKeys` de cette note ; PATCH valide `finalReceiptKeys` (clés stockées comprises) ; changelog ajusté.
- [x] `ExpenseForm.tsx` -- sur le 400 justificatif, retirer les clés refusées de l'état pour que l'utilisateur puisse redéposer.
- [x] Routes photo/documents -- 400 si le véhicule n'a pas d'UL (`NULL` / `default`).
- [x] `src/lib/media/r2-relocation.ts` -- type PDF par signature `%PDF` ; `..` refusé seulement comme segment ; `isReferenced` via `json_each` ; anciens `stagingId` non-UUID acceptés.
- [x] Docs : `CLAUDE.md` (relancer après renommage d'un véhicule ; recopier la base démo après `--delete-old`).
- [x] Tests : slug ≠ id de bout en bout (dépôt → POST/PATCH ; photo/documents sous `<slug>`) ; clé d'un autre utilisateur de la même UL → 400 ; ancienne clé non stockée → 400, stockée → OK ; PATCH sans `receiptKeys` avec clé stockée forgée → 400 sans lecture ni suppression ; `reportId` d'une note d'autrui → 403 ; véhicule sans UL → 400 ; DELETE véhicule avec nouvelles clés ; relocation (PDF sans extension, `json_each`).

## Verification

**Commands:**
- `npm run lint` -- 0 erreur, 0 avertissement
- `npm run test` -- vert
- `npx tsx scripts/move-r2-objects-to-ul-folders.ts` -- dry-run lisible, aucune écriture

## Implementation Notes

## Spec Change Log

- **Revue 1 (2026-11-09)** — Déclencheurs : #1-#4, #6 (validation des justificatifs contournable, UL de session ≠ UL de la note, véhicule sans UL). Amendé : décisions utilisateur revue 1 (bloc figé renégocié par l'humain), tâches « Revue 1 ». État évité : lecture/suppression des justificatifs d'autrui ou de clés arbitraires stockées, brouillon multi-UL bloqué, objets sous `_`. Décision : corriger le code existant. KEEP : constructeurs de clés `r2.ts`, routes photo/documents, `src/lib/media/r2-relocation.ts` + script et leurs 21 tests, docs/version.

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|--------|---------|---------|----------------|
| 1 | edge+vgap | PATCH sans `receiptKeys` : clés stockées utilisées sans validation (lues, scellées, supprimées) | high | `expenses/[id]/route.ts:538` ne valide que `receiptKeys` → bad_spec (décision revue 1) |
| 2 | edge+blind | Anciennes clés acceptées pour toute note / toute UL, sans fin | high | `isExpenseStagingKey` : `ulSegment === null` accepté → bad_spec |
| 3 | edge+blind | Clé de dépôt d'un autre utilisateur de la même UL acceptée | high | aucune liaison au déposant → bad_spec |
| 4 | edge+blind | UL de session ≠ UL de la note → nouveaux justificatifs refusés, brouillon bloqué | medium | `upload/route.ts` vs `[id]/route.ts:541` → intent_gap, tranché (option a) |
| 5 | blind | Formulaire : clé refusée renvoyée à chaque essai | medium | `ExpenseForm.tsx:223-247` → patch |
| 6 | edge+blind | Véhicule sans UL → `_` côté routes, sauté côté script | medium | `ulSegmentOf('')` → bad_spec (décision : 400) |
| 7 | vgap | Aucun test de route avec slug ≠ id | medium (gap) | fixtures `slug = id` → patch tests |
| 8 | edge+blind | Copie de rangement typée par l'extension (PDF sans `.pdf` → image/jpeg) | low | → patch (signature `%PDF`) |
| 9 | edge | Ancien nom de fichier avec `..` refusé | low | `key.includes('..')` → patch (segment égal à `..`) |
| 10 | blind | `isReferenced` par `instr` sur le JSON | low | → patch (`json_each`) |
| 11 | blind+edge | Onglet ouvert pendant le rangement : anciennes clés réécrites | medium | couvert par #2 (anciennes clés acceptées seulement si encore stockées) |
| 12 | blind | Brouillons à ancienne clé non-UUID bloqués | low | couvert par #2 ; script : accepter tout `stagingId` hérité → patch |
| 13 | edge | Collision de destination | low | probabilité négligeable → rejeté |
| 14 | blind | Véhicule renommé : fichiers sous l'ancien nom | low | voulu (Never) → patch doc (relancer le script) |
| 15 | blind | CLAUDE.md : recopier la base démo après `--delete-old` | low | → patch doc |
| 16 | blind | Dépôts refusés / abandonnés orphelins | medium | rejoint le balayage au ledger → defer |
| 17 | blind | Tests de clés de dépôt dans `r2-vehicle-guide-key.test.ts` | low | cosmétique → rejeté |
| 18 | blind | Pas de test DELETE véhicule avec nouvelles clés | low | → patch test |
| 19 | blind | Spec absente du diff | false | volontaire (fournie au seul relecteur des cas limites) → rejeté |
| 20 | blind | Changelog surestime la correction | medium | réglé par #1-#3 ; texte à ajuster → patch |
| R2-1 | vgap+blind | Tests annoncés absents : véhicule sans UL → 400, slug ≠ id pour photo/documents (restés dans des fichiers hors dépôt) | high | `grep` : 0 occurrence dans `vehicle-photo.test.ts` / `vehicle-documents.test.ts` → patch |
| R2-2 | edge+blind | Formulaire ouvert pendant le rangement : anciennes clés refusées puis retirées, justificatifs rangés perdus | medium | `rejectedReceiptKeys` ne mappe pas l'ancienne clé vers sa version rangée stockée → patch (substitution serveur) |
| R2-3 | vgap | `ExpenseForm` : retrait des clés refusées non testé en création (POST) | medium (gap) | → patch test |
| R2-4 | blind | Message d'erreur : ne nomme pas les justificatifs, dit « retirés » côté API | low | → patch (texte) |
| R2-5 | blind | Doc : relancer aussi après changement d'UL d'un véhicule | low | → patch doc |
| R2-6 | blind | Dry-run annonce des suppressions qui n'auront pas lieu (clé encore référencée) | low | → patch (libellé « si non référencée ») |
| R2-7 | blind | « Retour arrière possible » sans outil | low | → patch (libellé : trace pour retour manuel) |
| R2-8 | blind | `GET /api/expenses/[id]` : parseur JSON dupliqué | low | → patch (`parseStoredReceiptKeys`) |
| R2-9 | blind | Changelog décrit le rangement R2 (invisible pour l'utilisateur) | medium | règle « changelog user-centric » → patch |
| R2-10 | edge | Course PATCH / script `--delete-old` | low | script lancé une fois en période calme → rejeté |
| R2-11 | edge | Changement d'UL active entre dépôt et enregistrement | low | rare, l'utilisateur redépose → rejeté |
| R2-12 | edge | Deux clés d'un brouillon vers la même destination | low | improbable → rejeté |
| R2-13 | edge | Type MIME PNG/WebP hérité | false | justificatifs et photos déjà normalisés en JPEG au dépôt → rejeté |
| R2-14 | edge | Objets non référencés jamais rangés | false | voulu (Never) → rejeté |
| R2-15 | blind | Anciennes clés stockées d'autrui (avant 5.49.0) acceptées | low | décision revue 1 → rejeté |
| R2-16 | blind | Collision de dossier entre véhicules de même nom | low | clés uniques, chemin exact en base → rejeté |
| R2-17 | blind | Code de sortie 2 permanent sur lignes non traitables | low | → rejeté |
| R2-18 | blind | Justificatifs refusés/abandonnés orphelins | medium | déjà au ledger → defer |
| R2-19 | blind | Repli `ul-paris-18` | low | pré-existant (`POST /api/expenses`) → rejeté |
