<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-10-23 | Updated: 2026-10-23 -->

# vehicles/[id]/desinf-responsables

## Purpose
Candidates for "Responsable de la désinfection" in the vehicle-page check-in modal (`CheckInModal`, missions « Désinfection » and desinfection tracking). Replaces `GET /api/users`, which is manager-only and returned 403 — an empty list — to drivers, making the check-in of a desinfection trip impossible (the field is mandatory).

`[id]` is the vehicle **UUID** (like `drivers`, `reservations`).

## For AI Agents
- Auth: `session?.user` (401); `isInactive(roles)` (403). UL scoping like `POST /api/trips`: `isOutsideUl` → 404 (SUPER_ADMIN exempt).
- Population (`listActiveUlMembers` in `@/lib/ulMembers`, product decision 2026-10-23): **active accounts attached to the vehicle's UL** (`UserUL`, home or secondary), excluding INACTIF/GUEST globally (`UserRole`) or in that UL (`UserUL.roles`). The caller is included (often the one who disinfected). No driving-role filter.
- Response: `{ "users": [{ "id", "name", "email" }] }` — identity only.
- Sibling for the QR flow: `GET /api/qr/[token]/desinf-responsables` (same population).
