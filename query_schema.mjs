import { createClient } from '@libsql/client';
const db = createClient({ url: 'file:./prisma/dev.db' });
const res = await db.execute("SELECT sql FROM sqlite_master WHERE type='table';");
console.log(res.rows.map(r => r.sql).join('\n\n'));
