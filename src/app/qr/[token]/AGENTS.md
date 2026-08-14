<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# qr/[token]

## Purpose
QR-code landing page (`/qr/{token}`) — the mobile-first flow a volunteer gets after scanning the sticker on a vehicle. It shows a compact vehicle card (status badge, plate, type, mileage, fuel/battery gauge, parking spot), the active trip if any, and drives a three-step state machine: **view → checkout → checkin**, plus incident declaration. Deliberately scoped to a single vehicle: no navigation into the rest of the app, no vehicle list.

## Key Files
| File | Description |
|------|-------------|
| `page.tsx` | `QRVehiclePage` (the state machine and vehicle card) plus two co-located form components, `CheckOutForm` and `CheckInForm`, and a local `formatDate` helper. |

## For AI Agents

### Working In This Directory
**Authentication is still required** — a 401 from `GET /api/qr/{token}/vehicle` redirects to `/login?callbackUrl=/qr/{token}`. The QR code is a shortcut, not an anonymous bypass; the blue banner ("Accès via QR Code — limité à ce véhicule uniquement") states the scope to the user. **No role check happens client-side**: authorization for both actions lives entirely in the `/api/qr/{token}/*` routes. Do not add a permissive client path that assumes the token implies permission.

**Check-in is restricted to the trip's own drivers**: `activeTrip.driverId === currentUserId || activeTrip.secondDriverId === currentUserId` — note there is **no ADMIN override here**, unlike `/vehicles/[id]`. Non-drivers see an explanatory card instead of the button. `currentUserId` comes from a manual `GET /api/auth/session` fetch (this page does not use `useSession()`), so it is briefly `null` on first paint.

Status drives the actions: `AVAILABLE` → borrow button; `IN_USE` → return button or the "seul l'emprunteur" notice; `MAINTENANCE` → unavailable notice. "Déclarer un incident" is always available.

Both forms post to token-scoped endpoints (`POST /api/qr/{token}/checkout`, `POST /api/qr/{token}/checkin`) — never to `/api/trips`. Errors render inline in a red box rather than via `alert()`.

Conditional form logic worth preserving:
- **Connected vehicles** (`!!vehicle.vin`) omit the mileage/fuel inputs entirely on check-in and show a green "récupérés automatiquement" notice — telemetry supplies those values server-side. Non-connected vehicles require both, pre-filled with the last known values.
- **Mission types** are a hardcoded list; `Désinfection` is appended **only for VPSP vehicles** (`type.toUpperCase().includes('VPSP')`).
- Two mutually exclusive disinfection blocks on check-in: `isDesinf` (VPSP on a Désinfection mission) requires **responsable + numéro de lot**; `hasDesinfTracking` (`desinfTracking && !isVPSP`) requires **numéro de lot + type** (simple/complète). Both are validated client-side before submit, and the submitted body sends `desinfResponsable` only in the first case and `desinfType` only in the second.
- The DSA checklist answer is read out of the checklist responses under the key `dsa-checkout-${vehicle.id}` and sent as the separate `dsaChecked` field. That key format is a contract with `ChecklistItems`.
- Empty strings are normalised to `undefined` before submit so optional fields are omitted rather than blanked.

After a successful action the page switches to a `done` success screen; the "Retour" button clears it, refetches, and returns to `view`. The forms are unmounted at that point, so state resets naturally.

This page defines its **own local `formatDate`** and `QRVehicle`/`ActiveTrip` types rather than importing from `@/app/vehicles/[id]/*` — its API payload is a narrower, QR-specific shape. Don't swap in the `Vehicle` type without checking the endpoint actually returns those fields.

Styling is almost entirely inline (this page has no CSS Module and mostly bypasses the global page classes) because it renders standalone outside the app shell. The CRF logo uses `<img>` with an `@next/next/no-img-element` disable.

## Dependencies

### Internal
- `@/components/vehicle/FuelBar`, `@/components/vehicle/ChecklistItems`
- `@/components/vehicle/modals/IncidentReportModal`
- `@/components/ui/UserCombobox`
- `GET /api/qr/{token}/vehicle`, `POST /api/qr/{token}/checkout`, `POST /api/qr/{token}/checkin`
- `GET /api/auth/session`, `GET /api/users` (disinfection responsable picker)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
