---
title: 'Rôle « Responsable inventaire » (RESP_INVENTAIRE)'
type: 'feature'
created: '2026-11-01'
status: 'done'
baseline_commit: 'be859b13369a9d6c21074dd2950bde7e7687964d'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Seuls ADMIN et SUPER_ADMIN peuvent administrer l'inventaire (articles, lots, mouvements, stocks, import CSV, QR). Une UL ne peut pas confier l'inventaire à un bénévole sans lui donner tous les droits d'administration.

**Approach:** Nouveau rôle `RESP_INVENTAIRE` (« Responsable inventaire ») et prédicat `canManageInventory` = `isAdminOrAbove || RESP_INVENTAIRE`, sur le modèle exact de `RESP_UNIFORME` / `canManageUniforms` : droits d'un ADMIN sur l'inventaire de son UL, aucun autre droit.

## Boundaries & Constraints

**Always:** `canManageInventory` enveloppé par `denyWhenInactive` ; cloisonnement par UL inchangé (le RESP_INVENTAIRE n'agit que sur les stocks de son UL, comme l'ADMIN) ; le menu Inventaire réglé « Admin uniquement » reste visible au responsable inventaire ; ordre des gardes du `DELETE qr-token` conservé (session → `isQrBlocked` → UL → rôle).
**Décision (modifiable à la validation) :** le responsable inventaire reçoit le résumé quotidien de stock (péremptions / stock minimum) avec les ADMIN, comme le responsable véhicule reçoit les alertes véhicule.

