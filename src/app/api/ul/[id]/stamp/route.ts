import { db } from '@/lib/db';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const res = await db.execute({
            sql: `SELECT stampImage FROM "UniteLocale" WHERE id = ?`,
            args: [id],
        });

        if (res.rows.length === 0 || !res.rows[0].stampImage) {
            return new Response('Stamp image not found', { status: 404 });
        }

        const raw = res.rows[0].stampImage as string;

        // Parse Data URL format: data:[<mediatype>][;base64],<data>
        const match = raw.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (!match) {
            return new Response('Invalid stamp image format', { status: 400 });
        }

        const mimeType = match[1];
        const buffer = Buffer.from(match[2], 'base64');

        return new Response(buffer, {
            status: 200,
            headers: {
                'Content-Type': mimeType,
                'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            },
        });
    } catch (error) {
        console.error('Error fetching UL stamp image:', error);
        return new Response('Internal server error', { status: 500 });
    }
}
