/**
 * Import matériel ebrigade → inventaire martine.
 *
 * Ce script :
 *   1. Lit le fichier HAR capturé sur ebrigade.online
 *   2. Extrait la réponse JSON de `materiel_data_load.php`
 *   3. Sépare les LOTs (badge "Lot" → InvLocation SAC) des articles (InvItem)
 *   4. Résout les locations "Dans LOT X" vers le SAC correspondant
 *   5. Vide les tables InvStock, InvLocation SAC/VEHICLE, InvItem
 *   6. Insère les données dans dev.db (local SQLite)
 *
 * Structure ebrigade :
 *   - Lignes avec MA_MODELE badge "Lot" → contenants (InvLocation type SAC)
 *   - Autres lignes → articles (InvItem) avec InvStock par emplacement
 *   - MA_LIEU_STOCKAGE "Dans LOT X" → emplacement = SAC nommé "LOT X"
 *
 * Prérequis : `DO_NOT_COMMIT/ebrigade.online.har` doit exister.
 *
 * Usage :
 *   npx tsx scripts/import-ebrigade.ts
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@libsql/client';

const db = createClient({ url: 'file:./dev.db' });

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, '').trim();
}

/**
 * Parse une date au format dd-mm-yyyy (dans un badge HTML) → ISO yyyy-mm-dd.
 * Retourne null si absent ou non parseable.
 */
function parseDate(html: string): string | null {
    const text = stripHtml(html);
    if (!text) return null;

    const match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    return null;
}

/**
 * Détermine si une ligne ebrigade est un contenant (LOT/Kit/Malle).
 * Badge "Lot" dans MA_MODELE = contenant physique, pas un article.
 */
function isContainer(row: EbrigadeRow): boolean {
    return /Lot/i.test(stripHtml(row.MA_MODELE ?? ''));
}

/**
 * Normalise un nom de lieu :
 *   "Dans LOT C - 188" → "LOT C - 188"
 *   "<a href=upd_vehicule.php?vid=3>75182</a>" → "75182"
 *   "Local Baigneur" → "Local Baigneur"
 */
function parseLieuName(raw: string): string {
    const text = stripHtml(raw);
    // Strip prefix "Dans " (référence à un lot/sac)
    return text.replace(/^Dans\s+/i, '');
}

// ── Types internes ────────────────────────────────────────────────────────────

interface EbrigadeRow {
    S_CODE: string;
    MA_MODELE: string;
    MA_NUMERO_SERIE: string;
    date_rev: string;
    MA_LIEU_STOCKAGE: string;
    stock: string | number;
    TM_CODE_RAW: string;
}

interface InvItemData {
    id: string;
    name: string;
    category: string | null;
}

interface InvLocationData {
    id: string;
    name: string;
    type: 'SAC' | 'VEHICLE';
}

interface InvStockData {
    itemName: string;
    locationName: string;
    quantity: number;
    expiryDate: string | null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
    // 1. Lire le HAR
    const harPath = path.join(process.cwd(), 'DO_NOT_COMMIT', 'ebrigade.online.har');
    if (!fs.existsSync(harPath)) {
        console.error('❌ Fichier HAR introuvable :', harPath);
        process.exit(1);
    }

    const har = JSON.parse(fs.readFileSync(harPath, 'utf-8'));

    // 2. Extraire la réponse materiel_data_load.php (dernière avec du contenu)
    const entries = har.log.entries.filter(
        (e: { request: { url: string }; response: { content: { text?: string } } }) =>
            e.request.url.includes('materiel_data_load') && e.response.content.text
    );
    if (entries.length === 0) {
        console.error('❌ Aucune réponse materiel_data_load.php avec contenu trouvée dans le HAR.');
        process.exit(1);
    }

    const payload = JSON.parse(entries[entries.length - 1].response.content.text);
    const rows: EbrigadeRow[] = payload.rows;

    console.log(`\n▶ ${rows.length} lignes extraites du HAR (quantité totale : ${payload.materiel_count})`);

    // 3. Séparer contenants et articles
    const containerRows = rows.filter(isContainer);
    const itemRows = rows.filter(r => !isContainer(r));
    console.log(`  ${containerRows.length} contenants (LOT/Kit/Malle) → InvLocation SAC`);
    console.log(`  ${itemRows.length} articles → InvItem`);

    // 4. Construire les locations

    // 4a. Locations issues des CONTENANTS (SAC)
    //     Un même nom peut exister plusieurs fois (ex: "Kit AES" × 3).
    //     On distingue par mid= ebrigade, suffixe (#2, #3...) si même nom déjà présent.
    const locations = new Map<string, InvLocationData>(); // key = nom final normalisé

    for (const row of containerRows) {
        const baseName = row.TM_CODE_RAW?.trim();
        if (!baseName) continue;

        // Trouver un nom unique : baseName, baseName #2, baseName #3...
        let finalName = baseName;
        let suffix = 2;
        while (locations.has(finalName)) {
            finalName = `${baseName} #${suffix++}`;
        }

        locations.set(finalName, {
            id: crypto.randomUUID(),
            name: finalName,
            type: 'SAC',
        });
    }

