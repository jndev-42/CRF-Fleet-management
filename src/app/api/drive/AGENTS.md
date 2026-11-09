<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-11-08 -->

# Drive

## Purpose
**Lecture seule, transition.** Proxy des fichiers encore référencés par un id Google Drive : justificatifs de notes de frais (`ExpenseReport.driveFolderId`, hors périmètre de la migration) et photos de trajet / incident / mission non encore migrées. Les nouveaux fichiers vont sur R2 via [`/api/media/*`](../media/AGENTS.md) ; `scripts/migrate-drive-images-to-r2.ts` rattrape l'existant.

## Subdirectories
- [`photos`](photos/AGENTS.md) — List photos from a Drive folder hierarchy (emprunt/rendu subfolders or flat mode for receipts)
- [`photos/[fileId]`](photos/[fileId]/AGENTS.md) — Stream/download individual files from Drive (acts as secure proxy)

L'ancienne route d'envoi `upload` a été supprimée (v5.48.0) : plus aucune écriture sur Drive.

## For AI Agents

### Working In This Directory
Choisir l'URL côté client avec `mediaFileUrl` / `mediaListUrl` (`@/lib/imageCompression`) : une référence contenant `/` est R2, sinon Drive. Ne jamais ajouter d'écriture ici.

**Mock mode:** Routes detect `mock-` prefixed folder/file IDs and return mock data locally (no Drive calls).

## Dependencies

### Internal
- `@/lib/drive` — Google Drive client (singleton)
- `@/lib/driveAuth` — rattachement d'un dossier à son enregistrement (mêmes règles pour R2)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
