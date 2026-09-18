---
title: 'Import CSV massif pour la fonctionnalité stock'
type: 'feature'
created: '2026-09-17'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/src/app/api/CLAUDE.md', '{project-root}/src/__tests__/CLAUDE.md']
baseline_commit: '9b7e519c9d45712aa66c0315949a91614809ae3e'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ajouter des articles à un stock se fait aujourd'hui un par un via le formulaire d'ajout d'article. Il n'existe aucun moyen d'importer plusieurs articles en une fois depuis un fichier, ce qui rend la création d'un nouveau stock avec beaucoup de références longue et fastidieuse.

**Approach:** Ajouter un import CSV massif à la fonctionnalité stock : l'utilisateur uploade un fichier CSV, saisit le nom du nouveau stock à créer, et l'import crée le stock puis insère tous les articles du CSV en une seule opération. Le format du CSV (colonnes, délimiteur, encodage) est défini par cette spec (voir Design Notes).

## Boundaries & Constraints

**Always:**
- Import réservé aux rôles `isAdminOrAbove`, même règle et même scoping `ulId` que la création de stock existante (`POST /api/inventory/stocks`).
- La colonne `nom` est obligatoire dans le CSV ; toute ligne sans nom est une erreur de validation.
- Encodage UTF-8, délimiteur `;`, en-tête obligatoire en première ligne (voir Design Notes pour le format complet).
- La création du stock et l'insertion des articles se font dans une seule transaction DB : soit tout est écrit, soit rien ne l'est.
- Si au moins une ligne du CSV est invalide, aucun import n'a lieu ; l'API retourne la liste des lignes en erreur (numéro + raison) pour correction (tout-ou-rien).
- Si `quantite`>0, un `InvBatch` est créé avec la `date_peremption` fournie (nullable si absente), reproduisant le pattern existant de `POST /api/inventory`.
- Pas de contrôle d'unicité sur le nom du stock — comportement identique à `POST /api/inventory/stocks`, qui n'en impose aucun aujourd'hui.
- Le contenu du fichier est décodé en supprimant un éventuel BOM UTF-8 en tête avant parsing (Excel FR l'ajoute systématiquement).
- Ordre de validation : 1) taille du fichier (octets, avant parsing) 2) parsing CSV 3) nombre de lignes de données après parsing 4) validation Zod ligne par ligne.

**Never:**
- Pas de mode "ajouter à un stock existant" dans cette itération — l'import crée toujours un nouveau stock.
- Pas de fonctionnalité d'export CSV (hors périmètre).
- Pas de prévisualisation ligne par ligne avant import — flux direct : upload + nom + import, conforme à la demande.
- Pas de colonnes `unit`/prix/code-barres — `unit` existe en base (défaut `'unité'`) mais n'est pas exposée par l'API existante ni par cet import ; prix/code-barres n'existent pas au schéma.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| CSV valide | header `nom;categorie;quantite;date_peremption;stock_min;notes` + 3 lignes valides, nom de stock inédit | Nouveau `InvStockList` créé, 3 `InvItem` insérés, `InvBatch`+`InvStockLog` "Import initial" par article avec quantité>0, réponse 201 avec `{stockId, itemCount}` | N/A |
| Ligne sans nom | une ligne avec `nom` vide parmi les lignes | Aucune écriture en base | 400 `{error, lines: [{line, column, reason}]}` |
| Valeur non numérique | texte dans `quantite` ou `stock_min` | Aucune écriture en base | 400 `{error, lines: [{line, column, reason}]}` |
| Date invalide | `date_peremption` non conforme ISO (ex: `32/13/2026`) | Aucune écriture en base | 400 `{error, lines: [{line, column, reason}]}` |
| Noms d'articles dupliqués dans le CSV | deux lignes avec le même `nom` | Les deux lignes sont importées telles quelles (pas de contrainte d'unicité sur `InvItem.name`) | N/A |
| CSV vide ou header seul | fichier avec uniquement la ligne d'en-tête, aucune ligne de données | Aucune écriture en base | 400, message explicite |
| Fichier invalide | non-CSV (extension différente), ou dépasse la limite de taille/lignes | Aucune écriture en base | 400, message explicite |
| Rôle non admin | rôle `CADRE` appelle la route | Import refusé | 403 |
| Non authentifié | pas de session | Import refusé | 401 |

