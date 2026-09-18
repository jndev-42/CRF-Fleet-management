---
title: 'Rework module missions — sélection UL/DT et visibilité par UL active'
type: 'feature'
created: '2026-09-18'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '62ae92f8a8ac31bf51c14bcf5f099f92def92e38'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem :** Aujourd'hui, `mission_reports.ulId` est fixé implicitement à l'UL active du soumetteur (`session.user.ulId`), jamais choisi. La liste `/missions` ne montre que les rapports de l'UL actuellement sélectionnée : un soumetteur perd la visibilité sur ses anciens rapports dès qu'il change d'UL active, et rien ne permet d'attacher un rapport à un poste de niveau DT (ex. « DT 75 »), qui n'a pas de ligne `UniteLocale` propre.

**Approche :** Ajouter une première étape au wizard de soumission pour choisir l'UL (ou l'entité DT synthétique) qui héberge le poste ; stocker ce choix sur le rapport (`ulId` existant, ou nouvelle colonne `dt_code` nullable pour un choix DT). Sur l'écran missions, scinder en deux vues : « Mes rapports » (tous les rapports du soumetteur, toutes UL/DT confondues, tag UL/DT par ligne) accessible à tous les rôles actuels, et « Tous les rapports » (rapports de l'UL actuellement active) réservée aux cadres/présidents/admin/super_admin, réutilisant le sélecteur d'UL déjà existant (`ULContext`/`Navbar`).

## Boundaries & Constraints

**Always :**
- Exactement un des deux champs `mission_reports.ulId` / `mission_reports.dt_code` est renseigné par rapport ; jamais les deux, jamais aucun.
- Réutiliser `GET /api/ul` tel quel (déjà accessible à tout utilisateur authentifié) pour construire la liste UL+DT — pas de nouvel endpoint.
- Liste UL+DT = TOUTES les UL en base + une entrée par valeur `dtCode` unique existante (pas de restriction aux UL du soumetteur).
- Conserver inchangés : qui peut soumettre un rapport (`ALLOWED_ROLES` + `isAdminOrAbove`), le champ `presence_ul` / toggle « Présence UL ? » (Step5Team), le sélecteur d'UL active existant (`ULContext.tsx`, `Navbar.tsx`).
- Migration DB en prod via script dry-run par défaut / `--apply` pour écrire, sur le modèle de `scripts/add-stock-qr-token.ts`.
- Un rapport attaché à une DT (`dt_code` renseigné, `ulId=NULL`) n'apparaît jamais dans « Tous les rapports » (aucun rapprochement par `dtCode`) : visible uniquement via « Mes rapports » du soumetteur. Décision utilisateur — pas de rapprochement pour rester strictement fidèle à « il verra les rapports de l'UL sélectionnée ».

**Never :**
- Ne pas créer de table/ligne `UniteLocale` pour représenter une DT — la DT reste une valeur dérivée de `dtCode`, jamais une entité stockée séparément.
- Ne pas modifier les rôles autorisés à créer un rapport, ni la logique de `presence_ul`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Soumission — UL réelle choisie | Étape 1 : sélection « UL Paris 18 » | `ulId='ul-paris-18'`, `dt_code=NULL` | N/A |
| Soumission — DT choisie | Étape 1 : sélection « DT 75 » | `ulId=NULL`, `dt_code='DT 75'` | N/A |
| Soumission — rien sélectionné | Étape 1 non complétée | Bloque le passage à l'étape suivante | Message French inline (pattern `validateStep`) |
| Soumission — payload sans sélection valide | POST direct sans ul_selection | 400 | Zod : `{ error, details }` |
| Liste « Mes rapports » | Soumetteur avec rapports sous 2 UL différentes dans le temps | Tous ses rapports, quel que soit `ulId`/`dt_code`, tag UL/DT par ligne | N/A |
| Liste « Tous les rapports » | Cadre, UL active = UL 18 | Rapports où `ulId = UL 18` (+ voir Open Questions pour le cas DT) | N/A |
| Accès « Tous les rapports » par non-manager | CI/RPAPS appelle `?scope=all` | 403 | `forbiddenResponse()` |
| UL active absente | `session.user.ulId` = `'default'` | `scope=all` renvoie liste vide (comportement déjà existant) | N/A |

</frozen-after-approval>

## Code Map

