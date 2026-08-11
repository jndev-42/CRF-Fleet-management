<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# me

## Purpose
User-context endpoints for authenticated session. Currently includes license validity check for drivers (CHVL, CHVPSP roles). Planned future use for fetching user profile, settings, and preferences. Requires NextAuth authentication.

## Subdirectories
- `license-check` — GET endpoint to verify driver license/papers validity and blocking status

## For AI Agents

### Working In This Directory
Container directory for user-specific endpoints. All routes require authentication. If adding new user endpoints (profile, preferences, etc.), follow this pattern: auth check first, then role-specific logic, then database queries. Driver-specific endpoints should check for CHVL/CHVPSP roles.

## Dependencies

### Internal
- `@/auth` — session
- `@/lib/db` — User table queries

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
