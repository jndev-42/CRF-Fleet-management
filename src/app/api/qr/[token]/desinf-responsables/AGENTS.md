<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-10-23 | Updated: 2026-10-23 -->

# QR [token] desinf-responsables

## Purpose
Candidates for "Responsable de la désinfection" in the QR check-in form (`src/app/qr/[token]/CheckInForm.tsx`). Without it the form called manager-only `GET /api/users`: empty list for drivers, so a desinfection trip could not be returned by QR.

## For AI Agents
- Auth: QR rules — `session?.user` (401), `!isQrBlocked(roles)` (403), role-less accounts allowed, no UL check (the QR token grants access). Unknown token → 404.
- Population: `listActiveUlMembers(vehicle.ulId)` (`@/lib/ulMembers`) — active members of the **vehicle's** UL (not the caller's), INACTIF/GUEST excluded globally or per UL, caller included.
- Response: `{ "users": [{ "id", "name", "email" }] }`.
