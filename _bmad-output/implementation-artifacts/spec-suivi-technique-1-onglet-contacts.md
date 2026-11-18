---
title: 'Suivi technique 1/5 — onglet « Suivi technique » et contacts prestataires'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_commit: '1355c0f72ffcf825f972245309e2aca4f51c01cf'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-vehicle-action-tracking/SPEC.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Martine-2026-11-18/EXPERIENCE.md'
  - '{project-root}/src/__tests__/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les responsables véhicule et admins n'ont dans Martine aucun espace de suivi technique ni d'annuaire de prestataires (garages, carrossiers, assureurs, dépanneurs) ; les bonnes adresses d'une UL ne profitent pas aux autres.

**Approach:** Ajouter à `/vehicles` une bascule « 🚗 Flotte / 🔧 Suivi technique » réservée à `canManageVehicles`, avec des sous-onglets ; livrer ici le premier sous-onglet, « Contacts » (CAP-1, CAP-2, CAP-3 de la spec produit) : annuaire de l'UL, partage aux autres UL en lecture seule (« Proposé par l'UL X »), export `.vcf`. Premier des 5 livrables d'une même PR (version 5.55.0).

## Boundaries & Constraints

**Always:**
- Accès API et UI : `canManageVehicles(session.user.roles)` ; UL = `session.user.ulId` (jamais fournie par le client) ; contrôle d'appartenance via `isOutsideUl`. INACTIF bloqué (déjà inclus dans `canManageVehicles`).
- Un contact appartient à une UL ; seule cette UL le modifie, le supprime ou change son partage. Un contact partagé est lisible et exportable par les responsables de toutes les UL.
- Contact : nom (requis, ≤ 120), catégorie parmi GARAGE, CARROSSERIE, ASSURANCE, DEPANNAGE, AUTRE ; 1 à 5 téléphones `{label ≤ 40, number}` (au moins un requis), e-mail facultatif (validé), adresse et notes facultatives (≤ 500), `shared` booléen (défaut faux).
- Export vCard 3.0 RFC 2426 avec échappement de `\`, `,`, `;` et retours ligne ; contacts de l'UL puis partagés, ces derniers suffixés « (UL <nom>) » dans `FN` ; `CATEGORIES` = libellé de catégorie ; numéros nettoyés `[^\d+]`.
- Toute écriture passe par `withAudit` ; nouvelles routes ajoutées au catalogue MCP.
- Schéma : DDL partagé, migration prod idempotente `scripts/add-fleet-tracking.ts` (dry-run par défaut, `--apply`), ajoutée au CLAUDE.md racine ; tables créées aussi en dev et en tests.
- Version 5.55.0 (package.json + package-lock.json) et entrée CHANGELOG « ✨ Nouveautés » en français orienté utilisateur.

**Never:**
- Pas de copie d'un contact partagé dans l'annuaire local ; pas de modification d'un contact d'une autre UL.
- Pas d'entrée de menu ni de `MenuSetting` ; pas d'autres sous-onglets que Contacts dans ce livrable (Tâches, Dossiers, Contrôles, Vue d'ensemble viendront ensuite).
- Ne pas toucher `/api/vcard` (annuaire Aide).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Liste | RESP_VEHICULE UL A ; contacts A (1 partagé, 1 non), B (1 partagé, 1 non) | `own` = 2 contacts de A ; `shared` = 1 contact de B avec `ulName` | N/A |
| Création | POST valide | 201, contact dans l'UL de session, `shared` faux par défaut | N/A |
| Création invalide | sans téléphone / catégorie inconnue / champ inconnu | 400 `{error}` | Zod `.strict()` |
| Rôle insuffisant | CHVL ou INACTIF | 403 sur toutes les routes | N/A |
| Non connecté | pas de session | 401 | N/A |
| Contact d'une autre UL | PATCH/DELETE d'un contact de B (partagé ou non) par A | 403 | N/A |
| Inexistant | PATCH/DELETE id inconnu | 404 | N/A |
| Partage retiré | B passe `shared` à faux | disparaît de `shared` pour A et de son export | N/A |
| Export | GET vcf | `text/vcard`, pièce jointe, échappement correct, partagés suffixés | N/A |
| SUPER_ADMIN | session UL A | voit et gère comme un responsable de A | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/roles.ts:169` -- `canManageVehicles` : garde unique du module.
- `src/lib/apiAuth.ts` -- `unauthorizedResponse`, `forbiddenResponse`, `isOutsideUl(roles, sessionUlId, resourceUlId)`.
- `src/lib/uniforms/schemas.ts` -- `activeUlId(ulId)` et `parseBody(request, schema)` (400 `{error:'Corps invalide'}`) : à généraliser/copier dans `src/lib/fleetTracking/`.
- `src/lib/audit/log.ts:228` -- `withAudit(handler, { action, entityType?, idParam? })` ; GET non enveloppé.
- `src/lib/vehicleDocuments/schema.ts` -- modèle de DDL partagé (`CREATE TABLE IF NOT EXISTS`, constantes exportées).
- `scripts/add-vehicle-documents.ts`, `scripts/add-uniforms.ts` -- modèle de migration (dotenv, createClient Turso, dry-run, `db.batch(..., 'write')`, vérification, exit 1).
- `scripts/setup-dev.ts` -- exécuter le nouveau DDL (dev).
- `src/__tests__/integration/setup.ts` -- `createTables()` (~l.415) et `truncateTables()` : ajouter la table ; seeds `seedUniteLocale`, `seedUser`, `seedRoles`, `seedUserRole`, `seedUserUL`.
- `src/app/api/uniforms/items/route.ts` -- route de référence GET/POST avec Zod et cloisonnement UL.
- `src/app/api/vcard/route.ts` -- en-têtes de réponse vCard à reproduire (sans son absence d'échappement).
- `src/app/vehicles/page.tsx:84-110` -- en-tête et bascule Vue UL / Vue DT ; `isAdmin = canManageVehicles(userRoles)` déjà calculé ; `useDtFilters.ts` montre l'écriture d'URL (`router.replace(..., {scroll:false})`).
- `src/components/uniforms/UniformTabs.tsx` -- modèle d'onglets (`role="tablist"`, `LABELS`, `{tabs, active, onSelect}`) ; le visuel cible est `.tab-bar` / `.tab-btn` de `globals.css`.
- `src/lib/mcp/catalog.generated.ts` -- régénérer via `npm run mcp:catalog` (test `src/__tests__/unit/mcp-catalog.test.ts`).
- `src/__tests__/integration/uniforms-catalog.test.ts`, `src/__tests__/components/UniformManagement.test.tsx` -- modèles de tests.
- Maquette : `_bmad-output/planning-artifacts/ux-designs/ux-Martine-2026-11-18/mockups/suivi-technique.html` (écrans 1 et 6).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/fleetTracking/schema.ts` -- DDL `FleetContact` (id TEXT PK, ulId, name, category, phones JSON TEXT, email, address, notes, shared INTEGER 0/1, createdBy, createdAt, updatedAt) + index `(ulId)` et `(shared)` ; export d'une liste `FLEET_TRACKING_DDL` que les livrables suivants compléteront.
- [x] `src/lib/fleetTracking/access.ts` + `contacts.ts` -- garde commune (session → 401, `canManageVehicles` → 403, UL active requise) ; schémas Zod `.strict()` ; libellés de catégorie ; générateur vCard avec échappement.
- [x] `src/app/api/fleet-tracking/contacts/route.ts` -- GET `{ own, shared }` (partagés des autres UL avec `ulName`, triés par nom) ; POST (withAudit « Création d'un contact prestataire »).
- [x] `src/app/api/fleet-tracking/contacts/[id]/route.ts` -- PATCH (partiel, y compris `shared`) et DELETE, réservés à l'UL propriétaire (withAudit).
- [x] `src/app/api/fleet-tracking/contacts/vcard/route.ts` -- GET export `.vcf` (`Prestataires_<UL>.vcf`).
- [x] `scripts/add-fleet-tracking.ts`, `scripts/setup-dev.ts`, `src/__tests__/integration/setup.ts` -- création des tables partout (migration idempotente, dry-run/`--apply`, vérification).
- [x] `src/components/fleetTracking/` -- `FleetTrackingPanel` (sous-onglets, seul « Contacts » visible pour l'instant), `ContactsTab` (recherche, filtres de catégorie, cartes, interrupteur de partage, section « Prestataires proposés par d'autres UL » en lecture seule avec pastille « Proposé par l'UL X », bouton « Exporter vers le téléphone »), `ContactFormModal` ; CSS Modules, variables de `globals.css`, téléphones en liens `tel:`.
- [x] `src/app/vehicles/page.tsx` -- bascule « 🚗 Flotte / 🔧 Suivi technique » visible si `canManageVehicles` et hors Vue DT, état dans l'URL (`?vue=suivi&onglet=contacts`) ; en mode suivi, le panneau remplace le contenu flotte.
- [x] Tests -- intégration des 3 routes (toutes les lignes de la matrice) ; unitaires de l'échappement vCard ; composant `ContactsTab` (affichage des deux sections, lecture seule des partagés, bascule de partage).
- [x] `npm run mcp:catalog`, `package.json`/`package-lock.json` 5.55.0, `CHANGELOG.md`, ligne de migration dans le `CLAUDE.md` racine (« À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.55.0 »), `AGENTS.md` des nouveaux dossiers.

**Acceptance Criteria:**
- Given un RESP_VEHICULE sur `/vehicles`, when il clique « 🔧 Suivi technique », then l'URL porte `vue=suivi` et l'onglet Contacts s'affiche ; un CHVL ne voit pas la bascule.
- Given un contact partagé par une autre UL, when il est affiché, then aucune action d'édition n'est proposée.
- Given le fichier exporté, when on l'importe dans un téléphone, then chaque contact a son nom, ses numéros et son e-mail.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Route / preuve |
|---|---|---|---|---|
| 1 | verification-gap | Soumission création/édition/suppression de `ContactFormModal` non testée | medium | patch — aucun test ne remplit le formulaire |
| 2 | verification-gap | `scripts/add-fleet-tracking.ts` non exécuté par un test | medium | patch — modèle `add-mcp-tokens.test.ts` |
| 3 | verification-gap | Câblage de la bascule dans `/vehicles/page.tsx` non testé | medium | defer — pas de harnais de page, l'API garde l'accès |
| 4 | blind | vCard sans `UID` : réimport = doublons | medium | patch — vérifié `contactToVCard` l.119-122 |
| 5 | blind / edge | Lignes vCard non repliées à 75 octets | low | rejeté — notes longues rares, importeurs iOS/Android tolèrent |
| 6 | blind | Prestataire exporté comme personne (pas d'`ORG`) | low | patch — ajout direct `ORG` |
| 7 | blind | Notes privées visibles des autres UL une fois partagé | medium | patch — avertissement dans l'interrupteur/modale |
| 8 | blind / edge | UL supprimée : contacts partagés orphelins sans nom d'UL | medium | patch — `INNER JOIN UniteLocale` sur les partagés (vérifié `LEFT JOIN` l.50) |
| 9 | blind | Écriture sans `AND ulId = ?` (écart vérification/écriture) | low | patch — correction directe |
| 10 | blind | Échec d'export télécharge un JSON ; annuaire vide = .vcf vide | medium | patch — export par fetch + message |
| 11 | blind | Recherche ignore téléphones et e-mail | low | patch — ajout direct |
| 12 | blind / edge | `vue=suivi` conservé/perdu au passage Vue UL/DT | medium | patch — bascule UL/DT masquée en mode suivi (vérifié page.tsx l.99-114) |
| 13 | blind / edge | Date « Mis à jour » sans année | low | patch |
| 14 | blind | `access.ts` sans tests unitaires | medium | patch |
| 15 | blind | Pas de test d'écriture `AuditLog` | low | rejeté — `withAudit` déjà testé globalement |
| 16 | blind | Migration sans `--env` | low | patch — convention des migrations récentes (vérifié `add-mission-report-edits.ts`) |
| 17 | blind | `src/app/vehicles/AGENTS.md` non mis à jour | low | defer — fichier de contexte agent |
| 18 | blind | Focus initial sur ✕ au lieu de Nom | low | patch |
| 19 | blind | Compteur de section ignore le filtre | low | patch |
| 20 | blind | Index `shared` peu sélectif | low | rejeté — volumétrie faible |
| 21 | edge | Double clic sur le partage : requêtes concurrentes | low | patch — désactiver pendant la requête |
| 22 | edge | PATCH après suppression concurrente → 200 `contact: null` | low | patch |
| 23 | edge | 404 dans la modale sans rafraîchir la liste | low | patch |
| 24 | edge | Fermeture de la modale pendant l'enregistrement | low | patch |
| 25 | edge | Réponse 200 sans tableaux → plantage | low | rejeté — improbable |
| 26 | edge | « Aucun contact » affiché sous une erreur de chargement | low | patch |
| 27 | edge | Ligne avec libellé sans numéro supprimée sans prévenir | low | patch |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 warning
- `npx vitest run src/__tests__/integration/fleet-tracking-contacts.test.ts src/__tests__/unit src/__tests__/components` -- expected: tout passe
- `npm run test` -- expected: suite complète verte
