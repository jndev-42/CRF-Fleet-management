---
title: 'Chatbot du référentiel secourisme (recherche plein texte, sans IA payante)'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_commit: '9c04ab1a3b10424d763f2b4893ab236a950564af'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/src/__tests__/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les secouristes ne peuvent pas interroger rapidement le guide pratique PSE (PDF de 826 pages, 174 Mo). Aucune clé d'API ni budget pour un LLM.

**Approach:** Le super_admin téléverse le PDF, le serveur en extrait le texte page par page dans un index FTS5 Turso. Tout utilisateur actif ouvre un chatbot par un bouton flottant (comme « Signaler un bug ») et pose sa question. La réponse affiche les 5 pages les plus pertinentes, avec le titre de la fiche, un extrait surligné et « Ouvrir p. X » dans la liseuse PDF. Aucune génération de texte : on affiche uniquement le texte officiel.

## Boundaries & Constraints

**Always:**
- Import réservé à `SUPER_ADMIN`. Chatbot réservé aux utilisateurs authentifiés non `INACTIF`.
- Un seul référentiel actif. Un nouvel import remplace l'ancien seulement une fois l'indexation terminée, sans fenêtre de recherche vide.
- Le PDF ne transite jamais par une fonction Vercel (limite de corps de 4,5 Mo) : envoi et lecture directs vers R2 via des URL signées `aws4fetch` (`signQuery`).
- Indexation serveur par lots de pages pilotés par le navigateur, chaque appel restant sous `maxDuration`.
- La liseuse charge le PDF par requêtes `Range` : on ne télécharge jamais les 174 Mo.
- Avertissement permanent dans le chatbot : « Extraits du référentiel — ne remplace ni la formation ni la régulation (15) ».

**Never:**
- Pas d'appel à un LLM ni d'embeddings. Pas de nouvelle dépendance npm.
- Pas d'entrée de menu ni de `MenuSetting`. Historique des questions non persisté (state React uniquement).
- Pas de `dangerouslySetInnerHTML` pour le surlignage.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Question nominale | « que faire devant une hémorragie » | ≤5 pages classées bm25, avec titre de fiche, extrait `<mark>` et n° de page | N/A |
| Sans accents | « hemorragie » | Trouve « hémorragie » (`remove_diacritics 2`) | N/A |
| Mots vides seuls / caractères FTS | « que faire ? », `"*(OR` | Résultat vide propre ; aucune erreur de syntaxe FTS | 200 + liste vide |
| Aucun référentiel | table vide | Le chatbot affiche « Aucun référentiel importé » | 200 `{ ready:false }` |
| Import concurrent | 2e `start` pendant un traitement | Le traitement précédent est abandonné (statut `failed`) | 200 |
| Upload non-PDF | signature ≠ `%PDF` | Rejet au `start` du traitement | 400 + objet R2 supprimé |

</frozen-after-approval>

## Code Map

