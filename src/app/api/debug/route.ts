import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL ? 'SET (' + process.env.TURSO_DATABASE_URL.substring(0, 20) + '...)' : 'NOT SET',
        TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN ? 'SET (length: ' + process.env.TURSO_AUTH_TOKEN.length + ')' : 'NOT SET',
        DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT SET',
        NODE_ENV: process.env.NODE_ENV,
    });
}
