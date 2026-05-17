import { db } from '../src/lib/db';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    const csvPath = path.join(process.cwd(), 'wireframes', 'matos crf.csv');
    const content = fs.readFileSync(csvPath, 'utf-8');
    
    const lines = content.split('\n');
    const items = new Set<string>();
    
    for (const line of lines) {
        // Clean name: remove trailing semicolons and trim
        const name = line.replace(/;+$/, '').trim();
        
        // Skip empty lines, generic headers, and duplicates
        if (!name || name === 'DÉSIGNATION' || name.includes('Fiches d’intervention')) {
            continue;
        }
        
        // Add to set for de-duplication
        items.add(name);
    }
    
    console.log(`Trouvé ${items.size} articles uniques à importer.`);
    
    let imported = 0;
    let skipped = 0;
    
    for (const name of items) {
        try {
            // Check if item already exists
            const existing = await db.execute({
                sql: 'SELECT id FROM "InvItem" WHERE name = ?',
                args: [name]
            });
            
            if (existing.rows.length > 0) {
                skipped++;
                continue;
            }
            
            const id = crypto.randomUUID();
            await db.execute({
                sql: 'INSERT INTO "InvItem" (id, name, category, quantity, updatedAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
                args: [id, name, 'Matériel', 0]
            });
            imported++;
        } catch (e) {
            console.error(`Erreur lors de l'import de "${name}":`, e);
        }
    }
    
    console.log(`Import terminé : ${imported} articles importés, ${skipped} déjà existants.`);
}

main();
