import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

let prismaInstance: PrismaClient | undefined;

function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    let url = process.env.TURSO_DATABASE_URL!.trim();
    if (url.startsWith('libsql://')) {
      url = url.replace('libsql://', 'https://');
    }
    const adapter = new PrismaLibSql({
      url,
      authToken: process.env.TURSO_AUTH_TOKEN?.trim(),
    });
    prismaInstance = new PrismaClient({ adapter });
  }
  return prismaInstance;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    const client = getPrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});
