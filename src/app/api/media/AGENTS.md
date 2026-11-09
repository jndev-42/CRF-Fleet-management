<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-11-08 -->

# Media (R2)

## Purpose
Photos d'emprunt/rendu, d'incident, de communication de mission et rapport de mission signé, stockés sur R2 sous `{type}/{slug UL}/{nom}-{AAAAMMJJ-HHmmss}-{xxxx}/…` (voir `src/lib/media/refs.ts`).

| Route | Rôle |
|-------|------|
| `upload/route.ts` | POST multipart — `type`, `vehicleId` (trajet, incident) ou `ulId` + `name` (mission), `stage` (`emprunt`/`rendu`, trajet), `existingFolderId`. Réponse `{ folderId, subfolderId, fileIds }` (préfixe, clés). |
| `photos/route.ts` | GET `?folderId=<préfixe>[&flat=true]` — `{ emprunt, rendu }` ou, avec `flat=true`, `{ photos }`. |
| `file/route.ts` | GET `?key=<clé>` — stream, Content-Type par extension, `Cache-Control: private`. |

## For AI Agents
- Le dossier est TOUJOURS construit côté serveur ; UL = `Vehicle.ulId`, ou pour une mission l'`ulId` envoyé si l'utilisateur en est membre (`UserUL`) ou SUPER_ADMIN, sinon son UL de rattachement, à défaut celle de la session. Le client n'envoie jamais de clé.
- Droits d'envoi : `tripId` (rendu) → gestionnaire de l'UL du véhicule ou conducteur / second conducteur du trajet, quelle que soit l'UL ; emprunt → même règle que `POST /api/trips` ; incident → tout compte actif.
- Toute route qui ÉCRIT une référence en base appelle `assertRefBindable` (`@/lib/media/server`) : bon type, segment UL de l'enregistrement, portée par aucun autre enregistrement (sinon 400). Toute suppression passe par `deleteMediaRefIfUnshared`.
- Autorisation : `canAccessFolder` / `canAccessMediaKey` (`@/lib/media/access`) — appariement de la colonne sur les 3 premiers segments, ou sur la clé exacte pour le rapport signé. Un préfixe non rattaché n'est accepté en `existingFolderId` que s'il existe déjà sur R2 dans l'UL résolue (lot suivant d'un envoi).
- Démo : pas dans `DEMO_EXTERNAL_WRITE_ROUTES` — `r2.ts` range les écritures démo sous `demo/`.
- Aucune colonne dédiée : les colonnes `driveFolderId` / `drive_folder_id` / `signed_report_drive_id` portent un préfixe ou une clé R2 (contient `/`) ; une valeur sans `/` (id Drive résiduel) ne désigne aucun fichier : rien à lister, afficher ni supprimer.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
