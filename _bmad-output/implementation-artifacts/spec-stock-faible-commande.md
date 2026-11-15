---
title: 'Inventaire — marquer « commandé » un article en stock faible'
type: 'feature'
created: '2026-11-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '71bb589c96a6a956f7454f105f6e93531d450c33'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dans le récapitulatif « Stock faible » de l'inventaire, rien n'indique quels articles le responsable inventaire a déjà commandés : impossible de savoir où il en est.

**Approach:** Ajouter sur chaque ligne du récap un indicateur « Commandé » (avec sa date) que les gestionnaires de l'inventaire (`canManageInventory` : SUPER_ADMIN, ADMIN, RESP_INVENTAIRE) peuvent poser et retirer. Purement visuel : aucun effet sur les quantités, les lots, l'historique de stock ni les alertes quotidiennes.

**Décision (remise à zéro) :** automatique — le cron quotidien `daily-alerts` efface `orderedAt` des articles qui ne sont plus en stock faible (repassés au-dessus du minimum ou minimum retiré) ; une nouvelle baisse repart sans badge. Le responsable peut aussi le retirer à la main.

## Boundaries & Constraints

**Always:** cloisonnement par `ulId` de la session (même règle que le GET existant) ; écriture tracée par `withAudit` ; Zod sur le corps ; SQL paramétré ; les autres rôles voient l'indicateur en lecture seule ; le clic sur l'indicateur ne déclenche pas l'ouverture des lots de la ligne.

**Never:** toucher `quantity`, `InvBatch`, `InvStockLog` ; modifier le contenu ou l'envoi du résumé quotidien (`src/lib/alerts/detect.ts`) — le cron ne fait qu'effacer le drapeau ; ajouter l'indicateur ailleurs que dans le récap Stock faible (liste principale, page QR stock).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Marquer | gestionnaire, `PATCH {itemId, ordered:true}` sur article de son UL | `orderedAt = CURRENT_TIMESTAMP`, 200 `{ orderedAt }` ; badge « 🚚 Commandé le JJ/MM » | N/A |
| Retirer | `ordered:false` | `orderedAt = NULL`, 200 | N/A |
| Non gestionnaire | CHVL | 403 | bouton absent côté UI |
| Autre UL / inconnu | itemId d'une autre UL | 404 | message d'erreur dans la modale |
| Corps invalide | `ordered` absent ou non booléen | 400 | N/A |
| Sans session | — | 401 | N/A |

</frozen-after-approval>

## Code Map

