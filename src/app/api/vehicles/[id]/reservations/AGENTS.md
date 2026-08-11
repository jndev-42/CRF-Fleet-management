<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicles/[id]/reservations

## Purpose
Manages vehicle reservations: single-slot and recurring. Supports conflict detection (no overlapping VALIDATED or PENDING), automatic status based on role (ADMIN/RESPO auto-validates), and on-behalf-of/unassigned-driver options. Sends push notifications to admins/RESPO on pending reservations. Touches `Reservation` table.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (any auth) list reservations; POST (any auth) create single or recurring |

## For AI Agents

### Working In This Directory
**GET /api/vehicles/[id]/reservations** — Any authenticated user. Lists all reservations for this vehicle ordered by `startTime ASC`. Fields: `id`, `vehicleId`, `userEmail`, `userName`, `startTime`, `endTime`, `reason`, `status`, `createdAt`, `recurrenceGroupId`.

**POST /api/vehicles/[id]/reservations** — Any authenticated user. Creates reservation(s) with two flows:

1. **Simple single reservation**: `{ startTime, endTime, reason?, onBehalfOfUserId?, isUnassignedDriver? }`
   - Validates: startTime < endTime, startTime in future
   - Status: VALIDATED if user is ADMIN/RESPO/CADRE/PRESIDENT, else PENDING
   - Conflict check: blocks on any VALIDATED or PENDING overlap
   - Non-ADMIN users cannot use `onBehalfOfUserId` or `isUnassignedDriver`
   - Returns `{ success: true, id, status }` 201

2. **Recurring reservation**: `{ recurrence: { daysOfWeek: [0-6], startHour: "HH:mm", endHour: "HH:mm", firstOccurrenceDate: "YYYY-MM-DD", recurrenceEndDate: "YYYY-MM-DD", reason?, onBehalfOfUserId?, isUnassignedDriver? } }`
   - Generates occurrences for each day-of-week in range (max 6 months from today)
   - Skips dates with conflicts
   - Creates all in single `groupId`
   - Sends grouped notification if any created
   - Returns `{ success: true, groupId, status, created: N, skipped: [...dates] }` 201 or 409 if none created

**Key business rules:**
- Status auto-set: VALIDATED if canAccessAdminPanel OR (RESPO and not onBehalfOf), else PENDING
- Conflict detection includes both VALIDATED and PENDING (blocks both)
- `isUnassignedDriver` or `onBehalfOfUserId === 'UNASSIGNED'` → userName = "Chauffeur non décidé"
- Only RESPO/ADMIN can reserve on behalf or mark unassigned
- Push notifications sent to ADMIN and RESPO tags (OneSignal)
- Recurring: limit 6 months from today; first date must be future; at least one DOW required
- Occurrence dates auto-skipped if already conflicted

## Dependencies

### Internal
- `@/lib/db` — `Reservation`, `Vehicle`, `User` tables
- `@/lib/onesignal` — `sendPushNotification()` (lazy import)
- `@/lib/roles` — `canAccessAdminPanel`
- `@/auth` — NextAuth v5 session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
