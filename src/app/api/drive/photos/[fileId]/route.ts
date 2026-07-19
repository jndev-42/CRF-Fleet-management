import { auth } from '@/auth';
import { getDriveClient } from '@/lib/drive';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ fileId: string }> }
) {
    try {
        const session = await auth();
        // Just verify they are logged in.
        if (!session?.user) {
            return new Response('Unauthorized', { status: 401 });
        }

        const resolvedParams = await params;
        const fileId = resolvedParams.fileId;

        if (fileId.startsWith('mock-')) {
            const mockPng = Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
                'base64'
            );
            return new Response(mockPng, {
                status: 200,
                headers: {
                    'Content-Type': 'image/png',
                    'Content-Disposition': 'inline; filename="mock.png"',
                },
            });
        }

        const drive = getDriveClient();

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

    } catch (error: unknown) {
        const err = error as { message?: string };
        console.error('Drive Image Proxy Error:', err?.message);
        return new Response('Failed to load image', { status: 500 });
    }
}