- `src/app/api/inventory/low-stock/route.ts` -- GET existant (ajouter `orderedAt` au SELECT) ; y ajouter le `PATCH` (fichier existant, pas de nouvelle route) avec `withAudit(handler, { action: "Marquage « commandé » d'un article en stock faible", entityType: 'inventoryItem' })`, calqué sur `src/app/api/inventory/route.ts:150-229` (auth → `canManageInventory` → Zod → `UPDATE … WHERE id = ? AND ulId = ?`, `rowsAffected === 0` → 404).
- `src/components/inventory/modals/LowStockModal.tsx` -- récap ; ajouter colonne « Commande » + prop `canManage: boolean` ; bouton bascule avec `e.stopPropagation()` (la ligne entière ouvre les lots) ; mise à jour optimiste locale, rollback + message si échec.
- `src/components/inventory/modals/LowStockModal.module.css` -- styles du badge/bouton (variables CSS globales, mode sombre).
- `src/app/inventory/page.tsx:619` -- passer `canManage={isAdmin}` au montage de `LowStockModal`.
- `scripts/add-inventory-ordered-at.ts` -- nouvelle migration prod `ALTER TABLE "InvItem" ADD COLUMN "orderedAt" DATETIME` ; modèle : `scripts/add-stock-qr-token.ts` (PRAGMA table_info, dry-run, `--apply`, vérification).
- `src/app/api/cron/daily-alerts/route.ts:~90` -- après le calcul des clés périmées, un `UPDATE "InvItem" SET orderedAt = NULL WHERE orderedAt IS NOT NULL AND (minStock IS NULL OR quantity >= minStock)` (toutes UL ; erreur journalisée sans bloquer les alertes).
- `src/__tests__/integration/setup.ts:238` -- ajouter `orderedAt DATETIME` au schéma de test ; `seedInvItem` accepte `orderedAt`.
- `src/lib/mcp/catalog.generated.ts` -- régénérer (`npm run mcp:catalog`) : `low-stock` gagne `PATCH`.
- `CLAUDE.md` -- ligne de commande de la migration (« À EXÉCUTER AVANT LE DÉPLOIEMENT de la vX ») ; `CHANGELOG.md` + `package.json`/`package-lock.json` (version mineure).
- Ne pas toucher : `scripts/setup-dev.ts` (son `InvItem` n'a déjà ni `quantity` ni `minStock`, hors sujet).

## Tasks & Acceptance

**Execution:**
- [x] `scripts/add-inventory-ordered-at.ts` -- migration idempotente dry-run/--apply -- colonne absente en prod sinon GET/PATCH 500
- [x] `src/__tests__/integration/setup.ts` -- colonne + seed -- tests
- [x] `src/app/api/inventory/low-stock/route.ts` -- `orderedAt` au GET + `PATCH` -- persistance
- [x] `src/components/inventory/modals/LowStockModal.tsx` (+ `.module.css`) -- colonne, badge, bascule -- UI
- [x] `src/app/inventory/page.tsx` -- prop `canManage` -- droits
- [x] `src/__tests__/integration/inventory-low-stock.test.ts` -- PATCH 401/403/400/404/200 (marquer puis retirer), GET renvoie `orderedAt`, quantité inchangée
- [x] `src/app/api/cron/daily-alerts/route.ts` + `src/__tests__/integration/cron-daily-alerts.test.ts` -- effacement auto ; test : article repassé au-dessus → `orderedAt` NULL, article toujours bas → conservé
- [x] `src/__tests__/components/LowStockModal.test.tsx` -- bouton visible si `canManage`, absent sinon (badge lecture seule), clic n'ouvre pas les lots, appel PATCH
- [x] `src/lib/mcp/catalog.generated.ts`, `CLAUDE.md`, `CHANGELOG.md`, `package.json`, `package-lock.json` -- catalogue, doc migration, version

**Acceptance Criteria:**
- Given un article marqué commandé, when on rouvre le récap, then le badge et sa date sont toujours affichés.
- Given un article marqué commandé, when on consulte la quantité, les lots et l'historique, then rien n'a changé.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Constat | Verdict | Preuve / route |
|---|---------|---------|----------------|
| 1 | Date affichée décalée d'un jour (UTC lu tel quel) entre 0 h et 1-2 h, heure de Paris | medium | `CURRENT_TIMESTAMP` et `toISOString()` sont en UTC ; `formatOrderedDay` découpe la chaîne → patch |
| 2 | Le retrait du repère (`ordered:false`) n'est pas testé côté composant | medium | les 3 tests cliquent seulement `i2` → patch |
| 3 | Pas d'`aria-pressed` sur la bascule | low | correction directe d'un attribut → patch |
| 4 | Le changelog promet qu'« une nouvelle baisse repart sans repère » ; ce n'est vrai qu'après un passage du cron | low | remise à zéro quotidienne, décision gelée → patch de la formulation |
| 5 | Le script de migration n'accepte pas `--env` (preview) | low | les migrations récentes l'acceptent (`add-mission-report-edits.ts:34`) → patch |
| 6 | Passer `canManage` depuis la page n'est couvert par aucun test | low | aucun outillage de test pour la page → defer |
| 7 | `setup-dev.ts` : `InvItem` sans `orderedAt` | low | existait déjà : ce schéma n'a ni `quantity` ni `minStock` → defer |
| 8 | Audit : `entityId` nul, même libellé pour poser et retirer | low | même convention que `PATCH /api/inventory` (id dans le corps, `route.ts:229`) ; corriger demanderait une nouvelle option dans `withAudit` → rejeté |
| 9 | Double clic rapide, bouton non désactivé | low | les deux requêtes envoient `ordered:true`, l'état final reste juste ; la garde ajouterait un état → rejeté |
| 10 | Un `PATCH` sur un article qui n'est pas en stock faible enregistre un repère invisible | low | inaccessible depuis l'interface, effacé par le cron → rejeté |
| 11 | Article supprimé entre l'`UPDATE` et le `SELECT` | low | concurrence négligeable → rejeté |
| 12 | La remise à zéro est sautée si une étape précédente du cron échoue | low | structure existante ; dans ce cas tout le cron échoue de toute façon → rejeté |
| 13 | Tests de route manquants (JSON invalide, INACTIF, ADMIN, ligne d'audit) | low | INACTIF et ADMIN déjà couverts par les tests de `canManageInventory` → rejeté |
| 14 | Tests du cron : borne `==`, autre UL, échec de l'`UPDATE` | low | le `>=` est trivial → rejeté |
| 15 | Couleur `#fff` codée en dur sur `--status-available` | low | cosmétique → rejeté |
| 16 | La mise à jour optimiste masque la réponse du serveur dans le test ; le test lecture seule est imprécis | low | effet visible nul → rejeté |
| 17 | `RETURNING` éviterait le second `SELECT` | low | optimisation → rejeté |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 avertissement
- `npx vitest run src/__tests__/integration/inventory-low-stock.test.ts src/__tests__/components/LowStockModal.test.tsx src/__tests__/unit/mcp-catalog.test.ts` -- expected: vert
- `npm run test` -- expected: vert
