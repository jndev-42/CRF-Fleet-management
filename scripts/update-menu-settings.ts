/**
 * Migration production — réglages de menus : option « Super admin uniquement »
 * et menu « Frais ».
 *
 * 1. Reconstruit la table `MenuSetting` si sa contrainte CHECK n'accepte pas
 *    encore la visibilité `super_admin_only` (SQLite ne sait pas modifier une
 *    contrainte existante). Les réglages existants sont conservés à l'identique.
 * 2. Insère la ligne `MenuSetting` `expenses` (Frais), visibilité `available`.
 *
 * Sans la reconstruction, choisir « Super admin uniquement » dans
 * Administration → Menus répond 500 (violation de contrainte). Sans la ligne
 * `expenses`, le réglage du menu Frais n'a aucun effet.
 *
 * Usage :
 *   npx tsx scripts/update-menu-settings.ts            # dry-run, n'écrit rien
 *   npx tsx scripts/update-menu-settings.ts --apply    # applique, puis vérifie
 */
import { createClient } from '@libsql/client';
import "dotenv/config";
import { menuSettingNeedsRebuild, rebuildMenuSettingTable } from '../src/lib/menu-settings-schema';

async function main() {
    const apply = process.argv.includes('--apply');
    console.log(`Migration : réglages de menus ${apply ? '(--apply)' : '(dry-run)'}`);

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN
    });

    const table = await db.execute(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'MenuSetting'`);
    if (table.rows.length === 0) {
        console.error("❌ Table MenuSetting absente — lancer d'abord scripts/add-menu-settings.ts");
        process.exit(1);
    }

    const needsRebuild = await menuSettingNeedsRebuild(db);
    const before = await db.execute(`SELECT menu_key, visibility FROM "MenuSetting" ORDER BY menu_key`);
    const hasExpenses = before.rows.some(r => r.menu_key === 'expenses');

    console.log(`  contrainte CHECK : ${needsRebuild ? "À RECONSTRUIRE (super_admin_only refusé)" : 'à jour'}`);
    console.log(`  MenuSetting 'expenses' : ${hasExpenses ? 'présent' : 'ABSENT'}`);
    console.log(`  réglages actuels : ${before.rows.map(r => `${r.menu_key}=${r.visibility}`).join(', ')}`);

    if (!needsRebuild && hasExpenses) {
        console.log("⚠️ Rien à faire — base déjà à jour");
        return;
    }

    if (!apply) {
        console.log("\nPlan (aucune écriture) :");
        if (needsRebuild) console.log(`  Reconstruction de "MenuSetting" (copie → MenuSetting_new avec la nouvelle contrainte, DROP, RENAME), en un seul lot`);
        if (!hasExpenses) console.log(`  INSERT INTO "MenuSetting" (menu_key, visibility) VALUES ('expenses', 'available')`);
        console.log("\nRelancer avec --apply pour exécuter.");
        return;
    }

    if (needsRebuild) {
        await rebuildMenuSettingTable(db);
        console.log("✅ Table MenuSetting reconstruite");
    }
    await db.execute({
        sql: `INSERT OR IGNORE INTO "MenuSetting" (menu_key, visibility) VALUES (?, ?)`,
        args: ['expenses', 'available'],
    });

    // Vérification explicite : contrainte à jour, aucun réglage perdu ni modifié.
    const after = await db.execute(`SELECT menu_key, visibility FROM "MenuSetting" ORDER BY menu_key`);
    const afterMap = new Map(after.rows.map(r => [String(r.menu_key), String(r.visibility)]));
    const failures: string[] = [];
    if (await menuSettingNeedsRebuild(db)) failures.push('contrainte CHECK toujours obsolète');
    if (!afterMap.has('expenses')) failures.push(`MenuSetting 'expenses'`);
    for (const r of before.rows) {
        if (afterMap.get(String(r.menu_key)) !== String(r.visibility)) failures.push(`réglage ${r.menu_key} perdu ou modifié`);
    }

    if (failures.length > 0) {
        console.error(`❌ ${failures.join(', ')} — migration NON valide`);
        process.exit(1);
    }
    console.log(`✅ Réglages confirmés : ${after.rows.map(r => `${r.menu_key}=${r.visibility}`).join(', ')}`);
}

main().catch((error: unknown) => {
    console.error("❌ Migration échouée :", error instanceof Error ? error.message : String(error));
    process.exit(1);
});
