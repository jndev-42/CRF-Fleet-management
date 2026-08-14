<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Utilities

## Purpose
Lightweight utility functions used across the codebase. Currently contains error handling helpers for consistent error message extraction in try/catch blocks.

## Key Files
| File | Description |
|------|-------------|
| `error.ts` | Exports `getErrorMessage(e: unknown): string` to safely extract error messages from any thrown value |

## For AI Agents

### Working In This Directory
- `getErrorMessage()` is a pure function used in catch blocks throughout the app to normalize error messages
- Prefer this over writing inline error handling: catches Error instances (return `.message`), otherwise coerce to string
- See `src/lib/CLAUDE.md` — catch blocks should use `catch (e: unknown)` + `getErrorMessage(e)` pattern
- When adding new utilities: keep them pure, write a unit test (`src/__tests__/unit/`), document if non-obvious
- This directory is for genuinely reusable utilities only — avoid one-off helpers

## Dependencies

### Internal
None — all functions are pure standalone utilities.

