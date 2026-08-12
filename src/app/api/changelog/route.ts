import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { auth } from '@/auth';
import { unauthorizedResponse } from '@/lib/apiAuth';

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
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
