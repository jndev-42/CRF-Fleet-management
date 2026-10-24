/**
 * Génère `src/lib/mcp/catalog.generated.ts` : les routes de `src/app/api` et leurs
 * méthodes exportées, que l'outil `api_request` du serveur MCP peut appeler.
 *
 * À relancer après l'ajout, le retrait ou le renommage d'une route API (le test
 * `mcp-catalog` échoue sinon). Idempotent, n'écrit que le fichier généré.
 *
 * Usage :
 *   npm run mcp:catalog
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { CATALOG_FILE, buildCatalog, renderCatalogSource } from '../src/lib/mcp/catalog-build';

const catalog = buildCatalog();
writeFileSync(join(process.cwd(), CATALOG_FILE), renderCatalogSource(catalog));
console.log(`✅ ${CATALOG_FILE} : ${catalog.length} routes`);
