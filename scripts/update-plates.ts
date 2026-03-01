import { createClient } from '@libsql/client';
import "dotenv/config";

async function main() {
    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const updates = [
        { name: 'VL186', plate: 'HJ-269-FE' },
        { name: 'VL188', plate: 'GV-114-QM' },
        { name: 'VL486', plate: 'ES-267-ND' },
        { name: 'VPSP182', plate: 'EF-619-AB' }
    ];

    try {
        for (const update of updates) {
            const result = await db.execute({
                sql: `UPDATE Vehicle SET plate = ? WHERE name = ?`,
                args: [update.plate, update.name]
            });
            console.log(`Updated ${update.name} to plate ${update.plate}. Rows affected: ${result.rowsAffected}`);
        }
    } catch (error) {
        console.error("Error updating plates:", error);
    }
}

main().catch(console.error);