</frozen-after-approval>

## Code Map

- `src/lib/inventory/stocks.ts` — contient `ensureStockTableExists()` et `duplicateStock(..., userName, ...)` (~lignes 175-314, pattern transaction + `tx.batch` chunké par `WRITE_BATCH_SIZE = 500` à réutiliser), type `InvStockListRow`. Ne pas modifier ces fonctions ; ajouter une nouvelle fonction `importStockFromCsv()`.
- `src/app/api/inventory/stocks/route.ts` — POST existant (Zod `createStockSchema`, `isAdminOrAbove`) : référence du pattern auth+validation+insert pour créer un stock. N'effectue aucun contrôle d'unicité de nom — comportement à reproduire à l'identique (pas de 409). Ne pas modifier.
- `src/app/api/inventory/route.ts` — POST existant pour créer un `InvItem` un par un : référence des champs insérés (name, category, quantity, minStock, notes, stockId, ulId), extraction de `userName` (`session.user.name || session.user.email || 'Inconnu'`, ligne ~133), et de la logique `InvStockLog`/`InvBatch` conditionnelle sur quantity>0 (lignes ~125-140).
- `src/app/api/expenses/upload/route.ts` — pattern à suivre pour l'upload de fichier : `export const runtime = 'nodejs'`, `request.formData()`, cap de taille en octets avant tout traitement, validation par extension (pas de liste MIME fiable côté navigateur).
- `src/components/inventory/modals/StockModal.tsx` — pattern de modal à imiter (champ contrôlé, `onSubmit` async, erreur inline, disable pendant submit, `useEscapeKey`).
- `src/components/inventory/StockTabs.tsx` — bouton déclencheur du nouveau modal à ajouter, gated `isAdmin`.
- `src/__tests__/integration/inventory-stock-duplicate.test.ts` — test le plus proche à imiter (transaction création stock + bulk insert items/batches).
- Schéma confirmé (`scripts/add-inventory.ts`, `add-inventory-batches.ts`, `migrate-multi-stock.ts`, `migrate-inventory-stock.ts`) : `InvStockList` (id, name, ulId, isDefault, qrToken, createdAt, updatedAt — aucun index unique sur `name`), `InvItem` (id, stockId, name, category, unit [colonne existante, non exposée par l'API], quantity, minStock, notes, ulId, createdAt, updatedAt) et `InvBatch` (id, itemId, quantity, expiryDate [TEXT ISO, nullable], createdAt, updatedAt). `minStock` est confirmé présent en production (déjà utilisé par `POST /api/inventory` route.ts:125) — pas de vérification `PRAGMA table_info` nécessaire.
- Aucune lib CSV existante dans le repo — `scripts/import-inventory-csv.ts` est un script ad hoc non réutilisable (split naïf, pas de gestion des guillemets/délimiteurs). Ajouter `papaparse` + `@types/papaparse`.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- ajouter `papaparse` + `@types/papaparse` -- parsing CSV fiable (guillemets, délimiteurs) sans réinventer un parseur
- [x] `src/lib/inventory/csvImport.ts` (nouveau) -- `parseStockCsv(content: string): { ok: true; rows: ParsedRow[] } | { ok: false; errors: { line: number; column: string; reason: string }[] }` : supprime un BOM UTF-8 initial, parse (délimiteur `;`, header requis), rejette un fichier sans ligne de données, valide chaque ligne via Zod (`nom` requis, `quantite`/`stock_min` entiers ≥0 optionnels, `date_peremption` date ISO `AAAA-MM-JJ` optionnelle, `categorie`/`notes` optionnels) -- logique isolée et testable sans DB
- [x] `src/lib/inventory/stocks.ts` -- ajouter `importStockFromCsv({ulId, name, userName, rows})` : crée `InvStockList` (pas de contrôle d'unicité, comme `POST /api/inventory/stocks`), insère les `InvItem` (+ `InvBatch` et `InvStockLog` "Import initial" si quantité>0, `InvBatch.expiryDate` = `date_peremption`) dans une transaction `tx.batch` chunkée par `WRITE_BATCH_SIZE` -- réutilise le pattern transactionnel existant, garantit l'atomicité
- [x] `src/app/api/inventory/stocks/import/route.ts` (nouveau) -- POST : `runtime = 'nodejs'`, auth+`isAdminOrAbove`, `request.formData()` (`file`, `name`), vérifie l'extension `.csv` et la taille du fichier (≤2 Mo) avant tout parsing, appelle `parseStockCsv` (rejette si >2000 lignes de données), extrait `userName` de la session, puis `importStockFromCsv` -- 400 `{error, lines}` si fichier/lignes invalides, 201 `{stockId, itemCount}` sinon
- [x] `src/components/inventory/modals/ImportCsvModal.tsx` (nouveau) -- modal : champ nom de stock + input file (.csv), affichage des erreurs de lignes (`line`/`column`/`reason`), bouton "Importer" désactivé pendant la requête -- calqué sur `StockModal.tsx`
- [x] `src/components/inventory/StockTabs.tsx` -- ajouter un bouton "Importer un CSV" (gated `isAdmin`) ouvrant `ImportCsvModal`
- [x] `src/__tests__/unit/csvImport.test.ts` (nouveau) -- CSV valide, ligne sans nom, valeur non numérique, date invalide, BOM UTF-8, header seul (0 ligne), délimiteur incorrect -- couvre la matrice I/O sans DB
- [x] `src/__tests__/integration/inventory-stock-import.test.ts` (nouveau) -- 401, 403, 400 (lignes invalides), 400 (fichier vide), 201 happy path avec vérification DB (stock + items + batches + logs créés) -- couvre la matrice I/O avec DB réelle
- [x] `CHANGELOG.md` -- entrée utilisateur : possibilité d'importer plusieurs articles dans un nouveau stock depuis un fichier CSV
- [x] `package.json` -- incrémenter la version

**Acceptance Criteria:**
- Given un CSV valide et un nom de stock inédit, when l'admin soumet l'import, then un nouveau stock est créé avec tous les articles du CSV et la réponse indique le nombre d'articles importés.
- Given un CSV contenant au moins une ligne invalide, when l'admin soumet l'import, then aucune donnée n'est écrite en base et la réponse liste chaque ligne en erreur avec son numéro, sa colonne et sa raison.
- Given un CSV ne contenant que la ligne d'en-tête, when l'admin soumet l'import, then la requête échoue en 400 sans créer de stock.
- Given un utilisateur avec un rôle non admin, when il appelle la route d'import, then la requête échoue en 403.

## Implementation Notes

- `parseStockCsv` retourne aussi un `message` (en plus de `rows`/`errors`) pour porter les erreurs de niveau fichier (vide, header seul, trop de lignes, délimiteur incorrect) — non prévu explicitement par la signature de la tâche mais nécessaire pour le "message explicite" de la matrice I/O.
- Test d'intégration en `@vitest-environment node` (pas jsdom) : `Request`+`FormData`/`File` réels sont nécessaires pour exercer `request.formData()` côté route ; jsdom fait échouer la validation webidl d'undici. Pattern déjà utilisé ailleurs dans le repo.
- Non modifié (hors périmètre de la spec) : `src/components/inventory/AGENTS.md` et `modals/AGENTS.md` décrivent encore l'état pré-import — à mettre à jour lors d'un prochain passage doc.
- Vérifié indépendamment (pas seulement via le rapport de l'agent d'implémentation) : `npm run lint` (0 erreur/0 warning), `npx tsc --noEmit` (propre), tests unitaires+intégration+composant ciblés (38/38), `npm run build` (succès).
- Non exécuté : test manuel `npm run dev` dans un navigateur (pas de navigateur disponible dans cette session) — flux couvert indirectement par le test d'intégration bout-en-bout (multipart réel + DB réelle + rollback tout-ou-rien).

## Spec Change Log

## Review Triage Log

- **low → patch** : commentaire trompeur dans la route (`route.ts`) — "Plafond vérifié... AVANT toute lecture" laisse penser que le plafond de 2 Mo empêche le chargement mémoire du fichier, alors que `request.formData()` bufferise déjà tout le corps multipart avant que `file.size` soit lisible. Le check empêche seulement le *parsing CSV* d'un fichier trop gros, pas sa réception. Corriger le commentaire.
- **low → patch** : les limites serveur (2000 lignes, 2 Mo) ne sont pas mentionnées dans le texte d'aide de la modale — l'utilisateur ne les découvre qu'au rejet. Ajouter une ligne au texte d'aide.
- **low → patch** : `isRealIsoDate` (`csvImport.ts`) utilise `Date.UTC(year, ...)` qui réinterprète les années à 2 chiffres (0-99) comme 1900+yy (quirk JS historique), rejetant à tort une date ISO valide type `0050-06-30`. Corriger la construction de date pour éviter ce comportement hérité.
- **low → patch** : `optionalInteger` (`csvImport.ts`) n'a pas de plafond sur `quantite`/`stock_min` — une chaîne de chiffres dépassant `Number.MAX_SAFE_INTEGER` passe la regex `/^\d+$/` et perd silencieusement en précision après `Number(v)`. Ajouter un plafond dans le `refine`.
- **medium → patch** : `ImportCsvModal.tsx` n'a aucun test dédié (validation nom/fichier vide, rendu des erreurs de lignes, mapping `onSuccess({stockId, itemCount})` depuis la réponse JSON). Démonstration concrète : un mapping erroné des champs de réponse (ex. `stock_id` au lieu de `stockId`) romprait la sélection du stock importé sans qu'aucun test existant échoue. Ajouter `src/__tests__/components/ImportCsvModal.test.tsx` sur le modèle de `StockModal.test.tsx`.
- **low → patch** : `handleImportSuccess` (`page.tsx`) positionne `activeStockId` sur le nouveau stock avant même de savoir si le rechargement `GET /api/inventory/stocks` a réussi ; si ce rechargement échoue, `activeStockId` pointe vers un stock absent de `stocks`, et aucun onglet n'apparaît actif. Contrairement à `handleCreateStock`/`handleDuplicateStock`, qui étendent `stocks` de façon synchrone sans second appel réseau. Ne positionner `activeStockId` qu'après un rechargement réussi.
- **low → patch** : le test d'intégration prétend couvrir "400 (fichier vide)" mais ne teste que le cas "en-tête seul" ; un fichier réellement vide (chaîne vide, aucun en-tête) n'est testé qu'au niveau unitaire (`parseStockCsv('')`), jamais via la route HTTP complète. Ajouter un cas de test avec un `File([''])`.
- **false** : `ulId: session.user.ulId || 'default'` (route.ts) — signalé comme un rattachement silencieux à mauvais tenant. Réfuté : `InvStockList.ulId` a `DEFAULT 'default'` au schéma (`stocks.ts` `ensureStockTableExists`), et ce même repli `|| 'default'` est le comportement déjà en place partout ailleurs (`POST /api/inventory`, `POST /api/inventory/stocks`) — comportement d'app reproduit à l'identique, pas une régression introduite ici.
- **false** : incohérence de timestamps signalée entre l'insert `InvItem` (positionne `updatedAt`) et l'insert `InvStockList` (ne positionne ni `createdAt` ni `updatedAt`). Réfuté : l'insert `InvStockList` reproduit exactement le même 4-colonnes `(id, name, ulId, isDefault)` que `POST /api/inventory/stocks/route.ts:79` et les 3 autres inserts de `stocks.ts` (lignes 84, 235, 358) — tous s'appuient uniformément sur les `DEFAULT CURRENT_TIMESTAMP` du schéma, aucune divergence introduite.
- **false** : filtre Papa Parse jugé trop étroit (`type === 'Quotes'` seul traité comme fatal). Réfuté : `@types/papaparse` n'expose que 3 types d'erreur (`Quotes`, `Delimiter`, `FieldMismatch`). `FieldMismatch` est explicitement toléré avec commentaire justificatif ; `Delimiter` ne peut survenir puisque le délimiteur `;` est fixé explicitement (pas de détection automatique). Rien n'est silencieusement ignoré sans justification.
- **low → reject** : absence de limitation de débit (rate limiting) sur les imports volumineux (jusqu'à ~6000 écritures). Rejeté : improbable en usage réel (outil interne, accès restreint aux admins d'une UL, peu nombreux) et le correctif exigerait une infrastructure de rate-limiting inexistante ailleurs dans l'app — hors d'une correction directe.
- **defer** : styles inline (`style={{...}}`) dans `ImportCsvModal.tsx` au lieu d'un CSS Module, contredisant la règle documentée (`src/components/CLAUDE.md` : "Inline styles — only for dynamic values"). Différé : `StockModal.tsx`, `AddItemModal.tsx` et `EditItemModal.tsx` — dont `ImportCsvModal` est la copie assumée — ont exactement le même défaut ; pré-existant, non introduit par ce chantier.
- **defer** : absence de `role="alert"`/`aria-live` sur le bandeau d'erreur et la liste des erreurs de lignes. Différé : aucune modale du dossier `src/components/inventory/modals/` n'a cet attribut ; lacune systémique pré-existante, pas spécifique à cette feature.
- **defer** : absence de garde `if (submitting) return` en tête de `handleSubmit`, risque de double-soumission (double-clic/double-Enter) créant un stock en double. Différé : `StockModal.tsx` (le modèle explicitement imité) a la même absence de garde ; pré-existant.
- **defer** : `src/components/inventory/AGENTS.md` et `modals/AGENTS.md` restent obsolètes (n'incluent pas `ImportCsvModal`/`onOpenImport`). Différé par règle : correctif touchant des fichiers de contexte agent (AGENTS.md).

## Design Notes

**Format CSV attendu :**
- Encodage UTF-8, délimiteur `;` (compatible export Excel FR), première ligne = en-tête.
- Colonnes : `nom` (obligatoire), `categorie` (optionnel), `quantite` (optionnel, entier ≥0, défaut 0), `date_peremption` (optionnel, date ISO `AAAA-MM-JJ`, alimente `InvBatch.expiryDate` si `quantite`>0), `stock_min` (optionnel, entier ≥0), `notes` (optionnel).
- Exemple :
```
nom;categorie;quantite;date_peremption;stock_min;notes
Pansement stérile;Matériel médical;50;2027-06-30;10;
Gants latex M;Protection;200;;;boîte de 100
```

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 warning
- `npx vitest run src/__tests__/unit/csvImport.test.ts src/__tests__/integration/inventory-stock-import.test.ts` -- expected: tous les tests passent
- `npm run build` -- expected: build réussi

**Manual checks (if no CLI):**
- `npm run dev` : upload d'un CSV valide crée le stock et les articles visibles dans l'onglet stock ; upload d'un CSV avec une ligne invalide affiche les erreurs sans créer de stock.
