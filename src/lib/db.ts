import { createClient, type Client, type InArgs, type InStatement, type TransactionMode } from '@libsql/client';
import { getDemoClient, isDemoRequest, normalizeDbUrl } from '@/lib/demo/server';

/** Base de production : toujours elle, quel que soit le mode démo (auth, crons, recopie). */
export const prodDb: Client = createClient({
  url: normalizeDbUrl(process.env.TURSO_DATABASE_URL || 'libsql://dummy-url-for-build.turso.io'),
  authToken: (process.env.TURSO_AUTH_TOKEN || '').trim(),
});

/** Base démo partagée (recopiée chaque nuit depuis la prod), ou `null` si non configurée. */
export const demoDb: Client | null = getDemoClient();

/**
 * Client de la requête courante : base démo pour une requête démo (cookie + base
 * configurée), prod sinon — y compris hors contexte de requête (cron, scripts, tests).
 * Une requête démo n'écrit jamais en prod : sans client démo, elle échoue.
 */
async function resolveClient(): Promise<Client> {
  if (!(await isDemoRequest())) return prodDb;
  const demo = getDemoClient();
  if (!demo) throw new Error('Mode démo : base de démonstration indisponible');
  return demo;
}

/**
 * Client aiguillé, de même interface que `@libsql/client` : chaque appel résout
 * la base (démo ou prod) au moment où il est fait. `transaction()` renvoie la
 * transaction du client résolu.
 */
export const db: Client = {
  execute: (async (stmtOrSql: InStatement | string, args?: InArgs) => {
    const client = await resolveClient();
    return typeof stmtOrSql === 'string'
      ? client.execute(stmtOrSql, args)
      : client.execute(stmtOrSql);
  }) as Client['execute'],
  batch: async (stmts: Array<InStatement | [string, InArgs?]>, mode?: TransactionMode) =>
    (await resolveClient()).batch(stmts, mode),
  migrate: async (stmts: Array<InStatement>) => (await resolveClient()).migrate(stmts),
  transaction: (async (mode?: TransactionMode) =>
    (await resolveClient()).transaction(mode)) as Client['transaction'],
  executeMultiple: async (sql: string) => (await resolveClient()).executeMultiple(sql),
  sync: async () => (await resolveClient()).sync(),
  close: () => {
    prodDb.close();
    getDemoClient()?.close();
  },
  reconnect: () => {
    prodDb.reconnect();
    getDemoClient()?.reconnect();
  },
  get closed() {
    return prodDb.closed;
  },
  get protocol() {
    return prodDb.protocol;
  },
};
