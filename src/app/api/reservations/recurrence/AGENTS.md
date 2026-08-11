<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Reservations Recurrence

## Purpose
Container for bulk operations on recurring reservation groups. Allows owner or manager to cancel all future occurrences or bulk-validate all pending future occurrences of a recurrence group, with conflict detection and individual skip logic.

## Subdirectories
- `[groupId]/` — manage recurrence group (DELETE, PATCH)

## For AI Agents

### Key Concepts

**Recurrence Group:**
- Set of reservations sharing a `recurrenceGroupId` (UUID).
- Identified by groupId param, not by individual reservation.

**Bulk Operations:**
- DELETE: cancel all future occurrences (startTime > now), preserve past for archival.
- PATCH: validate all pending future occurrences (status = 'PENDING' AND startTime > now), skip any conflicting with already-validated reservations.

**Access Control:**
- Ownership checked via first (any) member of group's userEmail.
- Owner OR manager can cancel; manager-only can validate.

## Dependencies

### Internal
- `db` (libSQL)
- `auth` from `@/auth`
- `@/lib/roles` — `canAccessAdminPanel()`

### Tables Touched
- `Reservation` (filter by recurrenceGroupId, bulk delete/update status)
- `Vehicle` (fetch name for notifications)
- `User` (fetch owner for notifications)
- `Notification` (insert batch notification on bulk validation)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
