---
title: 'Missions — victimes → interventions, avec répartition obligatoire par type et par nature'
type: 'feature'
created: '2026-09-18'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: 'eeb4270c1341a7aa7575611b981bce06d5ee5ef0'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem :** Le wizard de mission ne capture qu'un total (« Nombre de victimes prises en charge »), sans détail sur le type de prise en charge ni sur la nature clinique. Impossible aujourd'hui de savoir combien de décharges, de DAE ou d'arrêts cardiaques un rapport recouvre.

**Approche :** Renommer le champ en « Nombre d'intervention » (même donnée sous-jacente). Dès que ce nombre est ≥ 1, une nouvelle étape obligatoire du wizard impose de répartir ce même total dans deux grilles indépendantes de 5 catégories chacune — par type de prise en charge (soins, décharge, DAE, évac CRF, évac autres) puis par nature clinique (petits soins, malaise, traumatisme, inconscience, arrêt cardiaque) — chaque grille devant sommer exactement au total. Les rapports existants ne sont pas migrés : ils gardent leur total sans détail.

## Boundaries & Constraints

**Always :**
- Le total « nombre d'intervention » reste stocké dans la colonne existante `mission_reports.victim_count` (aucun renommage de colonne) — seul le libellé UI change, partout où il apparaît.
- Détail persisté dans une nouvelle table enfant `mission_report_interventions` (id, report_id, breakdown ['MODE'|'NATURE'], category, quantity), sur le modèle exact de `mission_report_supplies` — lignes à quantité 0 non insérées (sparse), transaction commune à l'insert du rapport.
- Répartition strictement obligatoire quand `victim_count >= 1` : la somme de chaque grille doit être EXACTEMENT égale à `victim_count` (Zod `superRefine`, ET blocage `validateStep` côté wizard). Quand `victim_count === 0`, les deux tableaux doivent être vides (aucune ligne à quantité > 0 acceptée).
- Étape du wizard visible uniquement quand `victim_count >= 1` (même mécanisme dynamique que « Rapport signé » pour DPS/PAPS) ; insérée juste après « Général ».
- Migration DB en prod via script dry-run/`--apply`/`--env <fichier>`, sur le modèle d'`add-mission-report-dt-code.ts` (déjà mis à jour pour supporter `--env`).

**Never :**
- Ne pas migrer ni backfiller les rapports existants — ils gardent `victim_count` sans lignes dans la nouvelle table, affichage dégradé (total seul, pas de détail).
- Ne pas toucher `had_acr` / `had_hemorrhage` / `had_complex_care` (Step6Incidents) ni les lier aux nouvelles catégories — ce sont des indicateurs déclaratifs indépendants, hors périmètre.
- Ne pas modifier les rôles autorisés à soumettre un rapport.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `victim_count = 0` | Étape répartition non affichée | Soumission sans lignes `mission_report_interventions` | N/A |
| `victim_count = 3`, grilles complètes et correctes | Somme MODE = 3, somme NATURE = 3 | 201, 6 lignes insérées (celles à quantité > 0) | N/A |
| `victim_count = 3`, une grille somme à 2 | Suivant cliqué depuis l'étape | Bloqué, message inline | `validateStep` |
| POST direct, `victim_count = 3`, somme MODE = 2 | Payload direct sans passer par le wizard | 400 | Zod `superRefine` |
| POST direct, `victim_count = 0`, une ligne à quantité > 0 fournie | Payload incohérent | 400 | Zod `superRefine` |
| Rapport existant (pré-migration) | `victim_count = 5`, aucune ligne détail | Fiche détail affiche le total seul, pas de section répartition | N/A |

</frozen-after-approval>

## Code Map

