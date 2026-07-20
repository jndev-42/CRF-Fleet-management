# /dev-setup

Local development environment setup.

## Minimum `.env.local`
```env
AUTH_SECRET=any_random_string
TURSO_DATABASE_URL=file:./dev.db
TURSO_AUTH_TOKEN=
```

## Start sequence
```bash
npm run dev:setup   # Initialize local SQLite DB with seed data (idempotent)
npm run dev         # Start dev server at http://localhost:3000
```

## Dev login panel
The login page shows a **"Mode développement"** panel with one-click login for 4 roles:
- **ADMIN** — full access
- **RESPO** (Responsable) — fleet management
- **CHVL** (Chauffeur) — trip operations
- **GUEST** — read-only

No Google OAuth needed in dev. Accounts use the `@dev.local` domain.
