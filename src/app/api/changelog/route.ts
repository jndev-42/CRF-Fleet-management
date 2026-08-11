import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { auth } from '@/auth';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
        const content = fs.readFileSync(changelogPath, 'utf-8');
        return new NextResponse(content, {
            status: 200,
            headers: { 'Content-Type': 'text/markdown; charset=utf-8' }
        });
    } catch (error) {
        console.error('Error reading CHANGELOG.md:', error);
        return new NextResponse('Erreur lors de la lecture du changelog.', { status: 500 });
    }
}
