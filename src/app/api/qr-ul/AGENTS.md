<!-- Generated: 2026-10-23 | Updated: 2026-10-23 -->

# qr-ul

## Purpose
UL QR-code flow (`/qr-ul/[token]`): any signed-in account not carrying INACTIF/GUEST (`isQrBlocked`) can file a mission report for the UL behind the token. The token — never the client — decides the UL.

## Subdirectories
- `[token]/route.ts` — GET: resolve the token to the UL (`id`, `name`).
- `[token]/mission-report/` — POST: create a mission report attached to the token's UL (`selected_ul_id` overwritten server-side).
- `[token]/vehicles/` — GET: vehicles of the **token's** UL (`id`, `name`, `type`) for the « Équipage » step. Not `GET /api/vehicles`, which returns the **session's** UL vehicles.
- `[token]/drivers/` — GET: mission drivers (`listMissionDrivers`, `@/lib/eligibleDrivers`). Not `GET /api/users?drivers=true`, which is manager-only.

## For AI Agents
- Every route: `session?.user` (401), `isQrBlocked` (403), unknown token → 404 `QR Code invalide ou expiré`.
- The wizard receives these list sources through `MissionWizard`'s `crewEndpoints` prop (`src/app/qr-ul/[token]/page.tsx`); `/missions/new` uses the defaults (`/api/vehicles`, `/api/missions/drivers`).
