<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# QR [token]

## Purpose
Dynamic segment for QR token resolution. No route.ts in this directory; all endpoints are in subdirectories (checkin, checkout, vehicle). Container only.

## Subdirectories
- `checkin/` — POST `/api/qr/[token]/checkin` — finalize trip
- `checkout/` — POST `/api/qr/[token]/checkout` — start trip
- `vehicle/` — GET `/api/qr/[token]/vehicle` — resolve token to vehicle data

## For AI Agents

All three leaf routes accept the dynamic `[token]` param (awaited from `params` Promise) and resolve it to a Vehicle row via `SELECT * FROM Vehicle WHERE qrToken = ?`. If no vehicle found → 404.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
