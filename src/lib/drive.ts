import { google } from 'googleapis';

export function getDriveClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Google Drive Refresh Token credentials are not configured.');
    }

    const auth = new google.auth.OAuth2(
        clientId,
        clientSecret
    );

    auth.setCredentials({
        refresh_token: refreshToken
    });

    return google.drive({ version: 'v3', auth });
}

export async function deleteDriveFolder(folderId: string) {
    try {
        if (!folderId) return false;
        const drive = getDriveClient();
        await drive.files.delete({
            fileId: folderId,
        });
        return true;
    } catch (e: unknown) {
        // Ignore 404s if already deleted — Drive API returns status/code 404 on the error object
        const err = e as { code?: number; status?: number; message?: string };
        if (err.code === 404 || err.status === 404) return true;
        console.error(`Failed to delete Google Drive folder ${folderId}:`, err.message ?? e);
        return false;
    }
}
