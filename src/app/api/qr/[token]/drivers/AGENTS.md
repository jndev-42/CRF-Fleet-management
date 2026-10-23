<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-10-23 | Updated: 2026-10-23 -->

# QR [token] Drivers

## Purpose
Lists the candidates for "2ème conducteur" in the QR checkout form (`src/app/qr/[token]/CheckOutForm.tsx`, via `useQrDrivers`). Needed because `GET /api/users` is manager-only (`canAccessAdminPanel`): a driver or a role-less account scanning a QR code would otherwise get an empty list.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET — eligible second drivers for the vehicle behind the token |

## For AI Agents

### Working In This Directory

**Auth & Access:**
- Same as the rest of the QR flow: `session?.user` (401), `!isQrBlocked(roles)` (403). A role-less account is allowed. No UL check (QR bypass).
- Unknown token → 404 `QR Code invalide ou expiré`.

**Business Rules (all in `@/lib/eligibleDrivers`):**
- Candidates hold the driving role for the vehicle type — `driverRoleForVehicleType`: CHVPSP for a VPSP, CHVL otherwise (same rule as `canBorrow` in `POST /api/trips`).
- **All local units** (product decision, 2026-10-23): a mixed crew on reinforcement must be selectable.
- Excludes accounts carrying INACTIF or the legacy GUEST, and the caller.
- Exposes only `id`, `name`, `email` — never roles, licence status or UL.

**Server-side enforcement:** the list is only a UI filter. `POST /api/qr/[token]/checkout` and `POST /api/trips` re-check the chosen `secondDriverId` with `secondDriverError()` (same predicate, 400 on failure). Keep the list and the check on the shared predicate — never filter in one place only.

**Response Shape (success):**
```json
{ "users": [{ "id": "uuid", "name": "Marie Martin", "email": "marie@croix-rouge.fr" }] }
```

## Dependencies

### Internal
- `@/lib/eligibleDrivers` — `listEligibleDrivers`
- `@/lib/roles` — `isQrBlocked`
- `@/lib/apiAuth` — `unauthorizedResponse`, `forbiddenResponse`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
