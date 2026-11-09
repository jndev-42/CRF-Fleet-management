import { isR2Ref, type MediaType, type TripStage } from '@/lib/media/refs';

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
    maxDimension = 1600,
    quality = 0.78
): Promise<File> {
    if (!file.type.startsWith('image/')) {
        return file;
    }

    // Bypass instantané si le fichier fait déjà moins de 800 Ko
    if (file.size < 800 * 1024) {
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

const UPLOAD_ENDPOINT = '/api/media/upload';

export interface UploadMediaParams {
    files: File[];
    /** Rangement R2 : `trip-photos` | `incident-photos` | `mission-com-photos` | `mission-report-photo`. */
    type: MediaType;
    /** Trajet, incident : véhicule dont l'UL et le nom servent au rangement. */
    vehicleId?: string | null;
    /** Rendu : trajet visé (droits du conducteur, quelle que soit l'UL ; dossier du trajet). */
    tripId?: string | null;
    /** Mission : UL du compte rendu (repli serveur sur l'UL de la session). */
    ulId?: string | null;
    /** Mission : nom du dossier lisible. */
    name?: string | null;
    /** Trajet : `emprunt` | `rendu`. */
    stage?: TripStage | null;
    /** Préfixe déjà créé (rendu d'un trajet). */
    existingFolderId?: string | null;
}

export interface UploadMediaResult {
    success: boolean;
    /** Préfixe R2 du dossier, à enregistrer en base. */
    folderId: string;
    subfolderId?: string;
    /** Clés R2 des fichiers écrits. */
    fileIds: string[];
    error?: string;
}

/**
 * Envoie un ensemble de fichiers vers /api/media/upload (stockage R2).
 * Compresse automatiquement les images et découpe en requêtes < 3.5 Mo pour éviter
 * FUNCTION_PAYLOAD_TOO_LARGE ; les lots suivants réutilisent le dossier créé par le premier.
 */
export async function uploadMediaSafely(params: UploadMediaParams): Promise<UploadMediaResult> {
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
    for (const batchFiles of batches) {
        const fd = new FormData();

        fd.append('type', params.type);
        if (params.vehicleId) fd.append('vehicleId', params.vehicleId);
        if (params.tripId) fd.append('tripId', params.tripId);
        if (params.ulId) fd.append('ulId', params.ulId);
        if (params.name) fd.append('name', params.name);
        if (params.stage) fd.append('stage', params.stage);
        if (parentFolderId) fd.append('existingFolderId', parentFolderId);

        batchFiles.forEach(f => fd.append('files', f));

        let res: Response;
        try {
            res = await fetch(UPLOAD_ENDPOINT, { method: 'POST', body: fd });
        } catch {
            // Reconnexion réseau mobile ou transition rapide depuis l'appareil photo : pause de 400ms et retry
            await new Promise(r => setTimeout(r, 400));
            try {
                res = await fetch(UPLOAD_ENDPOINT, { method: 'POST', body: fd });
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

/**
 * URL d'affichage d'un fichier R2 (`/api/media/file`), ou `null` si la référence
 * n'est pas une clé R2 (id Drive résiduel, `mock-…`) : aucun fichier à afficher.
 */
export function mediaFileUrl(id: string | null | undefined): string | null {
    return isR2Ref(id) ? `/api/media/file?key=${encodeURIComponent(id)}` : null;
}

/**
 * URL de liste des fichiers d'un dossier R2, ou `null` si la référence n'est pas
 * un préfixe R2 (id Drive résiduel, `mock-…`) : aucun fichier, aucun appel réseau.
 */
export function mediaListUrl(ref: string | null | undefined, opts: { flat?: boolean } = {}): string | null {
    if (!isR2Ref(ref)) return null;
    return `/api/media/photos?folderId=${encodeURIComponent(ref)}${opts.flat ? '&flat=true' : ''}`;
}

