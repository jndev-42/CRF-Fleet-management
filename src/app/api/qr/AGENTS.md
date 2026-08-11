<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# QR

## Purpose
Container for QR token-based vehicle checkin/checkout flow. QR tokens bypass normal session-based auth and UL boundaries, allowing any authenticated non-INACTIF user to scan and interact with a physical vehicle's QR code. Drives the trip lifecycle: checkout (create trip), checkin (finalize trip, update vehicle status).

## Subdirectories
- `[token]/` — dynamic QR token container
  - `checkin/` — finalize trip checkin
  - `checkout/` — start trip checkout
  - `vehicle/` — resolve token to vehicle + active trip

## For AI Agents

### Key Concepts

**QR Auth Model:**
- No parent route files; endpoints live in leaf directories.
- All routes require `session?.user` (401 if missing) and non-INACTIF status (403 if inactive).
- **No UL or role-based access control** — the QR token itself grants access. Any authenticated user can scan.

**Trip Lifecycle:**
1. **Checkout (POST `/api/qr/[token]/checkout`):** Creates Trip record, marks vehicle IN_USE, captures initial mileage/fuel from Renault or user input.
2. **Vehicle Lookup (GET `/api/qr/[token]/vehicle`):** Resolves token → vehicle + active trip data (no-op, returns vehicle + trip if exists).
3. **Checkin (POST `/api/qr/[token]/checkin`):** Finalizes active trip, updates vehicle to AVAILABLE, validates Renault data window (5-min), optionally updates desinfDate if mission type = 'Désinfection'.

**Renault Connect Integration:**
- Optional: if vehicle has a VIN and data is missing (mileageIn/fuelIn), fetches live cockpit data.
- Validates cockpit timestamp is within 5 minutes of checkin time; marks `renaultDataValidated = 1` if within window, `0` if stale.

## Dependencies

### Internal
- `db` (libSQL)
- `auth` from `@/auth`
- `@/lib/roles` — `isInactive()`, `isAdminOrAbove()`
- `@/lib/renault` — `getRenaultVehicleData(vin)` for live vehicle telemetry

### Tables Touched
- `Vehicle` (lookup by qrToken, status update, mileage/fuel update)
- `Trip` (create on checkout, update on checkin, query active trip)
- `User` (LEFT JOINs for driver names/emails)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
