import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { google } from 'googleapis';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ fileId: string }> }
) {
    try {
        const session = await auth();
        // Check if user is authenticated and has an access token
        if (!session?.user || !session.accessToken) {
            return new Response('Unauthorized', { status: 401 });
        }

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials({ access_token: session.accessToken });
        const drive = google.drive({ version: 'v3', auth: oauth2Client });

        const resolvedParams = await params;
        const fileId = resolvedParams.fileId;

        // Fetch file metadata to get MIME type
        const fileMetadata = await drive.files.get({
            fileId: fileId,
            fields: 'mimeType, name'
        });

        // Fetch the file bytes
        const response = await drive.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        // Explicitly cast to Web API ReadableStream, which Next requires
        // Node's `response.data` is an stream.Readable
        const stream = response.data as unknown as ReadableStream;

        return new Response(stream, {
            status: 200,
            headers: {
                'Content-Type': fileMetadata.data.mimeType || 'application/octet-stream',
                'Content-Disposition': `inline; filename="${fileMetadata.data.name}"`,
            },
        });

    } catch (error: any) {
        console.error('Drive Image Proxy Error:', error?.message);
        return new Response('Failed to load image', { status: 500 });
    }
}