- `scripts/add-mission-report-dt-code.ts` (NEW) -- migration prod idempotente, dry-run par défaut / `--apply`, ajoute colonne nullable `dt_code TEXT` à `mission_reports` ; modèle : `scripts/add-stock-qr-token.ts`.
- `scripts/setup-dev.ts:564-580` -- bloc `PRAGMA table_info("mission_reports")` existant pour `drive_folder_id`/`mission_comment`/`signed_report_drive_id` : ajouter le même pattern pour `dt_code`.
- `CLAUDE.md` (racine) -- enregistrer la commande du nouveau script migration, section Commands.
- `src/app/api/missions/route.ts` -- `POST` (ligne 166-276) : remplacer `ulId = session.user.ulId || 'default'` (ligne 212) par la sélection explicite du payload (`ul_selection.type === 'UL' ? ulId : null`, `dt_code` idem), valider via Zod qu'exactement un des deux est fourni. `GET` (ligne 53-162) : ajouter `scope` (`'mine' | 'all'`, défaut `'mine'`) ; `scope='mine'` retire le filtre `mr.ulId = ?` (ligne 85-86) et filtre uniquement `submitted_by = userId` sans restriction d'UL ; `scope='all'` exige `isAdminOrAbove || isReadOnlyManager` (sinon 403) et garde le filtre `ulId = session.user.ulId` actuel. Ajouter `ul_name`/`dt_code` aux colonnes SELECT (jointure `UniteLocale`) pour le tag.
- `src/app/api/missions/[id]/route.ts:12-57` -- `GET` : adapter le contrôle d'accès `isAdminOrAbove && same ulId` pour tenir compte des rapports `dt_code` (cf. Open Question) ; retourner le libellé UL/DT résolu pour l'affichage détail.
- `src/components/missions/MissionWizard.tsx` -- `MissionFormData`/`INITIAL_FORM` (lignes 18-60) : ajouter `selected_ul_id: string | null`, `selected_dt_code: string | null` ; `activeSteps` (ligne 90-99) : insérer une étape en première position ; inclure les deux champs dans le payload POST (ligne 199-204) ; `validateStep` (ligne 113) : nouvelle règle pour l'étape 1. Ligne 216 (animation Paris 18) : baser la condition sur `selected_ul_id === 'ul-paris-18'` au lieu de `currentUserUlId`.
- `src/components/missions/steps/Step0ULSelection.tsx` (NEW) -- première étape : `fetch('/api/ul')`, construit la liste UL + entrées DT synthétiques (pattern `Array.from(new Set(uls.map(u => u.dtCode?.trim()).filter(Boolean)))` de `src/components/admin/ULsTab.tsx:420-434`), un seul `<select>` (ou groupe radio) exclusif UL/DT.
- `src/app/missions/page.tsx` -- restructurer en deux onglets : « Mes rapports » (défaut, tous les rôles avec `canAccess` actuel) et « Tous les rapports » (affiché seulement si `isAdminOrAbove(roles) || isReadOnlyManager(roles)`), `fetchReports` passe `scope` selon l'onglet actif ; colonne UL/DT existante (ligne 134, `ulColumnLabel`) devient un tag par ligne basé sur `ul_name`/`dt_code` retournés par l'API au lieu du libellé fixe de l'UL du viewer.
- `src/app/missions/[id]/page.tsx` -- afficher le tag UL/DT résolu dans l'en-tête détail.
- `src/app/missions/new/page.tsx` -- ne change pas la logique d'accès ; continue de passer `currentUserUlName` (utilisé uniquement par Step5Team, indépendant de cette feature).
- AGENTS.md à relire avant modif puis regénérer : `src/app/api/missions/AGENTS.md`, `src/app/missions/AGENTS.md`, `src/app/missions/[id]/AGENTS.md`, `src/app/missions/new/AGENTS.md`.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/add-mission-report-dt-code.ts` -- créer script migration prod idempotent (dry-run/--apply) -- ajoute `dt_code` sans casser les rapports existants
- [x] `scripts/setup-dev.ts` -- ajouter bloc migration `dt_code` pour l'environnement local -- garde dev/prod alignés
- [x] `CLAUDE.md` -- enregistrer la commande du script -- convention `scripts/CLAUDE.md`
- [x] `src/components/missions/steps/Step0ULSelection.tsx` -- nouvelle étape wizard -- point d'entrée de la sélection UL/DT
- [x] `src/components/missions/MissionWizard.tsx` -- intégrer l'étape, étendre `MissionFormData`, payload POST -- porte la sélection jusqu'à l'API
- [x] `src/app/api/missions/route.ts` -- POST : persister ulId/dt_code explicites + validation Zod ; GET : paramètre `scope` (mine/all) -- cœur de la nouvelle logique de visibilité
- [x] `src/app/api/missions/[id]/route.ts` -- adapter contrôle d'accès + libellé UL/DT -- cohérence avec la liste
- [x] `src/app/missions/page.tsx` -- onglets « Mes rapports » / « Tous les rapports » + tag UL/DT par ligne -- expose la nouvelle visibilité
- [x] `src/app/missions/[id]/page.tsx` -- afficher le tag UL/DT -- traçabilité au niveau détail
- [x] Tests -- `src/app/api/missions/__tests__/route.test.ts` (ou équivalent existant) : 400 sélection UL/DT invalide, 403 `scope=all` pour non-manager, `scope=mine` cross-UL, `scope=all` filtré par UL active -- exigence CLAUDE.md « toute nouvelle feature livre ses tests »

**Acceptance Criteria:**
- Given un soumetteur CI/RPAPS avec des rapports sous UL 18 et UL 4 (soumis à des dates différentes), when il ouvre « Mes rapports » quelle que soit son UL active, then il voit tous ses rapports, chacun tagué UL 18 ou UL 4.
- Given un cadre avec rôle dans UL 18 et UL 4, when il a UL 18 sélectionnée en haut à gauche et ouvre « Tous les rapports », then il voit uniquement les rapports attachés à UL 18 ; en changeant son UL active pour UL 4 via le switcher existant, il voit uniquement ceux de UL 4.
- Given l'étape 1 du wizard, when l'utilisateur choisit une entrée DT synthétique (ex. « DT 75 ») plutôt qu'une UL, then le rapport créé a `ulId=NULL` et `dt_code='DT 75'`.
- Given un utilisateur CI/RPAPS (non manager), when il appelle `GET /api/missions?scope=all`, then il reçoit 403.

## Implementation Notes

## Spec Change Log

## Review Triage Log

**Passe 1 (blind-hunter, edge-case-hunter, verification-gap) :**

1. [blind-hunter] Pas de test RTL dédié pour `Step0ULSelection.tsx` (composant neuf, avec état/fetch) — **medium**. Vérifié : composant a `uls`/`loading`/`loadError`, aucun `Step0ULSelection.test.tsx`, seule couverture indirecte via `MissionWizard.test.tsx` (jamais le chemin d'échec). Règle CLAUDE.md violée. → groupé avec #7 (patch P3).
2. [blind-hunter] `GET /api/missions/[id]` : logique d'accès modifiée, zéro nouveau test sur cette route — **medium**. Vérifié dans le diff et `missions.test.ts` : seuls `adminSession` (SUPER_ADMIN, bypass `isSuper`) et `ciRpapsSession` sont utilisés, aucun ADMIN simple. → groupé avec #3, #18 (patch P1).
3. [blind-hunter] Élargissement de `isSubmitter` (`|| isAdminOrAbove`) sans test de régression — **medium**, même root cause que #2/#18. → patch P1.
4. [blind-hunter] Lignes historiques `ulId IS NULL OR ulId='default'` : invariant « exactement un des deux » rompu après migration, pas de backfill — **low**. Vérifié : `MissionsTable`'s `AttachmentTag` gère déjà le cas des deux null (`—`), dégradation déjà propre ; un backfill exigerait une décision hors intent. Rejeté (fix non trivial, faible probabilité rencontrée).
5. [blind-hunter] Pas de vue agrégée DT pour les managers — **false**. Réfutation : décision utilisateur explicite lors du gate Open Questions (« Aucun rapprochement »), consignée dans le bloc frozen.
6. [blind-hunter] Label « Présence UL ? » de `Step5Team` toujours basé sur l'UL du soumetteur, incohérent avec le rattachement choisi — **false**. Vérifié dans `Step5Team.tsx:31` : le label pose une question distincte et indépendante (« mon UL était-elle représentée à cette mission ? »), pas le rattachement administratif du rapport — exactement le champ que Boundaries&Constraints gèle intentionnellement.
7. [blind-hunter] `Step0ULSelection` : aucun moyen de réessayer après un échec de `fetch('/api/ul')` — **medium**. Vérifié dans le code : pas de bouton retry, pas de `Précédent` en première étape → impasse tant que la page n'est pas rechargée. → patch P3.
8. [blind-hunter] `dtCode = ulId ? null : data.selected_dt_code` qualifié de code mort — **false**. Vérifié : la branche s'exécute toujours (jamais unreachable), elle ne fait que réaffirmer une invariante déjà garantie par le `superRefine` Zod — code défensif inoffensif, pas un défaut.
9. [blind-hunter] Pas de test `scope=mine` + `type`, ni pagination sous le nouveau régime `scope` — **low**, fix trivial et cas plausible (un CI/RPAPS filtrant ses propres rapports par type). → patch P4.
10. [blind-hunter] `MissionsTable.tsx`/`page.tsx` sans test dédié (tabs, gating) — **low**. Rejeté : composant présentational sans état propre, écrire un test de page complet (mock session/router/fetch) dépasse la correction triviale.
11. [blind-hunter] Ordre de déploiement de la migration seulement documenté en commentaire de script — **medium** : chaque `POST /api/missions` renvoie 500 tant que la colonne n'existe pas, risque opérationnel réel. → patch P5.
12. [blind-hunter] IDs de fixtures de test incohérents (`ul-lyon` vs `ul-lyon-3`) entre fichiers — **low**, cosmétique, suites indépendantes, aucun impact réel. Rejeté.
13. [blind-hunter] Branche de repli e-mail→id de `GET /api/missions` (scope=mine) non testée — **low**. Rejeté : cas très marginal (compte utilisateur supprimé avec session encore valide), dégradation déjà silencieuse et sans casse.
14. [edge-case-hunter] `POST /api/missions` ne valide jamais que `selected_ul_id`/`selected_dt_code` correspondent à une `UniteLocale`/`dtCode` réelle — **medium**. Vérifié : Zod ne contrôle que la forme (`min(1)`), aucune requête DB de vérification ; un rapport avec un identifiant invalide devient silencieusement invisible partout. → patch P2.
15. [edge-case-hunter] `GET /api/missions` (scope=mine) : lookup e-mail→id sans ligne `User` trouvée retombe silencieusement sur l'id brut plutôt que d'erreurer — **low**. Rejeté : cas marginal (utilisateur supprimé), dégradation déjà propre (liste vide plutôt que crash).
16. [edge-case-hunter] `GET /api/missions/[id]` compare `row.submitted_by === session.user.id` sans la résolution e-mail→id ajoutée à la liste — pourrait 403 un soumetteur sur son propre rapport en dev — **medium si avéré, pré-existant**. Vérifié : ce code n'a pas changé dans ce diff (la comparaison directe existait déjà avant). Cause : pas cette story. → **defer**.
17. [edge-case-hunter] `presence_ul` toujours renvoyé par l'API mais plus affiché dans `MissionsTable` (colonne repurposée en tag UL/DT) — **low**. Vérifié : décision délibérée du Code Map (« colonne UL existante devient un tag ») ; `presence_ul` reste visible sur la fiche détail. Compromis assumé, pas une régression accidentelle. Rejeté.
18. [verification-gap, pré-vérifié] `ADMIN` simple (pas SUPER_ADMIN) déposant un rapport pour une UL différente de son UL active (ou une DT) : `isSubmitter` protège déjà ce cas dans le code, mais aucun test ne le prouve — **medium**, même root cause que #2/#3. → patch P1.

**Routage :** P1 (#2, #3, #18), P2 (#14), P3 (#1, #7), P4 (#9), P5 (#11) → patch, ré-engagement de l'agent d'implémentation. #16 → defer (`deferred-work.md`). Reste rejeté (false ou low non trivial).

## Design Notes

Représentation DT : pas de table dédiée. `dt_code` stocke la valeur brute de `UniteLocale.dtCode` choisie (ex. `"DT 75"`), indépendante de toute ligne UL. La liste combinée UL+DT à l'étape 1 est donc dérivée à la volée depuis `GET /api/ul`, jamais persistée comme référentiel séparé.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreurs, 0 warnings
- `npm run test` -- expected: suite complète verte, incluant les nouveaux tests missions
- `npx tsx scripts/add-mission-report-dt-code.ts` (dry-run) puis `--apply` sur un environnement de test -- expected: colonne `dt_code` ajoutée sans erreur, idempotent au second run

**Manual checks (if no CLI):**
- Soumettre un rapport via le wizard en choisissant une UL réelle, puis une entrée DT synthétique ; vérifier en DB que `ulId`/`dt_code` sont bien exclusifs.
- Basculer l'UL active via le switcher Navbar et vérifier que « Tous les rapports » change en conséquence.
