<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# cron

## Purpose
Container for cron jobs. Scheduled tasks run via Vercel's cron service (configured in `vercel.json`). Protected by `CRON_SECRET` env var to prevent unauthorized access. Currently includes daily mileage check which alerts admins of suspicious vehicle usage. No NextAuth auth checks; relies on Vercel cron header authorization.

## Subdirectories
- `daily-mileage-check` — GET endpoint (runs daily) to check Renault mileage and alert admins of unauthorized usage

## For AI Agents

### Working In This Directory
Container directory for cron jobs. All cron endpoints require the `Authorization: Bearer ${CRON_SECRET}` header or return 401. Do not add NextAuth auth here; use header-based security only. If adding a new cron job, register it in `vercel.json` and create a GET endpoint in a subdirectory. Remember to set `CRON_SECRET` in Vercel environment.

## Dependencies

### Internal
- `process.env.CRON_SECRET` — Authorization header value
- `@/lib/db` — Database queries
- `@/lib/renault` — Renault telemetry integration

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
