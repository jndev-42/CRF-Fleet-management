<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# e2e

## Purpose
Playwright end-to-end specs driving the real dev app against the dev DB.

## Key Files
| File | Description |
|------|-------------|
| `checkout-checkin.spec.ts` | Vehicle checkout/checkin flow |
| `rgpd.spec.ts` | GDPR/RGPD data flows |
| `stats.spec.ts` | Statistics page flows |
| `verify-incident.spec.ts` | Incident report flow |
| `verify_user_deletion.spec.ts` / `verify_user_deletion.test.ts` | User deletion flow |

## For AI Agents

### Working In This Directory
Run: `npm run test:e2e` | UI mode: `npm run test:e2e:ui`. Requires dev server running (`npm run dev`) — reused automatically in local dev.

**Login — use one-click dev panel:**
```ts
await page.goto('/login');
await page.getByRole('button', { name: 'CHVL' }).click();
await page.waitForURL('/');
```
Available roles: `ADMIN`, `RESPO` (displayed as "RESPO"), `CHVL` (displayed as "CHVL"), `GUEST`.

### Role coverage
Each E2E flow should be tested with the **minimum required role** and verify that a lesser role is blocked (404 or redirect, not crash).

### Assertions
Prefer role/label selectors over CSS selectors:
```ts
page.getByRole('button', { name: 'Prendre en charge' })
page.getByLabel('Kilométrage départ')
page.getByText('Trajet en cours')
```

### Test isolation
Each `test` is independent. Use `test.beforeEach` for login only — not for data seeding (E2E tests use the real dev DB as-is). Don't rely on specific DB state — test flows that work from a known UI starting point.

### File naming
`<feature>.spec.ts` — e.g., `reservation.spec.ts`, `user-management.spec.ts`.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
