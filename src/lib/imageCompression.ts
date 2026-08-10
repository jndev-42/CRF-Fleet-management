/**
 * Utilitaire de compression d'images et d'envoi par lots (batches) côté client.
 *
 * Résout les erreurs FUNCTION_PAYLOAD_TOO_LARGE (HTTP 413) causées par la limite
 * de 4.5 Mo sur les Serverless Functions (Vercel) lors de l'envoi de photos HD.
 */

/**
 * Compresse une image côté client (navigateur) via HTML5 Canvas.
 * - Réduit la résolution maximale (défaut 2048px).
 * - Enregistre en JPEG avec une qualité optimisée (défaut 82%).
 * - Laisse intacts les fichiers non-images (ex: PDF).
 */
export async function compressImage(
    file: File,
    maxDimension = 2048,
    quality = 0.82
): Promise<File> {
    if (!file.type.startsWith('image/')) {
        return file;
    }

    // Skip canvas if window/document/URL isn't defined (SSR environment)
    if (typeof window === 'undefined' || typeof document === 'undefined' || !window.URL?.createObjectURL) {
        return file;
    }

    return new Promise((resolve) => {
        try {
            const objectUrl = URL.createObjectURL(file);
            const img = new Image();

            img.onload = () => {
                try {
                    let { width, height } = img;

                    if (width > maxDimension || height > maxDimension) {
                        if (width > height) {
                            height = Math.round((height * maxDimension) / width);
                            width = maxDimension;
                        } else {
                            width = Math.round((width * maxDimension) / height);
                            height = maxDimension;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        URL.revokeObjectURL(objectUrl);
                        resolve(file);
                        return;
                    }

                    ctx.drawImage(img, 0, 0, width, height);
                    URL.revokeObjectURL(objectUrl);

                    canvas.toBlob(
                        (blob) => {
                            if (!blob || blob.size >= file.size) {
                                // Si la compression n'a pas réduit la taille, garder le fichier original
                                resolve(file);
                                return;
                            }
                            const newFileName = file.name.replace(/\.[^/.]+$/, '.jpg');
                            const compressedFile = new File([blob], newFileName, {
                                type: 'image/jpeg',
                                lastModified: Date.now(),
                            });
                            resolve(compressedFile);
                        },
                        'image/jpeg',
                        quality
                    );
                } catch {
                    URL.revokeObjectURL(objectUrl);
                    resolve(file);
                }
            };

            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                resolve(file);
            };

            img.src = objectUrl;
        } catch {
            resolve(file);
        }
    });
}

/**
 * Compresse un tableau de fichiers images.
 */
export async function compressImages(files: File[]): Promise<File[]> {
    return Promise.all(files.map(f => compressImage(f)));
}

/** Limite de sécurité par requête HTTP (3.5 Mo) pour rester sous le cap Serverless Vercel (4.5 Mo) */
const MAX_BATCH_BYTES = 3.5 * 1024 * 1024;

export interface UploadDriveParams {
    files: File[];
    vehicleName?: string | null;
    date: string;
    stage?: string | null;
    existingFolderId?: string | null;
    missionName?: string | null;
    rootFolderId?: string | null;
    allowPdf?: boolean;
}

export interface UploadDriveResult {
    success: boolean;
    folderId: string;
    subfolderId?: string;
    fileIds: string[];
    error?: string;
}

/**
 * Envoie un ensemble de fichiers vers /api/drive/upload.
 * Compresse automatiquement les images et découpe en requêtes < 3.5 Mo pour éviter FUNCTION_PAYLOAD_TOO_LARGE.
 */
export async function uploadFilesToDriveSafely(params: UploadDriveParams): Promise<UploadDriveResult> {
    if (!params.files || params.files.length === 0) {
        return {
            success: true,
            folderId: params.existingFolderId || '',
            subfolderId: params.existingFolderId || undefined,
            fileIds: [],
        };
    }

    // 1. Compression de toutes les images
    const compressedFiles = await compressImages(params.files);

    // 2. Regroupement par lots (batches) < 3.5 Mo
    const batches: File[][] = [];
    let currentBatch: File[] = [];
    let currentSize = 0;

    for (const file of compressedFiles) {
        if (currentBatch.length > 0 && currentSize + file.size > MAX_BATCH_BYTES) {
            batches.push(currentBatch);
            currentBatch = [];
            currentSize = 0;
        }
        currentBatch.push(file);
        currentSize += file.size;
    }
    if (currentBatch.length > 0) {
        batches.push(currentBatch);
    }

    let parentFolderId = params.existingFolderId || null;
    let targetSubfolderId: string | undefined = undefined;
    const allFileIds: string[] = [];

    // 3. Envoi séquentiel des lots
    for (let i = 0; i < batches.length; i++) {
        const batchFiles = batches[i];
        const fd = new FormData();

        fd.append('date', params.date);
        if (params.vehicleName) fd.append('vehicleName', params.vehicleName);
        if (params.stage) fd.append('stage', params.stage);
        if (params.missionName) fd.append('missionName', params.missionName);
        if (params.rootFolderId) fd.append('rootFolderId', params.rootFolderId);
        if (params.allowPdf) fd.append('allowPdf', 'true');

        if (parentFolderId) {
            fd.append('existingFolderId', parentFolderId);
        }

        batchFiles.forEach(f => fd.append('files', f));

        let res: Response;
        try {
            res = await fetch('/api/drive/upload', {
                method: 'POST',
                body: fd,
            });
        } catch {
            // Reconnexion réseau mobile ou transition rapide depuis l'appareil photo : pause de 400ms et retry
            await new Promise(r => setTimeout(r, 400));
            try {
                res = await fetch('/api/drive/upload', {
                    method: 'POST',
                    body: fd,
                });
            } catch {
                return {
                    success: false,
                    folderId: parentFolderId || '',
                    subfolderId: targetSubfolderId,
                    fileIds: allFileIds,
                    error: 'Erreur réseau lors de l\'envoi des photos. Veuillez vérifier votre connexion.',
                };
            }
        }

        if (!res.ok) {
            let errMsg = `Erreur HTTP ${res.status} lors de l'upload des fichiers.`;
            if (res.status === 413) {
                errMsg = 'La taille du fichier ou des photos est trop volumineuse pour le serveur (Erreur 413 Payload Too Large). Limite : 4 Mo max par envoi.';
            } else {
                try {
                    const data = await res.json();
                    errMsg = data.error || errMsg;
                } catch {}
            }
            return {
                success: false,
                folderId: parentFolderId || '',
                subfolderId: targetSubfolderId,
                fileIds: allFileIds,
                error: errMsg,
            };
        }

        const resData = await res.json();
        if (resData.folderId) parentFolderId = resData.folderId;
        if (resData.subfolderId) targetSubfolderId = resData.subfolderId;
        if (resData.fileIds && Array.isArray(resData.fileIds)) {
            allFileIds.push(...resData.fileIds);
        }
    }

    return {
        success: true,
        folderId: parentFolderId || '',
        subfolderId: targetSubfolderId,
        fileIds: allFileIds,
    };
}
