/**
 * Migration : ajout de la colonne `recurrenceGroupId` sur la table Reservation.
 *
 * Permet de regrouper des réservations récurrentes sous un même identifiant de groupe.
 * Idempotent — peut être relancé sans risque : vérifie via PRAGMA table_info avant
 * d'exécuter l'ALTER TABLE.
 *
 * Usage : npx tsx scripts/add-recurrence-group.ts
 */
import { createClient } from '@libsql/client';

const db = createClient({
    url: 'file:./dev.db',
});

async function main() {
    console.log('🔍 Vérification de la colonne recurrenceGroupId sur Reservation...');

    const cols = await db.execute(`PRAGMA table_info("Reservation")`);
    const names = cols.rows.map(r => r.name as string);

    if (!names.includes('recurrenceGroupId')) {
        await db.execute(`ALTER TABLE "Reservation" ADD COLUMN "recurrenceGroupId" TEXT`);
        console.log('✅ Colonne recurrenceGroupId ajoutée');
    } else {
        console.log('↩  recurrenceGroupId déjà présente, skip');
    }

    await db.execute(
        `CREATE INDEX IF NOT EXISTS "Reservation_recurrenceGroupId_idx" ON "Reservation"("recurrenceGroupId")`
    );
    console.log('✅ Index Reservation_recurrenceGroupId_idx créé (ou déjà existant)');

    console.log('\n✅ Migration terminée');
}

main().catch(e => { console.error(e); process.exit(1); });