- `scripts/add-mission-report-interventions.ts` (NEW) -- migration prod idempotente, dry-run/`--apply`/`--env <fichier>` (copier le pattern de `scripts/add-mission-report-dt-code.ts`), crée `mission_report_interventions(id, report_id, breakdown, category, quantity)` + index sur `report_id`.
- `scripts/setup-dev.ts` -- ajouter le `CREATE TABLE IF NOT EXISTS "mission_report_interventions"` juste après le bloc `mission_report_supplies` existant (~ligne 583-591), même style.
- `CLAUDE.md` -- enregistrer la commande du script, avec la même mention « à exécuter avant le déploiement » que pour `add-mission-report-dt-code.ts`.
- `src/lib/mission-interventions.ts` (NEW) -- `InterventionModeCategory` (`SOINS`, `DECHARGE`, `DAE`, `EVAC_CRF`, `EVAC_AUTRES`) + `INTERVENTION_MODE_LABELS` (« Nombre de soins (sans décharge, ni évac) », « Nombre de décharge », « Nombre de mise en oeuvre DAE », « Nombre d'évac CRF », « Nombre d'évac Autres ») ; `InterventionNatureCategory` (`PETITS_SOINS`, `MALAISE`, `TRAUMATISME`, `INCONSCIENCE`, `ARRET_CARDIAQUE`) + `INTERVENTION_NATURE_LABELS` (« Petits soins », « Malaise », « Traumatisme », « Inconscience », « Arrêt cardiaque ») ; deux tableaux ordonnés `INTERVENTION_MODE_CATEGORIES`/`INTERVENTION_NATURE_CATEGORIES` pour le rendu, sur le modèle de `SUPPLY_CATEGORIES` dans `src/lib/mission-supplies.ts`.
- `src/app/api/missions/route.ts` -- `interventionEntrySchema` (`category` enum union des deux groupes, `quantity: z.number().int().min(0)`) ; ajouter `intervention_types: z.array(interventionEntrySchema)` et `intervention_natures: z.array(interventionEntrySchema)` à `createMissionReportSchema` ; `superRefine` : si `victim_count >= 1`, somme de chaque tableau doit égaler `victim_count` (erreur sur `intervention_types`/`intervention_natures` sinon) ; si `victim_count === 0`, les deux tableaux doivent être vides. `POST` : dans la transaction existante (après l'insert `mission_reports`, à côté de la boucle `supplies`), insérer une ligne par entrée à `quantity > 0` dans `mission_report_interventions` avec `breakdown='MODE'` ou `'NATURE'`.
- `src/app/api/missions/[id]/route.ts` -- `GET` : requêter `mission_report_interventions` par `report_id` (même requête/groupement que `mission_report_supplies`, lignes ~67-83) et grouper par `breakdown` ; ajouter au payload de réponse `interventions: { mode: Record<string, number>, nature: Record<string, number> }` (uniquement les catégories présentes).
- `src/components/missions/MissionWizard.tsx` -- `MissionFormData` : ajouter `intervention_types: Record<string, number>`, `intervention_natures: Record<string, number>` (clé = valeur de catégorie, défaut `{}` comme `supplies`). `activeSteps` (ligne ~95-105) : insérer `...(formData.victim_count >= 1 ? ['Répartition interventions'] : [])` juste après `'Général'`. `validateStep` (ligne ~119) : nouvelle branche `'Répartition interventions'` qui calcule les deux sommes et retourne un message si l'une diffère de `victim_count`. `handleSubmit` : construire `intervention_types`/`intervention_natures` (uniquement entrées à quantité > 0, même pattern que `suppliesArr` ligne ~159-167) et les inclure dans le payload POST.
- `src/components/missions/steps/StepInterventionBreakdown.tsx` (NEW) -- deux groupes de 5 champs nombre (`INTERVENTION_MODE_CATEGORIES`/`INTERVENTION_NATURE_CATEGORIES`), total du groupe affiché en direct à côté de `victim_count` cible (ex. « 2 / 3 »), même style que `Step3Supplies.tsx` (pas d'accordéon nécessaire, seulement 5 champs par groupe).
- `src/components/missions/steps/Step1General.tsx` (ligne ~70) -- libellé « Nombre de victimes prises en charge » → « Nombre d'intervention » ; `id`/`onChange` inchangés (reste `victim_count`).
- `src/app/missions/MissionsTable.tsx` -- en-tête colonne « Victimes » → « Interventions » (aucun changement de donnée).
- `src/app/missions/[id]/page.tsx` -- libellé « Victimes prises en charge » → « Nombre d'intervention » (ligne 172) ; `MissionDetail` : ajouter `interventions: { mode: Record<string, number>; nature: Record<string, number> }` ; nouvelle section « Répartition des interventions » (deux cards, sur le modèle de la section « Matériel consommé » lignes 255-281), affichée seulement si `victim_count > 0` — absente/vide pour les rapports non migrés.
- `src/lib/demo/DemoDB.ts` -- étendre le type `MissionDetail` et `createMission(payload)` avec `intervention_types`/`intervention_natures` (parité démo, pas de validation stricte requise côté démo).
- AGENTS.md à relire puis régénérer : `src/app/api/missions/AGENTS.md`, `src/app/missions/AGENTS.md`, `src/app/missions/[id]/AGENTS.md`, `src/components/missions/AGENTS.md`, `src/components/missions/steps/AGENTS.md`.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/add-mission-report-interventions.ts` -- créer la migration -- ajoute la table sans toucher aux rapports existants
- [x] `scripts/setup-dev.ts` -- ajouter la table en local -- dev/prod alignés
- [x] `CLAUDE.md` -- enregistrer la commande -- convention `scripts/CLAUDE.md`
- [x] `src/lib/mission-interventions.ts` -- catégories + libellés des deux grilles -- source de vérité partagée wizard/détail
- [x] `src/components/missions/steps/StepInterventionBreakdown.tsx` -- nouvelle étape -- saisie de la répartition
- [x] `src/components/missions/MissionWizard.tsx` -- intégrer l'étape conditionnelle, validation, payload -- porte la répartition jusqu'à l'API
- [x] `src/components/missions/steps/Step1General.tsx` -- renommer le libellé -- reflète « nombre d'intervention »
- [x] `src/app/api/missions/route.ts` -- Zod + persistance des deux grilles -- cœur de la validation d'invariant
- [x] `src/app/api/missions/[id]/route.ts` -- exposer la répartition en détail -- alimente l'affichage
- [x] `src/app/missions/MissionsTable.tsx` + `src/app/missions/[id]/page.tsx` -- renommage + nouvelle section détail -- visibilité utilisateur
- [x] `src/lib/demo/DemoDB.ts` -- parité démo -- évite de casser le mode démo
- [x] Tests -- `src/__tests__/integration/missions.test.ts` : 400 somme incorrecte, 400 grilles non vides à `victim_count=0`, 201 + lignes persistées, détail avec/sans répartition ; nouveau `src/__tests__/components/StepInterventionBreakdown.test.tsx` -- exigence CLAUDE.md tests

**Acceptance Criteria:**
- Given `victim_count = 0` à l'étape « Général », when l'utilisateur avance dans le wizard, then aucune étape de répartition n'apparaît et le rapport est créé sans lignes dans `mission_report_interventions`.
- Given `victim_count = 4`, when l'utilisateur répartit 4 dans le groupe « type » mais seulement 3 dans le groupe « nature » et clique Suivant depuis cette étape, then il est bloqué avec un message explicite.
- Given un rapport soumis avec `victim_count = 4` et les deux grilles sommant à 4, when on consulte sa fiche détail, then les deux répartitions s'affichent avec leurs catégories à quantité > 0.
- Given un rapport créé avant cette fonctionnalité (`victim_count > 0`, aucune ligne détail), when on consulte sa fiche détail, then le total s'affiche seul, sans section répartition ni erreur.

## Implementation Notes

## Spec Change Log

## Review Triage Log

**Passe 1 (blind-hunter, edge-case-hunter, verification-gap) :**

1. [blind-hunter] `interventionEntrySchema.category` accepte l'union des deux groupes, sans vérifier qu'une entrée de `intervention_types` appartient bien à `INTERVENTION_MODE_CATEGORIES` (idem `intervention_natures`/NATURE) — **medium**. Vérifié dans `src/app/api/missions/route.ts:19-25` : un seul schéma partagé, aucune restriction par champ. Confirmé indépendamment par edge-case-hunter (#14) et verification-gap (#18, « Other findings »). → patch P1.
2. [blind-hunter] Aucune détection de catégorie dupliquée dans un même tableau — **medium**. Vérifié : la somme passe la validation, mais le POST insère une ligne par entrée (deux lignes même `(report_id, breakdown, category)`), et `GET .../[id]` fait `bucket[category] = quantity`, donc la dernière ligne écrase l'autre silencieusement — le détail affiché ne correspond plus au total. Confirmé par edge-case-hunter (#13). → patch P2.
3. [blind-hunter] Pas de contrainte `UNIQUE(report_id, breakdown, category)` en base — **low**. Rejeté : redondant une fois #2 corrigé côté Zod (couche API suffisante, pas de précédent de contrainte DB équivalente ailleurs dans ce module — `ulId` n'a pas non plus de FK formelle).
4. [blind-hunter] La migration ne vérifie que l'existence de la table avant de s'arrêter (« Rien à faire ») — un crash entre `CREATE TABLE` et `CREATE INDEX` laisserait l'index manquant de façon permanente au relance — **low**, mais fix trivial et gratuit (`CREATE INDEX IF NOT EXISTS` est lui-même idempotent). → patch P3.
5. [blind-hunter] Les schémas de table de test (`setup.ts`, `missions.test.ts`) omettent le `CHECK` et la `FK ON DELETE CASCADE` présents dans les scripts prod/dev — **medium** : les tests tournent sur un schéma plus permissif que la prod, un cascade cassé ne serait jamais détecté. Même cause que verification-gap #17. → patch P4.
6. [blind-hunter] `INTERVENTION_LABELS` et le type `InterventionCategory` exportés mais jamais utilisés ailleurs dans le diff — **low**, cosmétique, aucun impact fonctionnel. Rejeté.
7. [blind-hunter] Pluriel « intervention(s) » implémenté 3 fois différemment (composant, wizard, API) — **low**, divergence de formulation uniquement, `intervention(s)` est une convention française courante. Rejeté.
8. [blind-hunter] Le badge « courant / cible » utilise le même gris pour un dépassement (`current > total`) que pour une répartition incomplète — **low**. Rejeté : le message de blocage `validateStep` indique déjà explicitement le nombre actuel vs attendu, la distinction visuelle est un pur bonus cosmétique sans conséquence sur les données.
9. [blind-hunter] Aucun plafond client sur les champs nombre (juste `min=0`, pas de `max` lié au budget restant) — **low**. Rejeté : aucun précédent de ce type dans le wizard (ex. `Step3Supplies` ne plafonne pas non plus), le fix demanderait une logique inter-champs non triviale, et `validateStep` bloque déjà toute soumission incohérente.
10. [blind-hunter] CHANGELOG/AGENTS.md ne documentent pas les lacunes de #1/#2 — **low**. Rejeté : sans objet une fois #1/#2 corrigés (rien à documenter comme limitation connue).
11. [edge-case-hunter] Doublon de catégorie non rejeté — même constat que #2. → patch P2 (même correctif).
12. [edge-case-hunter] Catégorie hors-groupe non rejetée — même constat que #1. → patch P1 (même correctif).
13. [edge-case-hunter] `GET .../[id]` range tout ce qui n'est pas littéralement `'NATURE'` dans le bucket `mode` — **false**. Vérifié : la colonne `breakdown` porte un `CHECK IN ('MODE','NATURE')` dans les scripts prod/dev (`scripts/add-mission-report-interventions.ts`, `scripts/setup-dev.ts`), donc aucune troisième valeur ne peut jamais y être stockée — branche défensive mais jamais atteignable en prod/dev. Redevient également vrai en tests une fois #5 corrigé.
14. [edge-case-hunter] Pas de vérification de `TURSO_DATABASE_URL` avant connexion (erreur cryptique si absent/mauvais `--env`) — **false** au sens « régression » : comportement identique au script jumeau `add-mission-report-dt-code.ts` dont celui-ci reprend explicitement le pattern — pas une nouveauté de ce diff, hors périmètre d'un correctif isolé. Rejeté.
15. [edge-case-hunter] `breakdownTotal` (MissionWizard.tsx) ne filtre pas par catégories connues alors que le `sum` du step le fait — pourrait diverger si une clé hors-liste apparaissait dans la map — **false**. Vérifié : le seul point d'écriture des maps (`handleInterventionTypeChange`/`handleInterventionNatureChange`) n'est appelé que depuis la boucle du step sur les catégories connues — aucun chemin de code n'introduit de clé hors-liste aujourd'hui.
16. [edge-case-hunter] Migration idempotente seulement pour la table, pas pour l'index — même constat que #4. → patch P3 (même correctif).
17. [verification-gap, pré-vérifié] Suppression en cascade de `mission_report_interventions` jamais testée ; le schéma de test omettant la FK, un cascade cassé en prod ne serait détecté par aucun test — **medium**. → patch P4 (même correctif que #5).
18. [verification-gap, « Other findings »] Catégorie hors-groupe acceptée par le schéma partagé, avec démonstration concrète (`MALAISE` dans `intervention_types` stocké `breakdown='MODE'`, jamais affiché par `InterventionCard` qui ne lit que les catégories de son propre groupe) — **medium**, même root cause que #1/#12. → patch P1 (même correctif).

**Routage :** P1 (#1, #12, #18), P2 (#2, #11), P3 (#4, #16), P4 (#5, #17) → patch, ré-engagement de l'agent d'implémentation. Reste rejeté (false ou low non trivial/sans objet).

## Design Notes

Le nom de colonne `victim_count` est conservé côté DB/API pour limiter le footprint (aucune migration de renommage) — seul le libellé utilisateur devient « Nombre d'intervention », partout où il est affiché ou saisi. Le code interne (variables, id de champ) garde `victim_count`/`victim_count` par cohérence avec l'existant ; ne pas le renommer en `intervention_count` sans le demander explicitement.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreurs, 0 warnings
- `npm run test` -- expected: suite complète verte, incluant les nouveaux tests
- `npx tsx scripts/add-mission-report-interventions.ts` (dry-run) puis `--apply` sur un environnement de test -- expected: table créée, idempotent au second run

**Manual checks (if no CLI):**
- Soumettre un rapport avec `victim_count >= 1`, vérifier que l'étape de répartition bloque tant que les deux sommes ne correspondent pas, puis que la fiche détail affiche les deux répartitions.
- Ouvrir un rapport existant (créé avant cette fonctionnalité) et vérifier qu'aucune section répartition ne s'affiche, sans erreur.
