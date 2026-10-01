---
title: 'Guide de vérification PDF par véhicule'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_commit: '2b6f84802b0f984d7b186ab516bfd35cedf18434'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/src/__tests__/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les bénévoles n'ont aucun accès, depuis l'appli, au guide de vérification propre à chaque véhicule (ex. `examples/VPSP 182.pdf`, 7 pages paysage, 1,3 Mo) ; il circule hors de l'outil.

**Approach:** Un administrateur joint (ou remplace / retire) un PDF « guide de vérification » depuis les modales de création et de modification d'un véhicule. Sur la page du véhicule, tout utilisateur ayant accès au véhicule peut le télécharger ou le lire dans l'appli via une liseuse plein écran.

**Décisions :**
- Liseuse = **pdf.js (`pdfjs-dist`)**, page par page (précédent/suivant, compteur « n / N », ajustée à la largeur, balayage sur mobile, flèches clavier), chargée en import dynamique uniquement à l'ouverture.
- Le guide est **aussi accessible depuis la page QR du véhicule** (`/qr/[token]`), avec les mêmes droits que ce parcours (tout compte connecté non bloqué par `isQrBlocked`, sans contrôle d'UL).

## Boundaries & Constraints

**Always:** Stockage dans R2 (bucket existant, préfixe `vehicle-guides/`), clé versionnée, référencée par une colonne `Vehicle.guideR2Key` (+ `guideFileName`, `guideSize`, `guideUpdatedAt`). Upload réservé à `isAdminOrAbove`, avec contrôle d'UL identique au PATCH véhicule (sauf SUPER_ADMIN). Lecture : même contrôle d'accès que `GET /api/vehicles/[id]` (session + même UL, sauf SUPER_ADMIN → 404 sinon). PDF validé par type/extension ET octets magiques `%PDF`, taille max 4,2 Mo (limite Vercel). Message clair en français si le fichier est refusé. Le remplacement supprime l'ancien objet R2 après mise à jour en base (échec de suppression = log, pas d'erreur).

**Never:** Pas de stockage du binaire en base ni sur Google Drive. Pas de modification des payloads JSON de `POST /api/vehicles` ni `PATCH /api/vehicles/[id]` : le PDF passe par une route multipart dédiée appelée après la création/modification réussie. Pas d'upload direct présigné. Pas de conversion de pages en `Server Component` (M-4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Upload OK | Admin même UL, PDF 1,3 Mo | 200, colonnes guide renseignées, objet R2 créé | N/A |
| Remplacement | Guide existant + nouveau PDF | Nouvelle clé en base, ancien objet supprimé | Échec delete → log |
| Fichier invalide | `.pdf` sans `%PDF` ou image | 400 « Le fichier doit être un PDF » | Rien n'est écrit |
| Trop gros | PDF 5 Mo | 413/400 « 4 Mo maximum » | Rien n'est écrit |
| Non admin | CHVL tente l'upload | 403 | — |
| Autre UL | Admin d'une autre UL | 403 (upload) / 404 (lecture) | — |
| Pas de guide | GET sur véhicule sans guide | 404 ; la page n'affiche pas la carte | — |
| Téléchargement | GET `?download=1` | `Content-Disposition: attachment; filename="<nom>"` | — |
| Lecture | GET sans paramètre | `inline` | — |
| Retrait | DELETE admin | Colonnes à NULL, objet supprimé | — |
| Création avec guide, upload échoue | Véhicule créé, PDF rejeté | Véhicule conservé, message « véhicule créé, guide non enregistré » | Admin peut réessayer via modification |

</frozen-after-approval>

## Code Map

