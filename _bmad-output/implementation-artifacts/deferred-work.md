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

- source_spec: `_bmad-output/implementation-artifacts/spec-ul-qrcode-mission-report.md`
  summary: Ajouter le bouton « QR Code » dans `ULsTab.tsx` et la modale `ULQRCodeModal.tsx` (affichage/téléchargement/régénération du QR d'une UL, modèle exact `QRCodeModal.tsx` des véhicules).
  evidence: Scindé pour rester sous la cible de 900-1600 tokens de la spec principale. Dépend uniquement de `GET/POST/DELETE /api/ul/[id]/qr-token` (livré par la spec principale) — aucune dépendance inverse. Jusqu'à son implémentation, le lien QR d'une UL reste récupérable via l'API mais pas via l'interface admin.

- source_spec: `_bmad-output/implementation-artifacts/spec-ul-qrcode-mission-report.md`
  summary: `MissionWizard.handleSubmit` ne gère pas spécifiquement une réponse 401 sur `submitEndpoint` (pas de redirection vers `/login`, contrairement à la résolution du token dans `qr-ul/[token]/page.tsx`) — un bénévole dont la session expire pendant le remplissage voit une erreur générique au lieu d'être renvoyé se reconnecter.
  evidence: Préexistant — le flux classique `/missions/new` a exactement la même lacune ; pas introduit par cette story. Trouvé par edge-case-hunter lors de la revue de cette spec.

- source_spec: `_bmad-output/implementation-artifacts/spec-ul-qrcode-mission-report.md`
  summary: `src/app/qr-ul/[token]/page.tsx` (blocs chargement/erreur) n'a ni `role="status"`/`aria-live` ni `role="alert"`.
  evidence: Préexistant — lacune identique déjà présente dans `src/app/qr/[token]/page.tsx` et `src/app/qr-stock/[token]/page.tsx`, modèles explicitement imités par cette page ; à corriger pour les trois pages QR ensemble plutôt qu'une seule. Trouvé par blind-hunter lors de la revue de cette spec.

- source_spec: `_bmad-output/implementation-artifacts/spec-ul-qrcode-mission-report.md`
  summary: En mode verrouillé QR sur l'UL Paris 18, `MissionWizard` diffère `onSuccess` via `MarineApprovedOverlay` (~3.7s) — aucun test ne vérifie que l'appel finit par arriver pour cette combinaison précise (verrouillage + Paris 18).
  evidence: Interaction cosmétique étroite (l'easter egg d'animation, pas la création du rapport, intégralement vérifiée). Le test d'animation préexistant n'attendait déjà pas l'issue avant ce diff ; le nouveau test verrouillé utilise délibérément une autre UL. Ajouter `vi.useFakeTimers()` + avancer le minuteur dans le test d'animation existant réglerait la question. Trouvé par verification-gap lors de la revue de cette spec.
