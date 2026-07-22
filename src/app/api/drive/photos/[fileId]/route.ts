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
            if (fileId.includes('pdf')) {
                const mockPdf = Buffer.from(
                    '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 55 >>\nstream\nBT /F1 24 Tf 100 700 TD (Justificatif Mock PDF) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000216 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n320\n%%EOF'
                );
                return new Response(mockPdf, {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': 'inline; filename="justificatif_mock.pdf"',
                    },
                });
            }

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
