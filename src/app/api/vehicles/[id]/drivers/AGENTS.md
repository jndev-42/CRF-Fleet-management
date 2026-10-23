<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-10-23 | Updated: 2026-10-23 -->

# vehicles/[id]/drivers

## Purpose
Lists the candidates for "2ème conducteur" on the vehicle page: the checkout modal (`CheckOutModal`) and the "Ajouter 2nd cond." form of the active-trip banner (`useVehicleDetail` → `ActiveTripBanner`). Replaces `GET /api/users?vehicleType=…`, which is manager-only (`canAccessAdminPanel`) and returned 403 — hence an empty list — to drivers.

**`[id]` is the vehicle UUID here** (unlike `GET /api/vehicles/[id]`, which takes the name), like the other sub-routes (`reservations`, `checklist`).

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET — eligible second drivers for this vehicle |

## For AI Agents

### Working In This Directory

**Auth & Access:**
- `session?.user` (401); `isInactive(roles)` (403 — an empty role list is refused here, unlike the QR flow).
- UL scoping identical to `POST /api/trips`: `isOutsideUl(roles, session.user.ulId, vehicle.ulId)` → **404**, indistinguishable from an unknown id (no fleet-state oracle). SUPER_ADMIN is exempt.

**Business Rules (all in `@/lib/eligibleDrivers`):**
- The **vehicle** is UL-scoped, but the **candidates** come from all local units (product decision, 2026-10-23 — same population as the former `/api/users?vehicleType=` and as `GET /api/qr/[token]/drivers`).
- Driving role for the vehicle type (`driverRoleForVehicleType`), excluding INACTIF/GUEST accounts and the caller.
- Exposes only `id`, `name`, `email`.
- `POST /api/trips` re-checks the chosen driver with `secondDriverError()`.

**Response Shape (success):**
```json
{ "users": [{ "id": "uuid", "name": "Marie Martin", "email": "marie@croix-rouge.fr" }] }
```

## Dependencies

### Internal
- `@/lib/eligibleDrivers` — `listEligibleDrivers`
- `@/lib/roles` — `isInactive`
- `@/lib/apiAuth` — `isOutsideUl`, `unauthorizedResponse`, `forbiddenResponse`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
