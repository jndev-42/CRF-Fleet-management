<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Reservations

## Purpose
Container for vehicle reservation endpoints. Manages vehicle booking lifecycle: creating, updating, validating, and deleting individual or recurring reservations. Enforcement: owner can edit/delete own; RESPO/ADMIN can manage all. Recurrence logic deferred to `recurrence/[groupId]` for bulk validation/cancellation.

## Subdirectories
- `[id]/` — manage individual reservation (GET → [not implemented], DELETE, PATCH/PUT)
- `recurrence/` — manage recurring reservation groups

## For AI Agents

### Key Concepts

**Reservation States:**
- `PENDING` — awaiting manager validation
- `VALIDATED` — approved, confirmed
- Deleted reservations are hard-deleted (not soft-deleted)

**Ownership & Roles:**
- Owner = creator's email (userEmail column)
- Manager roles = `canAccessAdminPanel(roles)` (ADMIN, CADRE, PRESIDENT) OR `roles.includes('RESPO')`
- Editing: owner OR manager
- Deletion: owner OR manager
- Validation: manager only

**Conflict Detection:**
- Time overlap check: `WHERE vehicleId = ? AND status IN ('VALIDATED', 'PENDING') AND (startTime < endTime_param AND endTime > startTime_param)`
- Validation: conflicts with VALIDATED reservations → 409 "Ce créneau chevauche une réservation déjà validée"
- Update: conflicts with any PENDING/VALIDATED → 409 with specific message

**Recurrence:**
- Reservations can belong to a `recurrenceGroupId` (UUID).
- No parent route in `reservations/` for bulk creation; handled elsewhere.
- Bulk operations (validate/cancel future occurrences) live in `recurrence/[groupId]`.

## Dependencies

### Internal
- `db` (libSQL)
- `auth` from `@/auth`
- `@/lib/roles` — `canAccessAdminPanel(roles)`

### Tables Touched
- `Reservation` (main table: id, userEmail, userName, vehicleId, startTime, endTime, reason, status, recurrenceGroupId)
- `User` (lookups for onBehalfOfUserId resolution)
- `Vehicle` (name lookups for notifications)
- `Notification` (insert on validation for user notification)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
