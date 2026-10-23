<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# me

## Purpose
User-context endpoints for authenticated session. Currently includes the license/papers validity check for every account that can borrow a vehicle (`canBorrowVehicles` in `@/lib/licenseStatus`: drivers CHVL/CHVPSP and fleet managers — no role is exempt from the papers). Planned future use for fetching user profile, settings, and preferences. Requires NextAuth authentication.

## Subdirectories
- `license-check` — GET endpoint to verify license/papers validity and blocking status of the session account, whatever its roles

## For AI Agents

### Working In This Directory
Container directory for user-specific endpoints. All routes require authentication. If adding new user endpoints (profile, preferences, etc.), follow this pattern: auth check first, then role-specific logic, then database queries. Papers-related endpoints must not gate on CHVL/CHVPSP: the papers concern anyone who borrows a vehicle.

## Dependencies

### Internal
- `@/auth` — session
- `@/lib/db` — User table queries

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
