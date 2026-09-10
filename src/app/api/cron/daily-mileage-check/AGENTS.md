<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# daily-mileage-check

## Purpose
Daily cron job (scheduled via Vercel) that checks Renault Connect telemetry against stored vehicle mileage. Detects unauthorized vehicle usage: if mileage increases > 2 km but no trip was logged today, sends push notification alert to all admins. Updates stored mileage in database. Also cleans up expired reservations older than current time. Touches `Vehicle`, `Trip`, `Reservation` tables.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (cron job) — protected by `CRON_SECRET` header, not NextAuth auth |

## For AI Agents

### Working In This Directory
**GET** is triggered by Vercel cron (registered in `vercel.json`). Checks `Authorization: Bearer ${CRON_SECRET}` header; returns 401 if missing or invalid.

Flow:
1. Delete all reservations with `endTime < now`.
2. For each connected vehicle (`JOIN VehicleConnection vc ON vc.vehicleId = v.id AND vc.status IN ('CONNECTED','ERROR')` — `ERROR` rows are retried, there is no backoff):
   - Fetch Renault telemetry via `getRenaultVehicleData(v.id, { failedCredentials })`.
   - If mileage jumped > 2 km and no trip logged today: send push notification to ADMIN role via OneSignal, update Vehicle.mileage.
   - Otherwise silently update mileage if it increased (buffer for GPS/telemetry variance).
3. Skip maintenance vehicles. Every loop iteration is wrapped in `try/catch` + `continue`: one failing vehicle must never abort the run. `failedCredentials` is a `Set` created **per run** — never at module level — so one refused login does not trigger a burst of retries against Gigya.

Push notification tags: `role_ADMIN = true`. Payload includes vehicle name and km delta.

Returns 200 with `{ success: true, alertsSent: [...], reservationsDeleted: N }` on success, 500 on error.

## Dependencies

### Internal
- `Vehicle`, `Trip`, `Reservation` tables
- `@/lib/vehicle-connection` — `getRenaultVehicleData(vehicleId, { failedCredentials })`
- `@/lib/onesignal` — `sendPushNotification()` (lazy-imported)
- `process.env.CRON_SECRET` — Authorization check

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
