<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Reservations Recurrence [groupId]

## Purpose
Bulk operations on a recurrence group: DELETE cancels all future occurrences; PATCH validates all pending future occurrences with individual conflict detection and skip logic. Preserves past occurrences for archival (DELETE only targets startTime > now). Sends batch notification on validation success.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | DELETE (cancel future occurrences, owner or manager), PATCH (validate pending future, manager only, with conflict skip) |

## For AI Agents

### Working In This Directory

**Auth & Access:**
- DELETE: owner (any member's userEmail) OR manager (`canAccessAdminPanel()` OR `RESPO`), else 403.
- PATCH: manager only, else 403.
- 404 if groupId has no reservations.

**DELETE Logic:**
- Deletes reservations WHERE recurrenceGroupId = groupId AND startTime > now.
- Preserves past occurrences (startTime ≤ now) for record-keeping.
- Returns count of deleted occurrences.

**PATCH Logic (Validate Future):**
- Fetches all PENDING reservations WHERE recurrenceGroupId = groupId AND startTime > now, ordered by startTime.
- For each pending occurrence:
  1. Check conflict with VALIDATED reservations: `WHERE vehicleId = ? AND id != ? AND status = 'VALIDATED' AND (startTime < endTime_param AND endTime > startTime_param)`.
  2. If conflict found: increment skipped counter, add date to skippedDates list, continue to next.
  3. Else: UPDATE status = 'VALIDATED', increment validated counter.
- After loop: if validated > 0 and owner found, insert single grouped Notification with counts/skipped dates.
- Returns: `{ success: true, validated, skipped, skippedDates, message }`.

**Zod:** No input validation (POST body ignored for DELETE/PATCH).

**DB Details:**
- DELETE: DELETE FROM Reservation WHERE recurrenceGroupId = ? AND startTime > ?.
- PATCH: SELECT pending, then loop UPDATE + conflict checks, then single INSERT Notification.
- Notification message includes vehicle name, validated count, skipped count, skipped date list.

**Response Shape:**
- DELETE: `{ success: true, deleted: number, message: string }` (200)
- PATCH: `{ success: true, validated: number, skipped: number, skippedDates: [], message: string }` (200)
- Errors: 401/403/404/500

## Dependencies

### Internal
- `db` (libSQL)
- `auth` from `@/auth`
- `@/lib/roles` — `canAccessAdminPanel()`

### Tables Touched
- `Reservation` (filter by recurrenceGroupId, bulk delete, bulk update status, conflict check)
- `Vehicle` (fetch name for notification context)
- `User` (fetch owner for notification)
- `Notification` (insert batch notification on validation)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
