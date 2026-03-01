import { createClient } from '@libsql/client';
import "dotenv/config";

async function main() {
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const res = await db.execute("SELECT name, sql FROM sqlite_master WHERE type='table';");
    for (const row of res.rows) {
        console.log(`-- Table: ${row.name}`);
        console.log(row.sql);
        console.log('');
    }
}
main().catch(console.error);