- `src/lib/r2.ts` -- `putObject` L118, `getObject` L131, `deleteObject` L157, `assertR2Configured` L166, `newAttemptId`, modèle `buildExpenseStagingKey` L82 → ajouter `buildVehicleGuideKey(vehicleId, attempt)` = `vehicle-guides/<vehicleId>/<attempt>.pdf`.
- `src/app/api/expenses/upload/route.ts` -- modèle multipart (runtime nodejs, 4,2 Mo, détection PDF).
- `src/app/api/expenses/[id]/pdf/route.ts` -- modèle de proxy GET R2 (`pdfResponse`, 409 si clé absente du bucket).
- `src/app/api/vehicles/[id]/route.ts` -- GET L30 (contrôle UL lecture), PATCH L201 (contrôle admin + UL). ⚠️ `[id]` = **nom** du véhicule (`WHERE name = ?`) ; le SELECT GET doit exposer les métadonnées guide (pas la clé R2).
- `src/app/api/vehicles/route.ts` -- POST L173 renvoie le véhicule créé (nom à réutiliser pour l'upload).
- `src/components/vehicle/modals/AddVehicleModal.tsx` (`handleSubmit` L63) / `EditVehicleModal.tsx` (`handleSubmit` L87) -- ajout du champ fichier.
- `src/app/vehicles/[id]/page.tsx` -- insérer la carte entre `<VehicleDetailGrid>` L258 et `<TripHistoryList>` L298 ; données via `useVehicleDetail.ts`.
- `src/components/missions/SignedReportLightbox.tsx` -- modèle d'overlay plein écran (accessibilité, Échap, fermeture).
- `src/app/api/qr/[token]/vehicle/route.ts` -- `SELECT v.*` puis objet `vehicle` construit explicitement (≈L100-120) : y ajouter les métadonnées guide, jamais `guideR2Key`. Contrôle `isQrBlocked`, résolution `WHERE qrToken = ?`.
- `src/app/qr/[token]/page.tsx` + `VehicleInfoCard.tsx` / `types.ts` (`QRVehicle`) -- afficher la carte guide sur le parcours QR.
- `scripts/add-vehicle-transmission.ts` -- modèle de migration prod (`PRAGMA table_info`, idempotent).
- `scripts/setup-dev.ts` L171 / ALTER L255-266 ; `src/__tests__/integration/setup.ts` L23 -- schémas dev/test.
- `src/__tests__/integration/inventory-stock-import.test.ts` (FormData undici) + `expenses.test.ts` L10-21 (mock `@/lib/r2`) -- modèles de test.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/add-vehicle-guide.ts` -- migration idempotente des 4 colonnes (dry-run ; `--apply`) -- prod.
- [x] `scripts/setup-dev.ts`, `src/__tests__/integration/setup.ts` -- ajouter les colonnes -- parité dev/test.
- [x] `src/lib/r2.ts` -- `buildVehicleGuideKey` -- clés versionnées.
- [x] `src/app/api/vehicles/[id]/guide/route.ts` -- POST (multipart, remplace), GET (inline / `?download=1`), DELETE -- cœur (invoquer `/api-route-template`).
- [x] `src/app/api/vehicles/[id]/route.ts` -- exposer `guideFileName`, `guideSize`, `guideUpdatedAt` au GET.
- [x] `src/components/vehicle/VehicleGuideField.tsx` -- sélecteur PDF réutilisé par les deux modales (nom actuel, remplacer, retirer, validation client taille/type).
- [x] `AddVehicleModal.tsx`, `EditVehicleModal.tsx` -- upload après succès JSON, gestion d'échec partiel.
- [x] `src/components/vehicle/VehicleGuideCard.tsx` + `VehicleGuideReader.tsx` -- carte « Guide de vérification » (Lire / Télécharger) et liseuse plein écran (selon réponse Q1) -- invoquer `/component-templates`.
- [x] `src/app/vehicles/[id]/page.tsx` -- afficher la carte si un guide existe.
- [x] `src/app/api/qr/[token]/guide/route.ts` -- GET (inline / `?download=1`) résolu par `qrToken`, contrôle `isQrBlocked` -- lecture via QR.
- [x] `src/app/api/qr/[token]/vehicle/route.ts`, `src/app/qr/[token]/types.ts`, `src/app/qr/[token]/page.tsx` -- exposer les métadonnées et afficher `VehicleGuideCard` (URL de la route QR passée en prop).
- [x] `package.json` -- ajouter `pdfjs-dist` ; worker servi via `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` (vérifier la compatibilité webpack au build).
- [x] Tests : `src/__tests__/integration/vehicle-guide.test.ts` (401/403/400/413/404/happy path POST-GET-DELETE, remplacement), `src/__tests__/unit/r2-vehicle-guide-key.test.ts`, tests RTL de `VehicleGuideField` et `VehicleGuideCard`.
- [x] `package.json`/`package-lock.json` → 5.17.0 ; `CHANGELOG.md` (centré utilisateur) ; `CLAUDE.md` -- ligne de migration « À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.17.0 ».

**Acceptance Criteria:**
- Given un admin dans la modale de création, when il joint `VPSP 182.pdf` et valide, then le véhicule est créé et sa page affiche la carte « Guide de vérification ».
- Given un bénévole de l'UL sur la page du véhicule, when il clique « Lire », then le guide s'ouvre en plein écran dans l'appli et se ferme par bouton ou Échap.
- Given le même bénévole, when il clique « Télécharger », then le fichier est enregistré sous son nom d'origine.
- Given un véhicule sans guide, when un utilisateur ouvre sa page, then aucune carte guide n'apparaît.
- Given un bénévole d'une autre UL qui scanne le QR du véhicule, when il ouvre la page QR, then il peut lire et télécharger le guide ; un compte INACTIF reçoit 403.

## Implementation Notes

- **pdf.js build `legacy`** (`pdfjs-dist/legacy/build/pdf.mjs` + `legacy/build/pdf.worker.min.mjs`) au lieu de `build/` : `pdfjs-dist@6.3.289` moderne appelle `Map.prototype.getOrInsertComputed` sans polyfill, absent de la plupart des navigateurs mobiles. Le build legacy embarque les polyfills. Worker résolu par `new URL(..., import.meta.url)` — vérifié au `next build --webpack` : émis en `/_next/static/media/pdf.worker.min.<hash>.mjs`, pdf.js isolé dans un chunk chargé à l'ouverture de la liseuse.
- La liseuse récupère le PDF par `fetch` puis le passe en mémoire à pdf.js (`getDocument({ data })`) : la route ne gère pas `Range`, et un 404/403 affiche le message serveur.
- Contrôle d'UL via `isOutsideUl` (helper canonique de `apiAuth.ts`) : équivalent au PATCH/GET véhicule, plus strict seulement pour une session sans UL ou épinglée sur `'default'`.
- Helpers partagés : `src/lib/vehicleGuide.ts` (sans dépendance serveur — validation client + serveur, nom de fichier, `Content-Disposition` avec repli ASCII + `filename*` UTF-8) et `src/lib/vehicleGuideResponse.ts` (proxy R2 commun aux routes véhicule et QR).
- `DELETE` du guide idempotent (200 si aucun guide). `DELETE /api/vehicles/[id]` supprime aussi l'objet guide (best-effort, après la base).
- Échec partiel (création/modification OK, guide refusé) signalé par `alert()` dans les deux modales — idiome existant d'`AddVehicleModal`, et le message survit à la redirection si le véhicule est renommé.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | blind + edge + gap | `AddVehicleModal` ne réinitialise jamais `guide` : le PDF d'une création précédente part sur le véhicule suivant | high | Modale montée en permanence (`vehicles/page.tsx:399`), effet d'ouverture L38 ne touche pas `guide` | patch |
| 2 | blind + edge | `GET /api/vehicles/[id]/guide` laisse lire un compte INACTIF de la même UL, contrairement à la route QR | medium | Aucun contrôle INACTIF dans la route ; règle CLAUDE.md « INACTIF bloque toute autorisation » | patch |
| 3 | blind + edge | `MAX_GUIDE_SIZE` = 4,2 Mio alors que libellé et erreurs annoncent « 4 Mo » | low | `vehicleGuide.ts:10` ; correction directe de la constante | patch |
| 4 | blind + edge | Balayage : pincement ou défilement en diagonale / page zoomée tourne la page | medium | `handleTouchEnd` ne regarde que dx ; `touch-action: pinch-zoom` autorise le zoom ; usage mobile principal | patch |
| 5 | blind | Regex d'accents écrite en caractères combinants bruts | low | `vehicleGuide.ts:58-59` ; correction directe (`̀-ͯ`) | patch |
| 6 | blind + edge | `sanitizeGuideFileName` peut produire 154 caractères ; `.PDF` seul non reconnu | low | `slice(-150)` avant ajout de `.pdf`, comparaison sensible à la casse | patch |
| 7 | gap + blind | Nettoyage R2 à la suppression d'un véhicule sans test | medium | Aucun import du `DELETE` de `vehicles/[id]/route` dans `src/__tests__` | patch |
| 8 | gap | Carte guide des pages QR / véhicule (condition, URL QR) sans test | medium | Aucun test de `qr/[token]/page` ; URL QR = clé de l'accès inter-UL | patch |
| 9 | gap | Nettoyage du nouvel objet si l'UPDATE échoue, sans test | maybe-false | Régression ne laisserait qu'un orphelin ; demande d'injecter une panne DB | defer |
| 10 | edge | `DELETE /api/vehicles/[id]` sélectionne `guideR2Key` : 500 si déployé avant migration, non documenté | medium | `route.ts:356` ; la ligne CLAUDE.md ne mentionne que les routes guide | defer (fichier de contexte agent) |
| 11 | blind + edge | Erreur de rendu d'une page bloque la liseuse | low | Rendu pdf.js d'un PDF déjà chargé quasi jamais en échec ; correctif ajoute de la logique | rejet |
| 12 | blind + edge | Pas de piège de focus ni restitution du focus | low | Rare au clavier sur mobile ; ajoute de la complexité ; même niveau que `SignedReportLightbox` | rejet |
| 13 | blind + edge | Écritures concurrentes → objet R2 orphelin | low | Accepté par la spec (orphelin inoffensif) ; deux admins simultanés improbables | rejet |
| 14 | blind | Worker pdf.js non vérifié en production | false | `npm run build` émet `pdf.worker.min.<hash>.mjs` dans `/_next/static/media` | rejet |
| 15 | blind | Double téléchargement, `no-store` | low | Choix de conception, 1,3 Mo ; optimisation hors périmètre | rejet |
| 16 | blind | Alerte + toast contradictoires en modification | low | Les deux messages sont exacts (véhicule modifié, guide non) | rejet |
| 17 | blind | `package-lock.json` absent du diff | false | Exclu volontairement du diff de revue ; modifié et synchronisé | rejet |
| 18 | edge | `formData()` bufferise avant le contrôle de taille | low | Vercel coupe à 4,5 Mo avant la route | rejet |
| 19 | edge | PDF valides avec octets avant `%PDF` refusés | low | Cas rare ; l'admin voit un message clair | rejet |
| 20 | edge | « Invalid Date » si `updatedAt` illisible | false | `guideUpdatedAt` est toujours écrit par le serveur en ISO | rejet |

## Verification

**Commands:**
- `npm run lint` -- 0 erreur, 0 avertissement
- `npm run test` -- tous verts
- `npm run build` -- succès

**Manual checks (if no CLI):**
- `npm run dev`, créer un véhicule avec `examples/VPSP 182.pdf`, lire les 7 pages dans la liseuse (desktop + largeur mobile), télécharger, remplacer, retirer.
