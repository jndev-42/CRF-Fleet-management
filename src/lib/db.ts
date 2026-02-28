import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error(`TURSO_DATABASE_URL is not set. Available env keys: ${Object.keys(process.env).filter(k => k.includes('TURSO')).join(', ')}`);
  }

  const adapter = new PrismaLibSql({ url, authToken });
  return new PrismaClient({ adapter });
}

// Lazy initialization — don't create the client until it's actually used
const handler = {
  get(_target: Record<string, unknown>, prop: string) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }
    return (globalForPrisma.prisma as unknown as Record<string, unknown>)[prop];
  },
};

export const prisma = new Proxy({} as PrismaClient, handler);
