<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicles/[id]/checklist

## Purpose
Manages vehicle checkout/checkin checklists. Lists checklist items by type (checkout/checkin/all), and allows admins to add new items. Items have a label, type, required flag, and order index. Auto-ordered by creation. Used by CheckOutModal and CheckInModal in the UI. Touches `VehicleChecklistItem` table.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (any auth) fetch checklist items; POST (ADMIN) create item |

## For AI Agents

### Working In This Directory
**GET /api/vehicles/[id]/checklist** — Any authenticated user of the vehicle's UL (cross-UL (`isOutsideUl` from `@/lib/apiAuth`, resolved via the vehicle's `ulId`) → **404**, indistinguishable from an unknown id; a session without UL (`'default'`) is refused too. SUPER_ADMIN only escapes it. The QR forms, open across ULs, read `GET /api/qr/[token]/checklist` instead). Fetches checklist items for this vehicle, optionally filtered by `?type=checkout|checkin`. Returns array of items ordered by `order` ASC, then `createdAt` ASC.

**POST /api/vehicles/[id]/checklist** — ADMIN only. Creates new checklist item with `label` (1–200 chars), `type` ('checkout' or 'checkin'), optional `required` boolean. Automatically assigns next `order` value for this vehicle + type (count current items). Returns created item with `{ id, vehicleId, label, type, required, order, createdAt }` 201.

**Key business rules:**
- `[id]` is vehicle name; resolved internally if needed
- DSA checkout item auto-created if vehicle has `hasDSA=true` (ID: `dsa-checkout-{vehicleUuid}`)
- Order computed per vehicle-type pair (e.g., all checkout items ordered separately from checkin)
- Required flag defaults to false
- Items are immutable once created (no PUT/PATCH for individual items in this route)

## Dependencies

### Internal
- `@/lib/db` — `VehicleChecklistItem` table
- `@/lib/roles` — `canManageVehicles`
- `@/auth` — NextAuth v5 session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
