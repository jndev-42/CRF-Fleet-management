# Deferred Work

- source_spec: `_bmad-output/implementation-artifacts/spec-stock-csv-mass-import.md`
  summary: Remplacer les styles inline de `ImportCsvModal.tsx` par un CSS Module.
  evidence: Contredit la règle documentée dans `src/components/CLAUDE.md` ("Inline styles — only for dynamic values"), mais `StockModal.tsx`, `AddItemModal.tsx` et `EditItemModal.tsx` — le modèle imité — ont exactement le même défaut. Pré-existant, à traiter pour tout le dossier `modals/` en une fois plutôt qu'un seul fichier.

- source_spec: `_bmad-output/implementation-artifacts/spec-stock-csv-mass-import.md`
  summary: Ajouter `role="alert"`/`aria-live` sur les bandeaux d'erreur des modales d'inventaire.
  evidence: Aucune modale du dossier `src/components/inventory/modals/` n'a cet attribut aujourd'hui — lacune d'accessibilité systémique, pas spécifique à `ImportCsvModal`.

- source_spec: `_bmad-output/implementation-artifacts/spec-stock-csv-mass-import.md`
  summary: Ajouter une garde anti-double-soumission (`if (submitting) return`) dans les modales de stock/article.
  evidence: `StockModal.tsx` (modèle explicitement imité par `ImportCsvModal`) n'a pas cette garde ; un double-clic/double-Enter peut soumettre le formulaire deux fois avant que `disabled` ne prenne effet.

- source_spec: `_bmad-output/implementation-artifacts/spec-stock-csv-mass-import.md`
  summary: Mettre à jour `src/components/inventory/AGENTS.md` et `src/components/inventory/modals/AGENTS.md` pour refléter `ImportCsvModal` et la prop `onOpenImport`.
  evidence: Ces fichiers décrivent encore l'état pré-import ; laisseraient un futur agent travailler sur une carte du dossier incomplète. Correctif touchant des fichiers de contexte agent (AGENTS.md) — catégorie `defer` par règle.

- source_spec: `_bmad-output/implementation-artifacts/spec-missions-rework-ul-scope.md`
  summary: `GET /api/missions/[id]` compare `row.submitted_by === session.user.id` sans résoudre l'e-mail en id réel (contrairement à `GET /api/missions` liste, corrigé dans cette story) — pourrait 403 un soumetteur sur son propre rapport quand `session.user.id` est un repli e-mail en dev.
  evidence: Pré-existant — cette comparaison n'a pas été modifiée par ce diff, seule la condition `isMissionContributor` a été élargie autour d'elle. Si avéré, sévérité medium ; à confirmer en testant l'accès détail d'un CI/RPAPS en environnement dev avec repli e-mail actif.
