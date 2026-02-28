import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

export async function GET() {
    const steps: string[] = [];
    try {
        let url = process.env.TURSO_DATABASE_URL;
        if (url && url.startsWith('libsql://')) {
            url = url.replace('libsql://', 'https://');
        }
        const token = process.env.TURSO_AUTH_TOKEN;

        steps.push(`URL: ${url ? url.substring(0, 30) + '...' : 'MISSING'}`);
        steps.push(`Token: ${token ? 'SET (len=' + token.length + ')' : 'MISSING'}`);

        if (!url) {
            return NextResponse.json({ steps, error: 'No TURSO_DATABASE_URL' });
        }

        steps.push('Creating PrismaLibSql adapter...');
        const adapter = new PrismaLibSql({ url, authToken: token });
        steps.push('Adapter created OK');

        steps.push('Creating PrismaClient...');
        const client = new PrismaClient({ adapter });
        steps.push('PrismaClient created OK');

        steps.push('Querying vehicles...');
        const vehicles = await client.vehicle.findMany({ take: 1 });
        steps.push(`Query OK: ${vehicles.length} vehicles`);

        await client.$disconnect();

        return NextResponse.json({ steps, success: true, count: vehicles.length });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack?.split('\n').slice(0, 5) : [];
        steps.push(`ERROR: ${msg}`);
        return NextResponse.json({ steps, error: msg, stack });
    }
}