- `src/lib/r2.ts` -- client `aws4fetch` (`config()`, `withRetry`, `putObject`/`getObject`/`deleteObject`, `newAttemptId`). Y ajouter `presignUrl(key, method, expiresSec)` et `buildReferentielKey(attempt)`.
- `src/lib/vehicleGuide.ts` -- réutiliser `hasPdfSignature`, `sanitizeGuideFileName`.
- `src/components/vehicle/useGuidePdf.ts` + `VehicleGuideReader.tsx` -- liseuse pdf.js (build legacy, worker dynamique). Aujourd'hui en `fetch` complet : ajouter un mode URL + `Range` et une prop `initialPage`, sans régresser le guide véhicule.
- `src/components/BugReportButton.tsx` (+ `.module.css`, `position:fixed; bottom:24px; right:24px; z-index:300`) -- modèle du bouton flottant ; monté dans `src/app/layout.tsx:91`.
- `src/app/users/page.tsx` (onglets, `isSuperAdminUser` l.39, onglet `menus` l.191-237) -- ajouter un onglet « Référentiel ».
- `src/app/api/uniforms/loans/mine/route.ts` -- modèle de route GET : `auth()` → `unauthorizedResponse()` → `isQrBlocked` → `forbiddenResponse`. Erreurs via `getErrorMessage`.
- `src/lib/roles.ts` -- `isSuperAdmin`, `isQrBlocked`.
- `scripts/add-uniforms.ts` -- squelette de migration dry-run / `--apply`.
- `scripts/setup-dev.ts` (DDL `IF NOT EXISTS`) et `src/__tests__/integration/setup.ts` (`createTables()` l.22, nettoyage l.~577) -- y ajouter les nouvelles tables.
- `scripts/dev-db-init.ts:66` -- clonage prod : il liste `sqlite_master` et ne réécrit que `CREATE TABLE`. Doit ignorer la table virtuelle FTS et ses tables fantômes, puis reconstruire l'index.
- `next.config.*` `serverExternalPackages` -- ajouter `pdfjs-dist` (extraction côté serveur).
- FTS5 vérifié : client libSQL en mémoire et conteneur de dev. Turso prod à vérifier par la migration.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/add-referentiel.ts` -- migration dry-run / `--apply` qui crée :
  - `Referentiel(id, fileName, r2Key, pageCount, processedPages, status 'uploading'|'processing'|'ready'|'failed', createdBy, createdAt, readyAt)` ;
  - `ReferentielPage(referentielId, page, title, body, PK(referentielId,page))` ;
  - `ReferentielFts` FTS5 `(title, body)` en contenu externe sur `ReferentielPage`, `tokenize='unicode61 remove_diacritics 2'`.
  La migration teste FTS5 et échoue avec un message clair s'il est absent.
- [x] `scripts/setup-dev.ts`, `src/__tests__/integration/setup.ts`, `scripts/dev-db-init.ts` -- même DDL et nettoyage. Le clonage ignore les tables FTS puis lance `INSERT INTO ReferentielFts(ReferentielFts) VALUES('rebuild')`.
- [x] `src/lib/r2.ts` -- `presignUrl` + `buildReferentielKey` -- envoi et lecture directs.
- [x] `src/lib/referentiel/query.ts` -- question → requête FTS5 : minuscules, mots vides FR retirés, termes ≥2 caractères échappés entre guillemets avec `*`, `OR`, petit dictionnaire de synonymes (RCP, DAE, AVC, PLS, malaise↔détresse). `null` si rien ne reste.
- [x] `src/lib/referentiel/pageTitle.ts` -- titre de fiche tiré de l'en-tête de page (ex. « Urgences vitales / Perte de connaissance / IV.B.5 »), en retirant « DUOS / Pole santé » et les en-têtes « FORMATION AUX PREMIERS SECOURS… /N ».
- [x] `src/lib/referentiel/extract.ts` -- `extractPages(url, from, to)` via `pdfjs-dist/legacy` sur l'URL signée (`disableAutoFetch`, `disableStream`) → `{ page, title, body }[]`.
- [x] `src/app/api/referentiel/upload/route.ts` -- POST SUPER_ADMIN : crée la ligne `uploading`, renvoie `{ id, uploadUrl }` (PUT signé, 15 min).
- [x] `src/app/api/referentiel/process/route.ts` -- POST SUPER_ADMIN `{ id, fromPage }` (Zod) :
  - au premier appel : vérifie la signature `%PDF` (lecture `Range` 0-3) et fixe `pageCount` ;
  - indexe environ 80 pages par appel ;
  - au dernier lot, en transaction : nouvelle version `ready`, anciennes lignes et pages supprimées, FTS `rebuild` ; puis suppression de l'ancien objet R2.
  - `maxDuration = 60`.
- [x] `src/app/api/referentiel/route.ts` -- GET (utilisateur actif) : `{ ready, fileName, pageCount, readyAt }`. Pour SUPER_ADMIN, ajoute aussi l'éventuel traitement en cours.
- [x] `src/app/api/referentiel/search/route.ts` -- GET `?q=` (Zod, 2–200 caractères) : top 5 `bm25` avec `snippet(…, '\u0002', '\u0003', '…', 24)`, filtré sur la version `ready`.
- [x] `src/app/api/referentiel/file-url/route.ts` -- GET (utilisateur actif) : URL GET signée (1 h) du PDF actif.
- [x] `useGuidePdf.ts` / `VehicleGuideReader.tsx` -- options `{ rangeUrl, initialPage }`.
- [x] `src/components/referentiel/ReferentielChatButton.tsx` (+ `ReferentielChatPanel`, CSS module) -- bouton flottant au-dessus du bouton bug (`bottom: 84px`). Panneau de chat : bulles question/résultats, extraits surlignés découpés sur les marqueurs `\u0002` / `\u0003`, « Ouvrir p. X » → liseuse, avertissement, état vide. Monté dans `layout.tsx` à côté de `BugReportButton`.
- [x] `src/components/admin/ReferentielTab.tsx` -- onglet SUPER_ADMIN dans `users/page.tsx` : choix du fichier, PUT direct vers R2 avec progression (XHR), boucle sur `process` avec barre « pages X/826 », état actuel du référentiel.
- [x] Tests :
  - unitaires : `query.ts`, `pageTitle.ts` ;
  - intégration (401/403/400/nominal) : les 5 routes, `r2` et `extract` mockés ;
  - RTL : chat (question → résultats → ouverture à la bonne page) et onglet admin.
- [x] `package.json` / `package-lock.json` (mineure), `CHANGELOG.md` (FR, orienté utilisateur), ligne de migration dans `CLAUDE.md` (« À EXÉCUTER AVANT LE DÉPLOIEMENT ») et règle CORS R2 documentée.

**Acceptance Criteria:**
- Given un SUPER_ADMIN qui importe le guide de 174 Mo, when l'import se termine, then le référentiel est `ready` avec 826 pages et aucune requête Vercel ne dépasse 4,5 Mo.
- Given un ADMIN (non super), when il appelle `upload` ou `process`, then 403, et l'onglet n'apparaît pas.
- Given un utilisateur actif, when il ouvre le chatbot et clique « Ouvrir p. 120 », then la liseuse s'ouvre à la page 120 sans télécharger le PDF entier.
- Given un import en cours, when quelqu'un cherche, then l'ancien référentiel répond toujours.

## Design Notes

- Une page = un document FTS : la page est l'unité qu'on ouvre, et elle fait environ 1 300 caractères.
- R2 doit autoriser CORS pour l'origine de l'appli : `GET`, `PUT`, `HEAD` ; en-têtes `Range` et `Content-Type` ; exposer `Accept-Ranges`, `Content-Range`, `Content-Length`, `ETag`. C'est une configuration Cloudflare manuelle, à documenter.

## Verification

**Commands:**
- `npm run test` -- 0 échec
- `npm run lint` -- 0 erreur, 0 avertissement
- `npm run build` -- succès (pdfjs côté serveur résolu)

**Manual checks:**
- En dev, importer `examples/pse_guide_pratique_2022.pdf`. Les questions « hémorragie », « PLS », « RCP enfant », « DAE » renvoient la bonne fiche dans le top 3. La liseuse s'ouvre à la bonne page, avec seulement des requêtes `206` dans l'onglet réseau.

## Implementation Notes

- Implémenté par le sous-agent (5 routes, lib `src/lib/referentiel/`, onglet admin, bouton flottant, liseuse en mode `rangeUrl`). En plus de la spec : `schema.ts` (DDL partagé migration/dev/tests), `repository.ts`, `highlight.ts`.
- Vérifié sur le vrai guide (826 pages), via un serveur HTTP local qui gère `Range` : 80 pages extraites en environ 1 s pour 5,9 Mo lus, indexation complète en environ 3,5 s. Résultats pertinents dans le top 3 (hémorragie, PLS, RCP enfant, DAE, brûlure, noyade).
- Correction après relecture du diff : les titres manquaient sur 353 pages (couvertures de fiche, bandeau « DABE / Pole santé »). `pageTitle.ts` lit désormais le cartouche de couverture (nom de fiche, y compris sur deux lignes), et `applyFicheNames` propage ce nom aux pages de suite à l'activation. Résultat : 708/826 pages titrées, dont 573 avec le nom de fiche.
- Pas encore testé contre le vrai R2 : il faut d'abord la règle CORS (documentée dans `CLAUDE.md`).

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / décision |
|---|--------|---------|---------|-------------------|
| 1 | blind + edge | Liseuse en `rangeUrl` sans `disableStream` | high | pdf.js exige `disableStream` pour que `disableAutoFetch` agisse ; le test fige l'option incomplète → patch |
| 2 | blind | FTS indexé sur le rowid implicite de `ReferentielPage` (PK composite) | medium | Un rowid non aliasé peut changer au `VACUUM` → patch (`id INTEGER PRIMARY KEY` + `content_rowid`) |
| 3 | blind + edge | La migration en dry-run crée/supprime `_fts5_probe` | medium | Constaté `scripts/add-referentiel.ts:37-39` → patch (table `temp.`) |
| 4 | blind + edge + vgap | Lignes `uploading` jamais purgées : bandeau « import inachevé » permanent, fichiers R2 conservés | medium | `activate()` ne purge que `ready`/`failed` ; une nouvelle import ne marque que `processing` → patch |
| 5 | edge | Une import abandonnée peut encore être activée par son lot en cours | low | `UPDATE … ready` sans condition de statut ; correction directe → patch |
| 6 | edge | `coverTitle` peut prendre l'en-tête « FORMATION… » pour le nom de fiche | low | Si le cartouche est à l'index 1 ; correction directe → patch |
| 7 | blind | `fold()` avec caractères combinants littéraux | low | Lisibilité ; correction directe → patch |
| 8 | blind | Focus non géré à l'ouverture et à la fermeture du chat | low | Bouton démonté, focus perdu → patch (autofocus + retour du focus) |
| 9 | vgap | Classement bm25 / poids du titre non testés | medium | Pré-vérifié → patch (test) |
| 10 | vgap | Renommage des pages de suite à l'activation jamais exécuté en test | medium | Pré-vérifié → patch (test) |
| 11 | vgap + blind | Lot écourté par l'échéance non testé à la route | medium | Pré-vérifié → patch (test) |
| 12 | vgap + blind | Chemins d'échec de `process` non testés (PDF illisible, vide, extraction) | medium | Pré-vérifié → patch (tests) |
| 13 | vgap + blind | `presignUrl`, `getObjectRange`, `buildReferentielKey`, `extract.ts` sans tests unitaires | medium | Pré-vérifié ; règle du projet → patch |
| 14 | vgap | `isFtsShadowTable` non testé (clonage `dev:prod`) | medium | Pré-vérifié → patch (test unitaire) ; le flux de clonage complet n'a jamais eu de test |
| 15 | blind + vgap | Le test `file-url` vérifie `getObjectRange` appelé par l'import, pas par la route | low | Assertion vide → patch |
| 16 | blind + edge | Pas de reprise d'une indexation interrompue, ni de nouvel essai après une erreur passagère | low | Import rare (super_admin), environ 11 appels ; la correction ajoute de l'UI et des branches → rejeté |
| 17 | blind + edge | Dépassement possible de `maxDuration` (`countPages` hors budget, activation après 40 s) | low | Mesuré : ouverture ≈ 1 s, reconstruction de 826 pages < 1 s en local ; 20 s de marge → rejeté |
| 18 | blind | Raison d'échec non conservée après rechargement | low | Ajouterait une colonne ; rare → rejeté |
| 19 | blind | Pas de limite de taille ; URL PUT réutilisable 15 min | low | Seul un super_admin peut déposer → rejeté |
| 20 | blind | Nouvelle URL signée à chaque clic ; liseuse > 1 h en échec | low | Ajouterait un cache ou de la logique de renouvellement → rejeté |
| 21 | blind | Synonymes à plusieurs mots ou au pluriel non étendus | low | Les termes eux-mêmes restent cherchés en préfixe → rejeté |
| 22 | blind | Pas d'interrupteur `MenuSetting` | false | Exclu explicitement par l'intention (« Pas d'entrée de menu ni de MenuSetting ») |
| 23 | blind | Bouton visible avant tout import | low | Fenêtre courte entre déploiement et import → rejeté |
| 24 | blind | Résultats non regroupés par fiche | low | Les pages diffèrent en contenu ; la spec demande des pages → rejeté |
| 25 | blind | Deux onglets super_admin concurrents : 409 trompeur | low | Cas marginal → rejeté (garde-fou couvert par #5) |
| 26 | blind | Pas de limite de débit sur la recherche | low | Appli interne authentifiée → rejeté |
| 27 | edge | Objet de 0 octet : 416 → 500 générique | low | Super_admin seulement, cas marginal → rejeté |
| 28 | edge | Boucle infinie si `processedPages` n'avance pas | false | `extractPages` renvoie toujours ≥1 page quand `from` ≤ dernière page, sinon erreur |
| 29 | edge | Démontage de l'onglet pendant la boucle | low | La boucle continue et se termine ; affichage seulement → rejeté |
| 30 | edge | `VehicleGuideReader` sans `src` ni `rangeUrl` | false | Aucun appelant ne fait ça |
| 31 | edge | `initialPage` NaN | false | Les appelants passent un numéro de page issu de l'API |
| 32 | edge | La recherche renvoie `ready:false` après ouverture du panneau | low | Course rare → rejeté |
