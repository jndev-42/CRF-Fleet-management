<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# report

## Purpose
POST endpoint to submit browser bug reports. Collects title, description, console logs, network logs, user agent, and page URL. Validates input with Zod, formats as markdown, and creates a GitHub issue in `jndev-42/CRF-Fleet-management` with labels `bug` and `user-report`. Returns the issue URL on success. No database writes.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | POST (submit bug report, create GitHub issue) — requires auth and active role (not GUEST/INACTIF) |

## For AI Agents

### Working In This Directory
**POST** accepts a JSON body with Zod-validated fields:
- `title` (required, 1–200 chars)
- `description` (optional, max 5000 chars)
- `logs` (optional, last ~50 console logs, max 20000 chars)
- `networkLogs` (optional, last ~30 network requests, max 10000 chars)
- `userAgent`, `pageUrl` (optional metadata)

Auth check: must be authenticated and have at least one non-inactive role. Inactive check treats GUEST and INACTIF as blocking. Returns 401 if not authenticated, 403 if all roles are inactive.

GitHub issue includes reporter info (name, email), role list, date, page, and collapsible log sections. Requires valid `GITHUB_TOKEN` env var; returns 502 if missing or if GitHub API request fails. On success, returns 201 with `{ issueUrl }`.

Zod parse errors return 400 with `{ error, details }`.

## Dependencies

### Internal
- GitHub API (`https://api.github.com/repos/jndev-42/CRF-Fleet-management/issues`)
- `@/auth` — session for user info
- `process.env.GITHUB_TOKEN` — GitHub API authorization

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
