import { createClient } from '@libsql/client';

export const db = createClient({
  url: (process.env.TURSO_DATABASE_URL || 'libsql://dummy-url-for-build.turso.io').trim(),
  authToken: (process.env.TURSO_AUTH_TOKEN || '').trim(),
});
