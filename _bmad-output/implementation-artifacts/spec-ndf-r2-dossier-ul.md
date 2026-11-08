---
title: 'Notes de frais rangées sur R2 sous ndf/<slug UL>/'
type: 'feature'
created: '2026-11-08'
status: 'done'
baseline_commit: '6b08e1666a6f7675defcb68db5301f1701c38fca'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les PDF scellés des notes de frais sont écrits à la racine du bucket R2 sous `{reportId}/v{n}-{attempt}.pdf`, toutes UL mélangées. Un script Apps Script externe synchronise R2 → Google Drive (préfixe configurable, mise à jour d'un fichier Drive quand l'ETag d'une MÊME clé change, mise à la corbeille des fichiers absents de R2) : il faut un fichier par note, rangé par UL, qui suit les signatures successives.

**Approach (décision utilisateur, option 1) :**
- **Copie publiée** : après chaque scellement persisté, le PDF courant est écrit à la clé FIXE `ndf/{slug UL}/{reportId}.pdf` (à la racine du dossier de l'UL, écrasée à chaque étape) — c'est elle que Drive synchronise (`R2_PREFIX = ndf/`).
- **Révisions internes** : les révisions versionnées s'écrivent sous `ndf-revisions/{slug UL}/{reportId}-v{n}-{attempt}.pdf` ; `r2Key` et `signatureRevisions[].r2Key` pointent ici (la base fait foi, rien ne change pour le téléchargement).
- **Migration** des notes existantes : déplacer leurs révisions sous `ndf-revisions/{slug}/`, repointer la base, créer leur copie publiée.

## Boundaries & Constraints

**Always:**
- Révisions toujours versionnées et neuves, ordre `PUT révision` → transaction base inchangé. La copie publiée s'écrit APRÈS le commit, en best-effort : son échec est journalisé (`console.error`) et ne fait jamais échouer la transition.
- Segment UL = slug assaini (`[^a-zA-Z0-9_-]` → `_`) ; UL introuvable ou slug vide → `ulId` assaini.
- Migration : dry-run par défaut, `--apply` pour écrire, `--env <fichier>` (défaut `.env.local`), bilan final, code de sortie ≠ 0 si au moins un échec. UPDATE gardé par `WHERE id = ? AND r2Key IS ? AND signatureRevisions IS ?` (note scellée entre-temps → sautée, signalée). Idempotente : une note déjà rangée n'est pas recopiée ; un slug renommé est regroupé au prochain passage. La copie publiée est réécrite depuis la révision courante en base (contenu identique ⇒ ETag identique ⇒ Drive ne bouge pas).
- Anciens objets conservés par défaut ; `--delete-old` (exige `--apply`) supprime, après UPDATE réussi, les anciennes clés de révision déplacées et une copie publiée restée dans l'ancien dossier d'un slug renommé.
- Objet source absent → note sautée, base intacte, erreur listée.

**Never:**
- Ne pas toucher `expenses-staging/…`, `demo/…` ni les objets orphelins non référencés en base.
- Pas de changement de schéma ; pas de déplacement automatique au renommage d'un slug.
- Jamais écraser une clé de révision.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Scellement | note UL `paris-18`, étape 2 | révision `ndf-revisions/paris-18/{id}-v2-{att}.pdf` en base + copie `ndf/paris-18/{id}.pdf` | N/A |
| Copie publiée en échec | PUT copie lève | transition validée, base à jour | erreur journalisée |
| UL sans slug | `ulId` absent de UniteLocale | segment = `ulId` assaini | N/A |
| Migration ancienne clé | `rep-1/v1-abc.pdf` | `ndf-revisions/paris-18/rep-1-v1-abc.pdf` + copie publiée | N/A |
| Déjà rangée | révisions sous `ndf-revisions/paris-18/` | aucune copie de révision, copie publiée réécrite | N/A |
| Slug renommé | révisions sous `ndf-revisions/ancien/` | déplacées sous `ndf-revisions/nouveau/` (même nom) | N/A |
| Source manquante | GET → null | note sautée | erreur listée, exit 1 |
| Concurrence | r2Key changé avant UPDATE | note sautée (0 ligne) | avertissement |
| Brouillon | `r2Key` NULL | ignoré | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/r2.ts:89` -- `buildExpenseKey(reportId, revision, attempt)` → `buildExpenseKey(ulSegment, reportId, revision, attempt)` (préfixe `ndf-revisions/`) ; ajouter `expenseUlSegment(slug, ulId)` et `buildExpensePublishedKey(ulSegment, reportId)`.
- `src/lib/expenses/sealing.ts:125` -- `loadReport` : `LEFT JOIN "UniteLocale"` pour le slug ; les 4 `buildExpenseKey` (l.236, 300, 444, 482) ; `SealResult` gagne `publishedKey`.
- `src/lib/expenses/persist-seal.ts` -- après `tx.commit()`, `putObject(last.publishedKey, last.buffer)` en try/catch.
- `scripts/backfill-signed-pdfs.ts:203` -- adapter `buildExpenseKey` (lire le slug) ; écrire aussi la copie publiée après l'UPDATE.
- `scripts/backfill-signed-pdfs.ts:31-38` -- modèle `--env`/dotenv ; jamais `SELECT *` sur toutes les notes (signatures base64 bloquent libSQL) : lister les ids puis lire note par note.
- `src/__tests__/unit/r2.test.ts:21-37`, `src/__tests__/integration/expenses.test.ts:15`, `expense-sealing-chain.test.ts:27` -- mocks/attentes de `buildExpenseKey` à adapter.
- `src/app/api/expenses/[id]/pdf/route.ts` -- lit `r2Key` : inchangé.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/r2.ts` -- constructeurs de clés.
- [x] `src/lib/expenses/sealing.ts`, `persist-seal.ts` -- révisions par UL + copie publiée post-commit.
- [x] `scripts/backfill-signed-pdfs.ts` -- adapter.
- [x] `src/lib/expenses/r2-relocation.ts` (nouveau) -- `relocatedRevisionKey(oldKey, segment)` pure (dernier segment si déjà sous `ndf-revisions/`, sinon segments joints par `-`) et `relocateReport(row, deps)` (`get/put/head/delete` + exécution SQL injectés) appliquant la matrice.
- [x] `scripts/move-expense-pdfs-to-ul-folders.ts` (nouveau) -- migration CLI.
- [x] Tests : `src/__tests__/unit/r2.test.ts`, `src/__tests__/unit/expense-r2-relocation.test.ts` (nouveau), persist-seal / intégration expenses.
- [x] `CLAUDE.md` (Commands : ligne du script, à lancer APRÈS déploiement, `R2_PREFIX = ndf/` côté synchro Drive), `CHANGELOG.md`, `package.json`/`package-lock.json` → 5.47.0.

**Acceptance Criteria:**
- Given une note scellée après déploiement, when on liste `ndf/{slug}/`, then elle y figure une seule fois sous `{reportId}.pdf`, identique au PDF téléchargé depuis l'appli.
- Given le dry-run, when il termine, then rien n'est écrit et le plan liste chaque note et chaque déplacement.

## Verification

**Commands:**
- `npm run lint` -- 0 erreur, 0 avertissement
- `npm run test` -- vert

## Implementation Notes

- Implémenté par sous-agent ; lint 0/0, 4 fichiers de tests ciblés verts (140 tests), suite complète verte selon l'agent.

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|--------|---------|---------|----------------|
| 1 | edge | entrée `null` dans `signatureRevisions` → TypeError hors try, migration interrompue | low | `rev.r2Key` lu sans garde dans `relocateReport` ; correction directe → patch |
| 2 | blind+edge | `\|\| null` du script transforme `''` en NULL → garde `IS NULL` jamais vraie, note sautée à chaque passage | medium | script l.294 → patch |
| 3 | blind+edge+vgap | suppression super-admin d'une note scellée laisse `ndf/{UL}/{id}.pdf` → Drive garde la note | medium | `[id]/route.ts:729` ne touche pas R2 → patch (suppression best-effort de la copie publiée) |
| 4 | edge+blind | `--delete-old` lors d'un passage ultérieur ne supprime rien (anciennes clés plus en base) | medium | `oldKeys` ne vient que de la base → patch : reconstituer la clé historique `{id}/{reste}` depuis le nom rangé |
| 5 | blind+edge | dry-run `--delete-old` omet la copie publiée périmée | low | branche dry-run sans `staleFolders` → patch |
| 6 | blind+edge | `--delete-old` concurrent d'une validation en cours → validation en échec | low | fenêtre de quelques ms, l'utilisateur réessaie → patch (documenter : période calme) |
| 7 | blind | base démo pointe d'anciennes clés supprimées jusqu'à la recopie nocturne | low | lecture démo retombe sur la vraie clé → patch (documenter : recopier la démo) |
| 8 | vgap | slug ≠ id jamais observé dans les tests de scellement | medium (gap) | seed `slug = id` + regex lâches → patch test |
| 9 | vgap | transition concurrente : absence d'écriture de la copie publiée non testée | medium (gap) | → patch test |
| 10 | blind | tests manquants (journal NULL + déplacement, r2Key hors journal, étape simple) | low | → patch tests |
| 11 | blind | copie publiée en échec jamais réparée automatiquement (dernière étape) | medium | best-effort voulu par la spec ; réparation = relancer le script → defer (réconciliation cron) |
| 12 | vgap | scripts CLI non testés | medium (gap) | dépôt sans tests de scripts, dry-run affiche les dossiers → defer |
| 13 | blind+edge | publications post-commit hors d'ordre entre deux étapes | low | étapes successives séparées par une action humaine et un scellement de plusieurs secondes ; relancer le script répare → rejeté |
| 14 | blind+edge | migration : PUT de la copie publiée après un scellement concurrent | low | fenêtre de quelques ms pendant la migration ; relance répare → rejeté |
| 15 | edge | slug renommé entre deux étapes → copies dans deux dossiers | false | comportement voulu (Never : pas de déplacement auto) ; la migration regroupe → rejeté |
| 16 | blind | UPDATE de migration sans `updatedAt` | false | rangement technique, pas une modification de la note ; volontaire → rejeté |
| 17 | blind | `reportId` non assaini dans les clés | false | ids générés côté serveur (UUID) → rejeté |
| 18 | blind | note d'exploitation sur le changement de `R2_PREFIX` | low | consigne d'exploitation transmise à l'utilisateur, pas de code → rejeté |
| 19 | blind | changelog muet sur la transition | false | changelog orienté utilisateur, étapes ops exclues par convention → rejeté |
| 20 | edge | « le dry-run s'arrête à la première source manquante » | false | l'erreur ne concerne que la note, la boucle continue → rejeté |
