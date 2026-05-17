import { db } from '../src/lib/db';

async function main() {
    try {
        console.log('Tentative de suppression de la colonne "unit" de "InvItem"...');
        await db.execute('ALTER TABLE "InvItem" DROP COLUMN "unit"');
        console.log('Colonne "unit" supprimée avec succès.');
    } catch (e: unknown) {
        const error = e as Error;
        console.error('Erreur lors de la suppression de la colonne "unit":', error.message);
        if (error.message.includes('no such column')) {
            console.log('La colonne "unit" n\'existe déjà plus.');
        } else if (error.message.includes('syntax error')) {
            console.log('La version de SQLite ne supporte probablement pas DROP COLUMN. Nous allons ignorer la colonne dans le code.');
        }
    }
}

main();