**Never:** ajouter RESP_INVENTAIRE à `isAdminOrAbove`, `canAccessAdminPanel` ou `isReadOnlyManager` ; toucher aux routes de consommation `/api/qr-stock/[token]/*` ; script de migration (la ligne `Role` est auto-créée par `GET /api/users` via `MANAGEABLE_ROLES`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Écriture inventaire | RESP_INVENTAIRE, POST/PATCH/DELETE `/api/inventory`, adjust, batches, stocks, duplicate, import | 2xx comme un ADMIN | N/A |
| Autre UL | RESP_INVENTAIRE sur un stock/article d'une autre UL | Refus identique à l'ADMIN (403/404 existants) | inchangé |
| Inactif | `['RESP_INVENTAIRE','INACTIF']` | 403 partout | inchangé |
| Hors périmètre | RESP_INVENTAIRE sur `/api/users`, véhicules, uniformes, panneau admin | Refusé | inchangé |
| Régénération QR stock | RESP_INVENTAIRE, `DELETE /api/inventory/stocks/[id]/qr-token` | 200 ; bouton « Régénérer » visible | INACTIF → 403 |

</frozen-after-approval>

## Code Map

- `src/lib/roles.ts` -- ajouter `ROLES.RESP_INVENTAIRE`, label, position dans `MANAGEABLE_ROLES` juste après `RESP_UNIFORME`, et `canManageInventory` (doc-comment calqué sur `canManageUniforms`).
- `src/lib/menuVisibility.ts` -- ajouter `canSeeInventoryMenu` (comme `canSeeUniformsMenu`).
- `src/app/api/inventory/{route,adjust/route,batches/route,stocks/route,stocks/duplicate/route,stocks/import/route}.ts` -- `isAdminOrAbove` → `canManageInventory` sur les gardes d'écriture uniquement.
- `src/app/api/inventory/stocks/[id]/qr-token/route.ts` -- `DELETE` : `canAccessAdminPanel || canManageInventory`.
- `src/app/inventory/page.tsx` (l.109 `isAdmin`), `src/components/inventory/modals/ItemBatchesModal.tsx` (l.25), `StockQRCodeModal.tsx` (l.206) -- gardes UI.
- `src/components/Navbar.tsx` (l.137) -- lien Inventaire : `(canAccessAdminPanel || canManageInventory) && canSeeInventoryMenu(...)`.
- `src/app/api/cron/daily-alerts/route.ts` (~l.139, `roles: ['ADMIN']` du résumé de stock) -- ajouter `ROLES.RESP_INVENTAIRE`.
- Câblage rôle (reprendre le diff de `3904699` pour RESP_UNIFORME) : `src/auth.ts` (DEV_USERS `respinventaire`), `src/app/login/page.tsx` (DEV_ROLES), `src/components/users/RoleLegend.tsx`, `src/lib/demo/fetchInterceptor.ts`, `scripts/ensure-system-roles.ts`, `scripts/setup-dev.ts` (id `role-resp_inventaire`, compte `respinventaire@dev.local`), `scripts/seed-preview-users.{ts,sql}`, `src/__tests__/integration/setup.ts` (`seedRoles`).
- Docs : `CLAUDE.md` (liste des rôles), `AGENTS.md`, `src/AGENTS.md`, `src/components/users/AGENTS.md`, `e2e/AGENTS.md`, AGENTS.md de `src/app/api/inventory/**`, `src/app/inventory/`, `src/components/inventory/modals/`.
- Ne PAS modifier : `src/app/api/qr-stock/**`, `isAdminOrAbove`, `canAccessAdminPanel`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/roles.ts` + `src/lib/menuVisibility.ts` -- rôle, label, prédicats.
- [x] Routes API inventaire + qr-token -- remplacer les gardes d'écriture.
- [x] Page, modales, Navbar -- gardes UI.
- [x] `daily-alerts` -- destinataires du résumé de stock.
- [x] Câblage dev/preview/demo/legend/seed -- comme RESP_UNIFORME.
- [x] Tests : `roles.test.ts` (déclaration, matrice `canManageInventory`, aucun autre droit, ajout aux listes DENIED existantes), `menuVisibility.test.ts`, intégration inventaire (RESP_INVENTAIRE 2xx sur POST item / adjust / stocks, 403 si INACTIF, refus autre UL), qr-token DELETE, `Navbar.test.tsx`.
- [x] `package.json` / `package-lock.json` → 5.36.0, entrée `CHANGELOG.md` (FR, orientée utilisateur), docs.

**Acceptance Criteria:**
- Given un compte RESP_INVENTAIRE seul, when il ouvre l'app, then il voit le menu Inventaire et toutes les actions de gestion (nouvel article, quantités, lots, stocks, import, régénération QR), et ne voit ni Administration ni actions véhicule/uniforme.
- Given un administrateur dans Gestion des utilisateurs, when il édite un compte, then « Responsable inventaire » est proposé et légendé.
- Given le cron daily-alerts avec un lot proche de péremption, when il tourne, then le résumé part aussi aux RESP_INVENTAIRE de l'UL.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / Routage |
|---|--------|---------|---------|------------------|
| 1 | verification-gap, edge-case, blind | PATCH/DELETE `/api/inventory`, PATCH/DELETE batches, DELETE stocks, duplicate, import non testés pour RESP_INVENTAIRE | medium | Aucun test n'échoue si l'une de ces gardes revient à `isAdminOrAbove` → patch |
| 2 | verification-gap | `StockQRCodeModal` / `ItemBatchesModal` jamais rendus avec `['RESP_INVENTAIRE']` | medium | Tests composants ADMIN/CHVL seulement → patch |
| 3 | blind | Créations (item, stock) sans vérification de `ulId` ; assertion stock en plage 2xx | low | Correction directe dans le test → patch |
| 4 | blind | Commentaire « 13 rôles gérables » obsolète dans `roles.test.ts` | low | Désormais 14 → patch |
| 5 | blind | Commentaires de `qr-token/route.ts` ne citent que `canAccessAdminPanel` | low | Code ≠ commentaire → patch |
| 6 | blind | Couleur `#f59e0b` quasi identique au jaune CADRE `#eab308` | low | Badges confondus → patch (couleur distincte) |
| 7 | blind | `['ADMIN', ROLES.RESP_INVENTAIRE]` mélange littéral et constante | low | Correction directe → patch |
| 8 | blind | `package-lock.json` non incrémenté | false | Les deux champs `version` valent 5.36.0 |
| 9 | blind | Ligne `Role` absente en prod avant ouverture de GET /api/users | false | L'attribution passe par l'écran utilisateurs, qui appelle GET /api/users (auto-seed `MANAGEABLE_ROLES`) avant toute écriture |
| 10 | blind | Prédicat `canAccessAdminPanel || canManageInventory` dupliqué (route + modale) ; PRESIDENT/CADRE peuvent régénérer | low | Rejeté : correctif = nouvelle surface publique ; droit PRESIDENT/CADRE préexistant |
| 11 | blind | Variable/prop `isAdmin` signifie désormais `canManageInventory` | low | Rejeté : renommage de prop `StockTabs` au-delà d'une correction directe, risque faible |
| 12 | blind | Résumé quotidien vérifié seulement via mock | low | Rejeté : `push.ts` traite les rôles génériquement (LIKE CSV), inchangé |
| 13 | blind | Navbar non testée pour INACTIF / autres réglages | low | Rejeté : couvert par `canManageInventory` (unit) et `canSeeInventoryMenu` (unit) |
| 14 | blind | Pas d'E2E pour RESP_INV | low | Rejeté : couverture unit + intégration suffisante, coût élevé |
| 15 | blind | Changelog : menu visible aussi en « Disponible » ; MenusTab cite un « onglet Inventaire sur la fiche véhicule » inexistant | low | Changelog : rejeté (l'accès au menu est décrit) ; MenusTab : préexistant → defer |
| 16 | edge-case | Comptes INACTIF reçoivent quand même le résumé de stock | medium | Réel mais préexistant : la requête de `push.ts` n'exclut pas INACTIF, pour ADMIN aussi → defer |
| 17 | edge-case | RESP_INVENTAIRE global (`UserRole`) vaut dans toutes les UL à rôles CSV vides ; idem pour le résumé | false | Repli global identique pour ADMIN/RESP_UNIFORME, conforme à « comme l'ADMIN » |
| 18 | edge-case | Session sans `ulId` → écriture dans le seau `default` | low | Rejeté : comportement préexistant de l'ADMIN, sessions sans UL rares |

## Verification

**Commands:**
- `npm run lint` -- 0 erreur, 0 avertissement
- `npm run test` -- suite verte (incl. test d'énumération INACTIF de `roles.test.ts`)
- `npm run build` -- succès
