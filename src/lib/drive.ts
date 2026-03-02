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
    } catch (e: any) {
        // Ignore 404s if already deleted
        if (e.code === 404 || e.status === 404) return true;
        console.error(`Failed to delete Google Drive folder ${folderId}:`, e?.message || e);
        return false;
    }
}
