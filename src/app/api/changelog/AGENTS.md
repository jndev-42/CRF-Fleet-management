<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# changelog

## Purpose
Serves the CHANGELOG.md file as plain markdown text. No authentication required. Used by the frontend to display release notes and version history to all users. File is read from the project root on every request.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (serve CHANGELOG.md) — no auth required |

## For AI Agents

### Working In This Directory
**GET** reads `CHANGELOG.md` from the project root and returns it with `Content-Type: text/markdown; charset=utf-8`. No database queries, no auth checks. If the file is missing or unreadable, returns 500 with error message.

Simple file-serving route with no business logic. Returns 200 on success.

## Dependencies

### Internal
- File system: `CHANGELOG.md` (project root)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
