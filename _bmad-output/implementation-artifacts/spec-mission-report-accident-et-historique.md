---
title: 'Compte rendu de mission — accident bénévole, rôle « Responsable mission » et alertes, modification après envoi avec historique'
type: 'feature'
created: '2026-11-01'
status: 'done'
baseline_commit: 'd6c212ae6c444660d4ae5720ceceaa2426fc668a'
route: 'dispatch'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** Le compte rendu de mission ne permet pas de déclarer un accident survenu à un bénévole, personne n'est alerté des incidents déclarés, et un rapport envoyé ne peut plus être corrigé — sans trace de qui a corrigé quoi.

**Approche :** (1) Déclaration « Accident bénévole » (Oui/Non + description obligatoire si Oui) dans l'étape Incidents. (2) Nouveau rôle `RESP_MISSION` (« Responsable mission ») : droits d'un ADMIN sur les comptes rendus de son UL (lecture de tous, modification) et rien d'autre ; il reçoit une notification push + in-app quand un rapport déclare un accident bénévole, un incident critique (ACR, hémorragie grave, prise en charge complexe) ou un besoin de suivi. (3) Modification d'un rapport après envoi (« validation » = envoi, aucun statut n'est ajouté) par l'auteur, un RESP_MISSION ou ADMIN de l'UL, ou un SUPER_ADMIN ; chaque enregistrement est journalisé (qui, date et heure, champ par champ ancienne → nouvelle valeur) et consultable dans un onglet « Historique des modifications », affiché uniquement s'il existe au moins une modification.

## Boundaries & Constraints

**Always :**
- Historique persistant et non purgé dans une table dédiée `mission_report_edits` (pas l'AuditLog : purgé à 30 jours, sans valeurs avant/après) ; une entrée par enregistrement, seulement si au moins un champ a réellement changé ; valeurs rendues en libellés lisibles (Oui/Non, noms de véhicule/conducteur, libellés de catégories), figées au moment de l'écriture.
- Droit de modifier : SUPER_ADMIN ; ADMIN ou RESP_MISSION si l'UL du rapport = UL active ; auteur s'il est encore contributeur/admin. INACTIF toujours bloqué. Contrôle côté API et UI. Onglet historique visible par quiconque peut lire le rapport.
- RESP_MISSION suit le modèle `RESP_VEHICULE`/`RESP_UNIFORME` : n'entre PAS dans `isAdminOrAbove` ni `canAccessAdminPanel` ; helper dédié `canManageMissionReports` ; lecture/liste des rapports de son UL, accès au menu Missions.
- Notification : cible = RESP_MISSION de l'UL du rapport ; rapport rattaché à une DT → RESP_MISSION de l'UL de rattachement de l'auteur.
- Décision (revue, 2026-11-01) : un rapport rattaché à une DT est rapproché de l'UL de rattachement de son auteur (même résolution que l'alerte : `UserUL.is_home`, sinon sa première UL). Le RESP_MISSION et l'ADMIN de cette UL le lisent, le modifient et le voient dans « Tous les rapports », comme un rapport de leur UL. Les responsables lecture seule (cadre, président) ne gagnent rien sur ces rapports. Envoyée à la création si une des 5 cases (accident, ACR, hémorragie, PEC complexe, suivi nécessaire) est vraie, et à la modification uniquement pour une case qui passe de faux à vrai. Lien vers la fiche. Un échec d'envoi ne fait jamais échouer l'enregistrement. Vaut aussi pour la soumission par QR d'UL.
- Mêmes règles Zod qu'à la création ; description d'accident obligatoire (non vide) si accident = Oui, vidée si Non.
- Migration prod (dry-run / `--apply` / `--env`) à exécuter avant déploiement, enregistrée dans `CLAUDE.md`.

**Never :**
- Pas de modification du rattachement UL/DT, de l'auteur, de la date de soumission, des photos ni du rapport signé PDF.
- Pas de circuit de validation ni de statut ; pas d'édition/suppression des entrées d'historique ; pas d'historique rétroactif.
- Pas d'attribution automatique du rôle RESP_MISSION à des comptes existants.

## I/O & Edge-Case Matrix

| Scénario | Entrée / État | Résultat attendu | Gestion d'erreur |
|----------|--------------|------------------|------------------|
| Auteur modifie 2 champs | PATCH | 200, 1 entrée d'historique à 2 changements | N/A |
| RESP_MISSION / ADMIN même UL | PATCH | 200 + entrée à son nom | N/A |
| ADMIN/RESP_MISSION autre UL, cadre lecture seule, autre bénévole | PATCH | 403, rien écrit | 403 |
| PATCH sans changement réel | payload identique | 200, aucune entrée, aucune notification | N/A |
| Accident = Oui sans description | POST ou PATCH | 400 | Zod |
| Répartition incohérente | somme ≠ total | 400, rien écrit | Zod |
| Création avec hémorragie cochée | POST rapport UL X | 201 + notif aux RESP_MISSION de X | push en échec → 201 quand même |
| Modification ACR déjà vrai, accident faux → vrai | PATCH | notif (accident seul mentionné) | N/A |
| Rapport DT avec accident | POST, auteur rattaché à UL Y | notif aux RESP_MISSION de Y | N/A |
| Rapport jamais modifié | GET détail | pas d'onglet historique | N/A |
| Rapport inexistant | PATCH | 404 | 404 |

</frozen-after-approval>

## Code Map

- `scripts/add-mission-report-edits.ts` (NEW) -- modèle `scripts/add-mission-report-dt-code.ts` : ALTER `mission_reports` ADD `volunteer_accident INTEGER NOT NULL DEFAULT 0`, `volunteer_accident_details TEXT` (PRAGMA check) ; CREATE `mission_report_edits(id, report_id FK ON DELETE CASCADE, edited_by FK User.id, edited_at, changes TEXT JSON)` + index `report_id` ; INSERT OR IGNORE Role `role-resp_mission`.
- `scripts/setup-dev.ts` (~l.162-171 rôles, 583-664 DDL, ~972 comptes) , `scripts/ensure-system-roles.ts`, `scripts/seed-preview-users.ts/.sql`, `src/lib/preview-accounts.ts`, `src/auth.ts:~51` (compte dev `respmission@dev.local`) -- suivre exactement les ajouts faits pour RESP_UNIFORME (commit 3904699).
- `src/lib/roles.ts` -- `ROLES.RESP_MISSION`, `MANAGEABLE_ROLES`, `ROLE_LABELS` « Responsable mission », `canManageMissionReports` (calqué l.72-77). `src/components/users/RoleLegend.tsx`, `src/lib/menuVisibility.ts`, `src/app/login/page.tsx`, AGENTS.md concernés -- mêmes ajouts que RESP_UNIFORME.
- `src/__tests__/integration/setup.ts:557-620` -- DDL, rôle, truncate.
- `src/lib/missions/create-mission-report.ts:45-156,171` -- champs accident (Zod + superRefine + INSERT) ; extraire le schéma de base réutilisable par la mise à jour.
- `src/lib/missions/update-mission-report.ts` (NEW) -- `diffMissionReport` (pure, exportée) + `updateMissionReport(id, input, editorId)` : lit rapport + supplies + interventions, diff, une transaction (UPDATE, remplacement supplies/interventions, INSERT edit).
- `src/lib/missions/incident-alert.ts` (NEW) -- `incidentFlags(report)`, `newlyRaisedFlags(before, after)`, `notifyMissionIncident(report, flags)` via `sendPushNotification({ roles: ['RESP_MISSION'], ulId, … })` dans try/catch.
- `src/lib/missions/access.ts` -- `canReadMissionReport` : RESP_MISSION même UL ; `canEditMissionReport` (NEW).
- `src/app/api/missions/route.ts` -- GET liste : RESP_MISSION voit les rapports de son UL ; POST : alerte après insert. `src/app/api/qr-ul/[token]/mission-report/route.ts` -- alerte après insert.
- `src/app/api/missions/[id]/route.ts` -- `PATCH` (withAudit, `entityType: 'missionReport'`) + alerte transitions ; `GET` : champs accident, `can_edit`, `edits[]` (nom éditeur, date, changements) triés du plus récent.
- `src/components/missions/steps/Step6Incidents.tsx` -- bloc « Accident bénévole » ; `MissionWizard.tsx` -- champs dans `MissionFormData`/`INITIAL_FORM`/`validateStep`, mode édition (`initialData`, méthode PATCH, sans étapes UL/DT, photos, rapport signé, sans brouillon localStorage).
- `src/app/missions/[id]/edit/page.tsx` (NEW) -- wizard en édition, refus si `!can_edit`.
- `src/app/missions/[id]/page.tsx` + `mission-detail.module.css` -- onglets (`filters-bar`/`role="tab"`, cf. `src/app/missions/page.tsx:98-110`) « Rapport » / « Historique des modifications » ; bouton « Modifier » si `can_edit` ; accident affiché ; remplacer `roles.includes('ADMIN')` l.116 par `can_edit`/`isAdminOrAbove`.
- `src/lib/demo/DemoDB.ts`, `src/lib/demo/fetchInterceptor.ts:91-103` -- parité démo minimale.
- `src/lib/mcp/catalog.generated.ts` -- `npm run mcp:catalog`.

## Tasks & Acceptance

**Execution :**
- [x] Migration + DDL dev/test + rôle (scripts, setup, roles.ts, comptes dev/preview, légende, menu, CLAUDE.md) -- prérequis.
- [x] `create-mission-report.ts`, `update-mission-report.ts`, `incident-alert.ts`, `access.ts` -- logique métier.
- [x] Routes `missions`, `missions/[id]`, `qr-ul/[token]/mission-report` -- API.
- [x] `Step6Incidents`, `MissionWizard`, `missions/[id]/edit`, `missions/[id]` -- UI.
- [x] Démo, catalogue MCP, `package.json` + `package-lock.json` (mineure), `CHANGELOG.md` (FR, orienté utilisateur).
- [x] Tests : unit `diffMissionReport`, `canEditMissionReport`, `newlyRaisedFlags`, rôle ; intégration PATCH (401, 403 ×3, 404, 400 ×2, happy auteur/RESP_MISSION/ADMIN, sans changement) ; GET (`edits`, `can_edit`, accident, lecture RESP_MISSION) ; POST/QR (alerte appelée ou non, échec push toléré) ; composants (bloc accident, onglet absent/présent).

**Acceptance Criteria :**
- Given un rapport modifié deux fois, when on ouvre la fiche, then l'onglet liste les deux entrées, la plus récente d'abord, avec nom, date et heure (Europe/Paris) et chaque champ « ancienne → nouvelle ».
- Given un utilisateur sans droit d'édition, when il ouvre la fiche, then pas de bouton « Modifier », et `/missions/[id]/edit` affiche un refus.
- Given un compte RESP_MISSION, when il se connecte, then il voit le menu Missions avec tous les rapports de son UL, et aucune page d'administration.

## Implementation Notes

## Spec Change Log

- **Itération 1 (revue)** — Déclencheur : constat #1 du tri (alerte d'un rapport DT vers un RESP_MISSION qui reçoit 403 en l'ouvrant). Amendement : décision humaine ajoutée au bloc figé (rapport DT rapproché de l'UL de rattachement de l'auteur pour RESP_MISSION/ADMIN : lecture, modification, liste). État évité : alerte inexploitable. Le code n'est pas annulé (choix explicite de l'humain) : correctifs ciblés appliqués sur l'implémentation existante. KEEP : tout le reste de l'implémentation (diff, transaction, onglets, mode édition du wizard, alertes, tests existants).

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|--------|---------|---------|----------------|
| 1 | blind, edge (×2) | Rapport DT : le RESP_MISSION de l'UL de l'auteur est alerté mais `canReadMissionReport` lui refuse le rapport (ulId NULL) → 403 sur le lien | high | Vérifié `access.ts` : sameUl exige ulId non NULL. Intent ne dit pas quels droits il a sur ces rapports → **intent_gap** |
| 2 | blind, edge | RESP_MISSION multi-UL dont l'UL active diffère : lien → 403 jusqu'au changement d'UL | medium | Même comportement pour toutes les notifications ciblées par UL (pré-existant) → **defer** |
| 3 | blind | Historique orphelin à la suppression du rapport : FK non activées, le CASCADE ne joue pas | medium | Confirmé `integration/setup.ts:511` (« les FK ne sont pas activées ») ; DELETE ne supprime que `mission_reports` → **patch** |
| 4 | blind | Suppression d'un utilisateur éditeur → « Utilisateur supprimé » dans l'historique | medium | `DELETE /api/users` ne bloque que les auteurs ; nom non figé → **patch** (figer le nom de l'éditeur dans la ligne) |
| 5 | blind | Édition RESEAU → DPS/PAPS possible sans rapport signé (étape masquée en édition) | medium | Vérifié : `showReportStep` forcé à faux en édition, aucune règle serveur → **patch** (bloquer côté wizard si pas de rapport signé) |
| 6 | blind | Modifications concurrentes : dernière écriture gagne | low | Rare (petites UL), correctif = versionnement → rejeté |
| 7 | blind | Alertes perdues tant qu'aucun RESP_MISSION n'est attribué | false | Comportement voulu (cible décidée par l'humain, attribution manuelle) ; signalé à l'utilisateur |
| 8 | blind | Liste : aucun badge pour un accident bénévole | medium | Confirmé `MissionsTable.tsx:29`, `GET /api/missions` ne sélectionne pas la colonne → **patch** |
| 9 | blind, edge, vg | Wizard d'édition : véhicule/conducteur enregistrés absents des listes (autre UL, auteur CHVL/CHVPSP → drivers 403) → select « Aucun » et écrasement possible | medium | Confirmé `Step2Vehicle.tsx:32` sources = UL active → **patch** (conserver la valeur enregistrée comme option) |
| 10 | blind, edge | Page d'édition : 401/404/500 affichent « pas le droit » | low | Confirmé ; correction directe → **patch** |
| 11 | blind | `changed:false` sans retour visuel | low | Redirection vers la fiche suffisante → rejeté |
| 12 | blind | Script de migration : l'index n'est pas revérifié après `--apply` | low | Correction directe → **patch** |
| 13 | blind | Ligne CLAUDE.md hors ordre chronologique | low | Fichier de contexte agent → **defer** |
| 14 | blind | Onglets : pattern WAI-ARIA incomplet | low | Même convention que le reste de l'appli ; correctif ajoute de la complexité → rejeté |
| 15 | blind | Description d'accident sans limite de longueur | low | Pré-existant pour tous les champs texte → rejeté |
| 16 | blind | « Nombre d'intervention » (coquille) | false | Libellé existant de l'appli (spec missions-intervention-breakdown) |
| 17 | edge | RESP_MISSION + INACTIF dans `UserUL.roles` reçoit les alertes | maybe-false | Requête de `push.ts` ne filtre pas explicitement INACTIF ; pré-existant pour toute notification par rôle → **defer** (à confirmer sur `sendPushNotification`) |
| 18 | edge | L'envoi push retarde la réponse POST/PATCH | low | Même schéma `await sendPushNotification` partout → rejeté |
| 19 | edge | Consommables de catégorie inconnue supprimés à l'enregistrement | maybe-false | Filtre par préfixe de catégorie ; aucune catégorie renommée constatée → rejeté (au pire low) |
| 20 | edge | Doublons de consommables : pré-remplissage garde la dernière ligne | low | Correction directe (`+=`) → **patch** |
| 21 | edge | Rapport ancien (≥ 1 intervention sans répartition) : toute édition exige la répartition | false | Conforme à « mêmes règles Zod qu'à la création » (bloc figé) ; signalé à l'utilisateur |
| 22 | edge | Démo : modifications de consommables ignorées | low | Correction directe → **patch** |
| 23 | edge | Table d'historique absente → GET détail 500 | false | Migration documentée « à exécuter avant déploiement » |
| 24 | vg | Script de migration jamais exécuté sur une base à l'ancien schéma | medium | Aucun test ; modèle `add-mcp-tokens.test.ts` existe → **patch** |
| 25 | vg | Onglet par défaut de `/missions` : CADRE/PRÉSIDENT basculent aussi sur « Tous les rapports », non testé | low | Confirmé `missions/page.tsx:35` ; changement non annoncé → **patch** (tests par rôle + mention CHANGELOG) |
| 26 | vg | Bouton Supprimer : seul le cas « absent » est testé | medium | Confirmé → **patch** |
| 27 | vg | Bouton QR masqué pour RESP_MISSION non testé | low | Confirmé → **patch** |
| 28 | edge (passe 2) | Rapport déjà DPS/PAPS sans rapport signé (antérieur à la fonctionnalité) : le blocage du wizard empêche toute modification | high | Vérifié : la règle bloque dès que le type est DPS/PAPS, pas seulement au passage vers DPS/PAPS → **patch** |
| 29 | edge (passe 2) | Rapport ancien sans répartition : édition exige la répartition | false | carried #21 — conforme au bloc figé |
| 30 | edge (passe 2) | PATCH partiel (API/MCP) : champs optionnels omis effacés (accident remis à Non) | medium | `volunteer_accident.default(false)` + champs `.optional()` → **patch** (PATCH exige toutes les clés) |
| 31 | edge (passe 2) | Modifications concurrentes | low | carried #6 — rejeté |
| 32 | edge (passe 2) | `can_edit` vrai alors que le PATCH répond 403 si `userId` nul (SUPER_ADMIN sans ligne User) | low | Correction directe d'une ligne → **patch** |
| 33 | edge (passe 2) | DELETE laisse consommables et répartition orphelins (FK inactives) | medium | Pré-existant (avant ce changement) → **defer** |
| 34 | edge (passe 2) | Step2Vehicle : l'option « valeur enregistrée » disparaît dès qu'on change de véhicule/conducteur | medium | Vérifié : condition `data.vehicle_id === stored.id` → **patch** |
| 35 | edge (passe 2) | Véhicule VPSP enregistré absent de la liste : filtre CHVPSP non appliqué | low | Cas rare (véhicule hors liste ET VPSP), correctif ajoute un champ → rejeté |
| 36 | edge (passe 2) | Consommables de catégorie inconnue | maybe-false | carried #19 — rejeté |
| 37 | edge (passe 2) | `ulId = 'default'` traité différemment par l'accès et par l'alerte | low | Correction directe (aligner `managerUlOf`) → **patch** |
| 38 | edge (passe 2) | PATCH API/MCP peut passer en DPS/PAPS sans rapport signé (contrôle UI seulement) | medium | Vérifié : aucune règle serveur → **patch** (même règle que #28 côté serveur) |

## Design Notes

Diff : champs scalaires normalisés (0/1 → bool) ; supplies et interventions comparées par article/catégorie (`Compresses : 2 → 4`, ajout `0 → n`, retrait `n → 0`). `changes = [{ field, label, old, new }]`, texte déjà rendu. Notification : titre « Incident déclaré — <nom mission> », corps listant les cases levées.

## Verification

**Commands :**
- `npm run lint` -- 0 erreur, 0 warning
- `npm run test` -- tout passe
- `npm run build` -- succès
