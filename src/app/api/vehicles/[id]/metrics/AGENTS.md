<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicles/[id]/metrics

## Purpose
Updates mileage and fuel level for manual (non-connected) vehicles. Blocked for vehicles with VIN (Renault Connect-integrated). ADMIN/RESPO only. Tracks changes and sends push notifications to admins. Touches `Vehicle` table.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | PATCH (ADMIN/RESPO) update mileage and/or fuel level |

## For AI Agents

### Working In This Directory
**PATCH /api/vehicles/[id]/metrics** — ADMIN/RESPO only. Updates `mileage` (number ≥ 0) and/or `fuelLevel` (0–100). Validates payload (both optional, but at least one required). Rejects if vehicle has VIN (Renault Connect vehicles auto-sync). Sends OneSignal push notification to ADMIN role with change summary (emoji formatting). Returns updated vehicle object or message if no changes detected.

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
- `@/lib/onesignal` — `sendPushNotification()` for admin notifications
- `@/lib/roles` — `canAccessAdminPanel`
- `@/auth` — NextAuth v5 session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
