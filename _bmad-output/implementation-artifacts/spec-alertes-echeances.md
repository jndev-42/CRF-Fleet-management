---
title: 'Alertes d''échéance quotidiennes — désinfection VPSP et stock'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_commit: '2477098b8b8bc3720aae401d06bca53f71c2e0e6'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/src/__tests__/CLAUDE.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les échéances déjà calculées par l'appli (prochaine désinfection VPSP, péremption des lots, stock minimum) ne préviennent personne : il faut ouvrir la fiche du véhicule ou l'inventaire pour les voir.

**Approach:** Un nouveau cron quotidien du matin détecte les échéances qui franchissent un seuil et envoie une notification (in-app + push) aux bonnes personnes, une seule fois par étape et par échéance, grâce à une table qui mémorise les alertes déjà envoyées.

## Boundaries & Constraints

**Décisions :**
- *Horaire* : nouveau cron `/api/cron/daily-alerts` à `0 6 * * *` UTC (7h-9h à Paris ; plan Vercel gratuit : 100 crons, une exécution par jour, précision ±59 min). Le cron de nuit existant n'est pas modifié.
- *Désinfection* (véhicules `desinfTracking = 1` avec `nextDesinfMaxDate`) : une alerte « bientôt due » quand l'échéance est à 14 jours ou moins (seuil orange de l'appli), une alerte « dépassée » quand elle est passée. Destinataires : ADMIN + SUPER_ADMIN + CHVPSP de l'UL du véhicule. Une notification par véhicule, lien `/vehicles/<nom encodé>`. Si l'échéance est déjà dépassée à la première détection, seule l'alerte « dépassée » part.
- *Stock* : un lot (`InvBatch`, `quantity > 0`) qui passe à un mois ou moins de sa péremption (seuil de la page « bientôt périmés »), un lot périmé, un produit (`InvItem`) sous son `minStock`. Destinataires : ADMIN + SUPER_ADMIN de l'UL du produit. **Un résumé par UL et par jour**, avec seulement les nouveautés (ex. « 3 lots bientôt périmés, 1 périmé, 2 produits sous le stock minimum », puis les premiers noms), lien `/inventory`.
- *Une seule alerte par étape et par échéance* : une nouvelle date d'échéance (désinfection faite, nouveau lot) relance le cycle ; un produit repassé au-dessus de son minimum puis retombé en dessous déclenche une nouvelle alerte. Pas de relance périodique.
- « Aujourd'hui » s'entend au jour de Paris (`parisToday`).

**Always:** in-app + push via `src/lib/push.ts` ; même authentification `CRON_SECRET` que le cron existant ; une erreur sur un véhicule ou une UL n'empêche pas les autres ; aucun envoi si rien de nouveau.

**Never:** modification du cron de nuit ; rappel de réservation ; nouvelle page ou nouveau rôle ; relance hebdomadaire.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Désinf J-10 | VPSP suivi, échéance dans 10 j, jamais alerté | 1 notif « bientôt due » aux ADMIN/SUPER_ADMIN/CHVPSP de l'UL | N/A |
| Désinf rejouée | même état, cron du lendemain | aucune notification | N/A |
| Désinf dépassée | échéance hier, « bientôt due » déjà envoyée | 1 notif « dépassée » | N/A |
| Nouvelle échéance | désinfection faite → nouvelle date à +3 mois | aucune alerte avant J-14 de la nouvelle date | N/A |
| Véhicule non suivi | `desinfTracking = 0` | rien | N/A |
| Stock, une UL | 2 lots < 1 mois, 1 produit sous minimum | 1 résumé aux ADMIN/SUPER_ADMIN de l'UL | N/A |
| Stock réapprovisionné puis retombé | min repassé puis re-franchi | nouvelle alerte | N/A |
| Rien de nouveau | toutes les échéances déjà alertées | aucune notification, réponse 200 | N/A |
| Secret invalide | `CRON_SECRET` défini, en-tête faux | 401 | N/A |

</frozen-after-approval>

## Code Map

- `src/app/api/cron/daily-mileage-check/route.ts:11-14` -- modèle d'authentification `CRON_SECRET` (`unauthorizedResponse`) et d'isolement par élément (try/catch) ; ne pas modifier.
- `vercel.json` -- un seul cron (`59 23 * * *`) ; ajouter le nouveau.
- `src/lib/push.ts` -- `sendPushNotification({roles, headings, contents, url, ulId})` ; `'ADMIN'` couvre ADMIN + SUPER_ADMIN ; ciblage par UL via `UserUL.roles` (repli sur les rôles globaux). Ajouter `'CHVPSP'` aux rôles pour la désinfection.
- Désinfection : colonnes `Vehicle.desinfTracking`, `nextDesinfMaxDate` (`YYYY-MM-DD`), `ulId`, `name` ; seuil 14 j dans `src/app/vehicles/[id]/VehicleDetailGrid.tsx:100-125`.
- Stock : `InvBatch(itemId, quantity, expiryDate YYYY-MM-DD)`, `InvItem(name, quantity, minStock, ulId)` ; requêtes de référence `src/app/api/inventory/expiring-soon/route.ts:17-29` (+1 mois) et `low-stock/route.ts:18` (`quantity < minStock`).
- `src/lib/themes/catalog.ts:51-58` -- `parisToday()`.
- Modèle de schéma partagé : `src/lib/push/schema.ts` + `scripts/add-push-subscriptions.ts` + `scripts/setup-dev.ts` + `src/__tests__/integration/setup.ts`.
- Tests de cron : `src/__tests__/integration/cron-daily-mileage-check.test.ts` (appel direct de `GET`, `CRON_SECRET` sauvegardé/restauré).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/alerts/schema.ts` + `scripts/add-scheduled-alerts.ts` + `setup-dev.ts` + `integration/setup.ts` -- table `ScheduledAlert(key PRIMARY KEY, sentAt)` ; migration dry-run / `--apply`.
- [x] `src/lib/alerts/` -- détection pure (désinfection, stock) à partir de `parisToday()`, clés d'alerte (`desinf-soon:<vehicleId>:<date>`, `desinf-overdue:…`, `batch-soon:<batchId>:<date>`, `batch-expired:…`, `item-low:<itemId>`), réinitialisation des clés `item-low` des produits revenus au-dessus du minimum, purge des clés de plus de 400 jours.
- [x] `src/app/api/cron/daily-alerts/route.ts` -- GET authentifié, envoi des notifications, enregistrement des clés uniquement après envoi, réponse `{success, desinfAlerts, stockDigests}`.
- [x] `vercel.json` -- cron `/api/cron/daily-alerts` à `0 6 * * *`.
- [x] Tests -- unitaires de la détection et des clés ; intégration de la route couvrant la matrice (401, rejoue sans doublon, stock par UL, réinitialisation `item-low`).
- [x] `CLAUDE.md` (migration à exécuter avant la v5.29.0), `CHANGELOG.md` (5.29.0), `package.json` + lock, AGENTS.md concernés.

**Acceptance Criteria:**
- Given la table absente en base, when le cron s'exécute, then il répond 500 sans envoyer de notification partielle (la migration est documentée comme préalable au déploiement).
- Given deux UL avec des lots bientôt périmés, when le cron s'exécute, then chaque UL reçoit son propre résumé, limité à ses ADMIN/SUPER_ADMIN.

## Verification

**Commands:**
- `npm run lint` -- 0 erreur, 0 avertissement
- `npm run test` -- vert
- `npm run build` -- succès
