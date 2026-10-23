<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicles/[id]/metrics

## Purpose
Updates mileage and fuel level for manual (non-connected) vehicles. Blocked for vehicles with VIN (Renault Connect-integrated). Requires `canSuperviseVehicles` (SUPER_ADMIN, ADMIN, RESP_VEHICULE, PRESIDENT — not CADRE). Tracks changes and sends push notifications to admins. Touches `Vehicle` table.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | PATCH (`canSuperviseVehicles`) update mileage and/or fuel level |

## For AI Agents

### Working In This Directory
**PATCH /api/vehicles/[id]/metrics** — `canSuperviseVehicles` only (SUPER_ADMIN, ADMIN, RESP_VEHICULE, PRESIDENT — not CADRE). Updates `mileage` (number ≥ 0) and/or `fuelLevel` (0–100). Validates payload (both optional, but at least one required). Rejects if vehicle has VIN (Renault Connect vehicles auto-sync). Sends Web Push notification to ADMIN and RESP_VEHICULE roles with change summary (emoji formatting). Returns updated vehicle object or message if no changes detected.

**Key business rules:**
- Both fields optional; request fails if neither provided
- Cannot edit connected vehicles (VIN present) — returns 403
- Change detection: only updates if value differs from current
- Fuel type affects change message ("batterie" for Électrique, "carburant" otherwise)
- Push notification includes actor name, change summary, and vehicle link
- Non-blocking notification failure (logged but doesn't fail request)
- Returns refetched vehicle data after update

## Dependencies

### Internal
- `@/lib/db` — `Vehicle` table
- `@/lib/push` — `sendPushNotification()` for admin notifications
- `@/lib/roles` — `canSuperviseVehicles`
- `@/auth` — NextAuth v5 session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
