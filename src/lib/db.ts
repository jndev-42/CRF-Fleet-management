import { createClient } from '@libsql/client';

let rawUrl = (process.env.TURSO_DATABASE_URL || 'libsql://dummy-url-for-build.turso.io').trim();
if (rawUrl.startsWith('libsql://')) {
  rawUrl = rawUrl.replace(/^libsql:\/\//, 'https://');
}

export const db = createClient({
  url: rawUrl,
  authToken: (process.env.TURSO_AUTH_TOKEN || '').trim(),
});
