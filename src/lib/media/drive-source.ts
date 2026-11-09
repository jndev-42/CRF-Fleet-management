/**
 * Accès Google Drive en LECTURE (plus la corbeille, pour la migration) sous la
 * forme `DriveSource` attendue par `drive-migration.ts`. Partagé par le script de
 * migration et par `POST /api/media/upload` (rendu d'un trajet emprunté avant la
 * bascule vers R2). Le client Drive n'est créé qu'au premier appel : un lot fait
 * uniquement d'ids `mock-…` se traite sans identifiants Google.
 */

import { getDriveClient } from '@/lib/drive';
import type { DriveItem, DriveSource } from '@/lib/media/drive-migration';

/** Client Drive v3 (ou un faux de même forme, pour les tests). */
export type DriveClient = ReturnType<typeof getDriveClient>;

export function createDriveSource(injected?: DriveClient): DriveSource {
    let client: DriveClient | null = injected ?? null;
    const drive = () => (client ??= getDriveClient());

    return {
        async get(id: string): Promise<DriveItem | null> {
            try {
                const res = await drive().files.get({ fileId: id, fields: 'id, name, mimeType, createdTime, trashed' });
                if (!res.data.id || res.data.trashed) return null;
                return { id: res.data.id, name: res.data.name ?? id, mimeType: res.data.mimeType ?? '', createdTime: res.data.createdTime ?? null };
            } catch (e: unknown) {
                const err = e as { code?: number; status?: number };
                if (err.code === 404 || err.status === 404) return null;
                throw e;
            }
        },
        async list(folderId: string): Promise<DriveItem[]> {
            const items: DriveItem[] = [];
            let pageToken: string | undefined;
            do {
                const res = await drive().files.list({
                    q: `'${folderId.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' in parents and trashed=false`,
                    fields: 'nextPageToken, files(id, name, mimeType)',
                    pageSize: 1000,
                    pageToken,
                });
                for (const f of res.data.files ?? []) {
                    if (f.id) items.push({ id: f.id, name: f.name ?? f.id, mimeType: f.mimeType ?? '' });
                }
                pageToken = res.data.nextPageToken ?? undefined;
            } while (pageToken);
            return items;
        },
        async download(fileId: string): Promise<Buffer> {
            const res = await drive().files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
            return Buffer.from(res.data as ArrayBuffer);
        },
        async trash(id: string): Promise<void> {
            await drive().files.update({ fileId: id, requestBody: { trashed: true } });
        },
    };
}