    // 4b. Locations issues des emplacements des articles (VEHICLE et autres SAC)
    for (const row of itemRows) {
        const raw = row.MA_LIEU_STOCKAGE ?? '';
        const locName = parseLieuName(raw);
        if (!locName) continue;
        if (locations.has(locName)) continue; // déjà connu (contenants ou déjà vu)

        const type: 'SAC' | 'VEHICLE' = /vid=/.test(raw) ? 'VEHICLE' : 'SAC';
        locations.set(locName, { id: crypto.randomUUID(), name: locName, type });
    }

    // 5. Construire les articles (InvItem) — déduplication par nom
    const items = new Map<string, InvItemData>();

    for (const row of itemRows) {
        const name = row.TM_CODE_RAW?.trim();
        if (!name || items.has(name)) continue;
        items.set(name, {
            id: crypto.randomUUID(),
            name,
            category: row.S_CODE?.trim() || null,
        });
    }

    // 6. Construire les stocks — agréger si même (item × location)
    const stockKey = (itemName: string, locName: string) => `${itemName}|||${locName}`;
    const stocksMap = new Map<string, InvStockData>();

    for (const row of itemRows) {
        const name = row.TM_CODE_RAW?.trim();
        if (!name) continue;

        const raw = row.MA_LIEU_STOCKAGE ?? '';
        const locName = parseLieuName(raw);
        if (!locName) continue; // skip sans emplacement

        const qty = parseInt(String(row.stock), 10) || 0;
        const expiryDate = parseDate(row.date_rev ?? '');
        const key = stockKey(name, locName);

        if (stocksMap.has(key)) {
            stocksMap.get(key)!.quantity += qty;
        } else {
            stocksMap.set(key, { itemName: name, locationName: locName, quantity: qty, expiryDate });
        }
    }

    const stocks = Array.from(stocksMap.values());

    console.log(`  ${items.size} articles uniques`);
    console.log(`  ${locations.size} emplacements (${[...locations.values()].filter(l=>l.type==='SAC').length} SAC, ${[...locations.values()].filter(l=>l.type==='VEHICLE').length} VEHICLE)`);
    console.log(`  ${stocks.length} stocks uniques`);

    // 7. Vider les tables (dans l'ordre FK)
    console.log('\n▶ Nettoyage des tables...');
    await db.execute(`DELETE FROM "InvStock"`);
    console.log('  ✓ InvStock vidé');
    await db.execute(`DELETE FROM "InvLocation" WHERE type IN ('SAC', 'VEHICLE')`);
    console.log('  ✓ InvLocation SAC/VEHICLE vidés (singletons STOCK_CENTRAL/PHARMA_TAMPON conservés)');
    await db.execute(`DELETE FROM "InvItem"`);
    console.log('  ✓ InvItem vidé');

    // 8. Insérer les articles
    console.log('\n▶ Insertion des articles...');
    for (const item of items.values()) {
        await db.execute({
            sql: `INSERT OR IGNORE INTO "InvItem" (id, name, category) VALUES (?, ?, ?)`,
            args: [item.id, item.name, item.category],
        });
    }
    console.log(`  ✓ ${items.size} articles insérés`);

    // 9. Insérer les emplacements
    console.log('\n▶ Insertion des emplacements...');
    for (const loc of locations.values()) {
        await db.execute({
            sql: `INSERT OR IGNORE INTO "InvLocation" (id, type, name) VALUES (?, ?, ?)`,
            args: [loc.id, loc.type, loc.name],
        });
    }
    console.log(`  ✓ ${locations.size} emplacements insérés`);

    // 10. Insérer les stocks
    console.log('\n▶ Insertion des stocks...');
    let inserted = 0;
    let skipped = 0;

    for (const stock of stocks) {
        const item = items.get(stock.itemName);
        const loc = locations.get(stock.locationName);

        if (!item || !loc) {
            console.warn(`  ⚠ Stock ignoré (référence manquante) : "${stock.itemName}" @ "${stock.locationName}"`);
            skipped++;
            continue;
        }

        await db.execute({
            sql: `INSERT OR IGNORE INTO "InvStock" (id, locationId, itemId, quantity, expiryDate) VALUES (?, ?, ?, ?, ?)`,
            args: [crypto.randomUUID(), loc.id, item.id, stock.quantity, stock.expiryDate],
        });
        inserted++;
    }

    console.log(`  ✓ ${inserted} stocks insérés${skipped > 0 ? `, ${skipped} ignorés` : ''}`);

    // 11. Résumé
    console.log('\n✅ Import terminé.');
    console.log(`   Articles    : ${items.size}`);
    console.log(`   Emplacements: ${locations.size}`);
    console.log(`   Stocks      : ${inserted}`);
    console.log('\nVérification : npx tsx scripts/show-schema.ts\n');
}

run().catch(e => {
    console.error('❌ Erreur fatale :', e);
    process.exit(1);
});
