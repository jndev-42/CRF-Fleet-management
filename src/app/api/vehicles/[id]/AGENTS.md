<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicles/[id]

## Purpose
Vehicle-specific endpoints: fetch full details (including trip history, active maintenance, and advanced fields), update vehicle metadata, and delete a vehicle (cascades to trips and Drive folders). `[id]` is the **vehicle name** (not UUID). Touches `Vehicle`, `Trip`, `User`, `VehicleMaintenance` tables; coordinates with Google Drive for folder deletion.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (any auth) fetch vehicle details; PATCH (ADMIN) update metadata; DELETE (ADMIN) remove vehicle and trips |

## Subdirectories
- `checklist` — Checkout/checkin checklist items for this vehicle
- `desinfections` — Disinfection history (VPSP or tracking-enabled)
- `incidents` — Incident reports for this vehicle
- `maintenance` — Maintenance records (historical log with pagination)
- `maintenance/[recordId]` — Delete individual maintenance record
- `maintenance-events` — Create/end active maintenance windows
- `metrics` — Update mileage/fuel (admin/RESPO only, blocked for VIN vehicles)
- `qr-token` — Lazy-create or regenerate QR bypass token
- `reservations` — List/create reservations (single or recurrence)
- `trips` — Clear all trips for this vehicle
- (parent) `calendar` — Month-scoped view across all vehicles

## For AI Agents

### Working In This Directory
**GET /api/vehicles/[id]** — Any authenticated user. Resolves `[id]` (vehicle name) to UUID. Returns full vehicle object including trips (last 20), active maintenance (if any), and computed `effectiveStatus` (syncs DB if out of date). Includes fields: `id`, `name`, `plate`, `type`, `status`, `mileage`, `fuelLevel`, `hasDSA`, `desinfTracking`, `vin`, `fuelType`, `maxFuelCapacity`, `maxBatteryCapacityKwh`, `firstRegistrationDate`, `revisionKmInterval`, `revisionYearInterval`, `createdAt`, `updatedAt`.

**PATCH /api/vehicles/[id]** — ADMIN only. Updates optional fields (name, plate, status, fuel, mileage, DSA, desinfTracking, etc.). Validates unique name/plate across other vehicles. If `hasDSA` changes, adds/removes DSA checkout checklist item. Returns updated vehicle (or message if no changes).

**DELETE /api/vehicles/[id]** — ADMIN only. Deletes vehicle, all its trips, and associated Google Drive folders (non-blocking). Resolves vehicle name to UUID first. Returns `{ success: true }` or 404 if vehicle not found.

**Key business rules:**
- `[id]` is vehicle name, not UUID (user-friendly URL)
- Vehicle UUID resolved via `SELECT id FROM Vehicle WHERE name = ?`
- Effective status synced: active maintenance + status ≠ IN_USE ⇒ MAINTENANCE
- DSA checklist item ID: `dsa-checkout-{vehicleUuid}`
- Trip response includes driver names, email, mission type, checkin/checkout times, parking photos, Renault data validation status, desinfection fields
- Cascading delete: Drive folders cleaned up via `deleteDriveFolder()` (Promise.allSettled for non-blocking)

## Dependencies

### Internal
- `@/lib/db` — parameterized SQL, transaction support
- `@/lib/drive` — `deleteDriveFolder()` for Drive cleanup
- `@/lib/roles` — `isAdminOrAbove`
- `@/auth` — NextAuth v5 session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
