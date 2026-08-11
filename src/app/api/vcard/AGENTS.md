<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vcard

## Purpose
Generates a vCard (`.vcf`) directory file with contact information for all ULs and static CRF contacts. GET returns a downloadable VCard file formatted per RFC 2426. Requires authentication. Used by the frontend to export contacts to phone/mail clients.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (generate and serve vCard directory) — requires auth |

## For AI Agents

### Working In This Directory
**GET** generates a vCard by querying `UniteLocale` for all phone contacts and concatenating static CRF contact entries (Onyx, Vigie, COT, PCM, Astreinte teams). Flow:
1. Auth check; 401 if not authenticated.
2. Query `UniteLocale`, parse `phoneNumbers` JSON for each UL.
3. Build vCard entries for each phone (FORMAT: `BEGIN:VCARD ... END:VCARD`).
4. Append hardcoded static contacts (CRF teams).
5. Return with `Content-Type: text/vcard` and `Content-Disposition: attachment` for auto-download.

Phone numbers are cleaned of non-digits/+ characters. Parse errors for specific rows are silently ignored (try-catch). Returns 500 if database query fails.

File is generated on-the-fly; no caching.

## Dependencies

### Internal
- `UniteLocale` table (list phone numbers)
- `@/auth` — session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
