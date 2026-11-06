---
title: 'QR stock — barre de recherche et scroll infini'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_commit: '1f0fe7ee36721276c1baef189b9b2fd9613874b4'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La page `/qr-stock/[token]` (inventaire ouvert depuis un QR Code) affiche d'un bloc tous les articles du stock : sur une armoire bien garnie, le bénévole doit faire défiler une longue liste pour trouver l'article voulu, et la page charge tous les articles et leurs lots en une fois.

**Approach:** Ajouter en tête de liste une barre de recherche (filtrage côté serveur sur le nom et la catégorie, insensible à la casse et aux accents). **Décision (validée par l'utilisateur) : la recherche porte sur TOUS les articles du stock, y compris ceux que le scroll infini n'a pas encore chargés** — elle interroge le serveur, jamais la liste déjà affichée et charger les articles par pages : sans recherche, les pages suivantes se chargent automatiquement à l'approche du bas de la liste (scroll infini) ; avec une recherche, les résultats sont paginés de la même façon.

## Boundaries & Constraints

**Always:** périmètre fermé de la page conservé (aucun contrôle de création/édition/suppression, aucune navigation sortante) ; erreurs inline, jamais `alert()` ; le panier survit à un changement de recherche et au chargement de nouvelles pages (les deltas en attente restent affichés sur les lignes qui réapparaissent) ; aucun filtre d'UL (décision de conception du QR stock) ; tri par nom conservé ; route `GET /api/qr-stock/[token]/stock` toujours accessible avec les mêmes règles d'accès (401, 403 inactif, 404 token).

**Never:** pas de migration ni de nouvelle route ; pas de filtrage côté client sur une liste partielle ; pas de bibliothèque de virtualisation/scroll externe ; ne pas toucher `/adjust`, `BatchPicker`, `CartSummary`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Page initiale | `GET …/stock` sans paramètre | 1re page (30 articles), `total`, `hasMore` | N/A |
| Page suivante | `?offset=30&limit=30` | articles 31→60, `hasMore` à jour | N/A |
| Recherche accentuée | `?q=sterile`, article « Compresse stérile » | trouvé | N/A |
| Recherche catégorie | `?q=pansem`, catégorie « Pansements » | trouvé | N/A |
| Aucun résultat | `?q=zzz` | `items: []`, `total: 0` ; UI « Aucun article ne correspond à « zzz » » | N/A |
| Paramètres invalides | `limit=0`, `limit=500`, `offset=-1`, `q` > 100 car. | 400 (Zod) | message inline |
| Frappe rapide | saisie de plusieurs caractères | une requête après ~300 ms de pause ; réponse obsolète ignorée | requête précédente annulée (AbortController) |
| Échec page suivante | erreur réseau au scroll | articles déjà chargés conservés, encart d'erreur | bouton « Réessayer » relance la page |

</frozen-after-approval>

## Code Map

- `src/app/api/qr-stock/[token]/stock/route.ts` -- route GET à paginer. Charger d'abord les colonnes légères (`id, name, category, quantity, minStock`) du stock, filtrer en JS sur le texte normalisé, découper la page, puis n'appeler `loadItemBatchStates` (`src/lib/inventory/adjustments.ts`) QUE pour les ids de la page — c'est le chargement des lots qui coûte.
- `src/lib/inventory/stocks.ts:461` `resolveStockByQrToken` -- réutiliser tel quel.
- `src/app/qr-stock/[token]/page.tsx` -- `fetchStock` (AbortController, 401 → `/login?callbackUrl=`) à transformer en chargement paginé + recherche ; `pendingByItem` calculé depuis le panier (inchangé) ; écran de succès « Retour » → recharge depuis la page 0 en gardant la recherche.
- `src/app/qr-stock/[token]/types.ts` -- `QRStock` : ajouter `total: number`, `hasMore: boolean`.
- `src/app/qr-stock/[token]/page.module.css` -- styles barre de recherche (collante en haut, cible tactile ≥ 44 px), sentinelle, « Chargement… » de fin de liste.
- `src/app/qr-stock/[token]/AGENTS.md` -- documenter pagination/recherche.
- `src/__tests__/integration/qr-stock.test.ts` -- AC-R4 utilise `toEqual` sur la forme exacte : à mettre à jour avec `total`/`hasMore`.
- `src/__tests__/components/QRStockPage.test.tsx` -- `mockFetch` matche `url.includes('/stock')` ; jsdom n'a pas `IntersectionObserver` (aucun usage existant dans le repo) → le stubber dans le test.
- `e2e/qr-stock.spec.ts` -- petits stocks, ne devrait pas casser ; vérifier.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/api/qr-stock/[token]/stock/route.ts` -- schéma Zod des query params (`q` trim ≤ 100, `offset` int ≥ 0 défaut 0, `limit` int 1–100 défaut 30) → 400 ; normalisation `NFD` + suppression des diacritiques + minuscules sur `q`, nom et catégorie ; réponse `{ stock, items, total, hasMore }` -- pagination serveur, lots chargés pour la page seule.
- [x] `src/app/qr-stock/[token]/types.ts` -- ajouter `total`, `hasMore` à `QRStock`.
- [x] `src/app/qr-stock/[token]/page.tsx` -- état `items` cumulés + `query` (debounce 300 ms) ; changement de recherche → reset et page 0 ; sentinelle `IntersectionObserver` (rootMargin ~200 px) déclenchant la page suivante si `hasMore` et pas déjà en chargement ; ignorer les réponses obsolètes ; bouton ✕ pour effacer la recherche ; compteur « N articles » ; état vide spécifique à la recherche ; erreur de page suivante → « Réessayer ».
- [x] `src/app/qr-stock/[token]/page.module.css` -- styles associés, dark mode via variables existantes.
- [x] `src/__tests__/integration/qr-stock.test.ts` -- AC-R4 mis à jour ; nouveaux cas : pagination (offset/limit/hasMore/total), recherche nom + catégorie + accents, 400 Zod, lots chargés uniquement pour la page.
- [x] `src/__tests__/components/QRStockPage.test.tsx` -- stub `IntersectionObserver` ; cas : recherche envoie `q` (debounce), scroll déclenche `offset=30`, panier conservé après recherche, état « aucun résultat », réessai après échec.
- [x] `src/app/qr-stock/[token]/AGENTS.md`, `CHANGELOG.md`, `package.json` + `package-lock.json` (5.40.0) -- doc et version.

**Acceptance Criteria:**
- Given un stock de 75 articles, when j'ouvre la page QR, then 30 articles s'affichent et, en faisant défiler jusqu'en bas, les 30 suivants puis les 15 derniers se chargent, sans doublon.
- Given un stock de 75 articles dont seuls les 30 premiers sont chargés, when je recherche le nom du 70ᵉ article, then il apparaît dans les résultats.
- Given un panier contenant un retrait sur « Garrot », when je recherche « compresse » puis efface la recherche, then le panier est intact et la ligne « Garrot » affiche toujours son delta.
- Given une recherche active, when je valide le panier puis appuie sur « Retour », then la liste rechargée respecte toujours la recherche.

## Implementation Notes

- Route : Zod sur `q`/`offset`/`limit`, filtre JS normalisé (NFD, sans diacritiques, minuscules) sur nom + catégorie, `loadItemBatchStates` borné aux ids de la page ; réponse `{ stock, items, total, hasMore }`.
- Page : `fetchPage(q, reset)` remplace `fetchStock` ; offset = nombre d'articles déjà chargés (ref), dédoublonnage par id à l'ajout ; sentinelle `IntersectionObserver` (rootMargin 200 px) recréée à chaque page ; la barre de recherche reste montée pendant les rechargements (pas de perte de focus).
- Ajout d'un test RTL « réponse obsolète ignorée » pour couvrir la ligne « Frappe rapide » de la matrice.
- Suite complète : 2 échecs préexistants dans `ReservationFormModal.test.tsx` (tests de récurrence dépendants de la date, corrigés sur une autre branche, absents de `main`) — sans lien.
- E2E `e2e/qr-stock.spec.ts` non exécuté (stocks de test < 30 articles, comportement inchangé pour eux).

## Review Triage Log

| # | Constat | Verdict | Preuve / route |
|---|---------|---------|----------------|
| 1 | Échec d'une recherche (reset) → `setStock(null)` démonte barre, liste et panier | medium | vérifié page.tsx (rendu sous `{stock && …}`) ; patch |
| 2 | Garde « réponse obsolète » absente des branches 401 et erreur | low | `res.json().catch` avale l'AbortError ; patch |
| 3 | Erreur réseau en reset laisse les articles de l'ancienne recherche | low | catch ne vide pas `items` ; patch (même racine que 1) |
| 4 | Offset dérivé du nombre dédoublonné → boucle si page sans nouvel id | low | effet recréé quand `loadingMore` repasse à false ; patch |
| 5 | `ORDER BY name` sans départage → doublons/trous entre pages | low | vérifié route.ts ; patch |
| 6 | Ligatures œ/æ non normalisées | low | NFD ne décompose pas œ ; patch |
| 7 | Double bouton d'effacement WebKit sur `type="search"` | low | aucune règle CSS ; patch |
| 8 | Compteur / état vide non annoncés | low | pas d'aria-live ; patch |
| 9 | Pas de test : page 2 conserve `q` | medium (gap) | vérifié par la couche verification-gap ; patch |
| 10 | Test debounce non discriminant (un seul change) | medium (gap) | idem ; patch |
| 11 | `package-lock.json` absent du diff | false | lockfile bien bumpé (5.40.0) ; exclu du diff de revue par le pathspec |
| 12 | Collision de version 5.40.0 | low | `main` = 5.39.0 ; seule la branche non fusionnée `feat/mode-demo-lecture-seule` porte aussi 5.40.0 — à arbitrer à la fusion, signalé à l'utilisateur |
| 13 | Coût serveur : liste complète lue à chaque page, changelog trop optimiste | false | les lots (coût dominant) sont bornés à la page ; formulation exacte |
| 14 | Test lots « ≤ 5 args » faible | false | `loadItemBatchStates` découpe par 500 : une régression « tout le stock » ferait échouer le test |
| 15 | Pas de repli sans IntersectionObserver / bouton « Afficher plus » | low | API universelle sur les navigateurs ciblés ; rejeté (ajout de surface) |
| 16 | Messages Zod en anglais | low | `maxLength` côté UI rend le cas inatteignable dans l'appli ; rejeté |
| 17 | Cas de test route (q blanc, limit=abc, limit=100) | low | rejeté : comportement Zod standard |
| 18 | `src/app/api/qr-stock/AGENTS.md` décrit l'ancien contrat | low | defer (fichier de contexte agent) |
| 19 | Appel MCP sans paramètre ne renvoie plus que 30 articles | low | `total`/`hasMore` l'exposent ; rejeté |

## Design Notes

Filtrage en JS plutôt qu'en SQL : SQLite `LIKE` n'est insensible à la casse que pour l'ASCII et ignore les accents, gênant en français (« sterile » ≠ « stérile »). La lecture des colonnes légères de tous les articles d'un stock reste bon marché ; seul `loadItemBatchStates` est borné à la page.

## Verification

**Commands:**
- `npx vitest run src/__tests__/integration/qr-stock.test.ts src/__tests__/components/QRStockPage.test.tsx` -- expected: tout vert
- `npm run lint` -- expected: 0 erreur, 0 avertissement
- `npm run test` -- expected: suite complète verte
