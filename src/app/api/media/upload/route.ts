/**
 * POST /api/media/upload — envoi de photos (emprunt/rendu, incident, communication
 * de mission) et du rapport de mission signé vers R2.
 *
 * Multipart : `files` (1..n), `type` (`trip-photos` | `incident-photos` |
 * `mission-com-photos` | `mission-report-photo`), `vehicleId` (emprunt, incident),
 * `tripId` (rendu d'un trajet), `ulId` (mission), `name` (nom de la mission ; ignoré
 * pour un véhicule, dont le nom est relu en base), `stage` (`emprunt` | `rendu`,
 * trajet seulement), `existingFolderId` (préfixe déjà créé : rendu d'un trajet, lot
 * suivant d'un envoi). Une référence non R2 (id Drive résiduel) est ignorée : un
 * nouveau préfixe est créé.
 *
 * Le dossier est TOUJOURS construit côté serveur : `{type}/{slug UL}/{nom}-{horodatage}-{xxxx}`.
 * Le client ne fournit jamais de clé.
 *
 * Droits d'envoi :
 *   - photos de trajet avec `tripId` : gestionnaire de l'UL du véhicule, ou conducteur /
 *     second conducteur du trajet, quelle que soit l'UL (rendu QR inter-UL) ;
 *   - photos d'emprunt (pas encore de trajet) : qui peut emprunter le véhicule (même
 *     règle que `POST /api/trips` : UL du véhicule et rôle de conduite ou gestionnaire) ;
 *   - photos d'incident : tout utilisateur connecté non INACTIF (comme `POST /api/incidents`) ;
 *   - mission : l'`ulId` envoyé n'est retenu que si l'utilisateur en est membre (ou
 *     SUPER_ADMIN) ; sinon son UL de rattachement, à défaut celle de la session.
 *
 * Trajet dont la colonne porte un id Drive résiduel : le rendu ouvre un nouveau
 * préfixe R2, que le check-in enregistre à la place de l'id Drive.
 *
 * Réponse : `{ success, folderId, subfolderId, fileIds }` — `folderId` est le préfixe
 * à enregistrer en base, `fileIds` les clés des fichiers écrits.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { canManageVehicles, isChvlDriver, isChvpspDriver, isQrBlocked, isSuperAdmin } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse, isOutsideUl } from '@/lib/apiAuth';
import { resolveFolderOwner } from '@/lib/media/access';
import { resolveSessionUserId } from '@/lib/missions/access';
import { getErrorMessage } from '@/lib/utils/error';
import { withAudit } from '@/lib/audit/log';
import {
    MEDIA_TYPES,
    TRIP_STAGES,
    VEHICLE_MEDIA_TYPES,
    buildMediaFileKey,
    buildMediaFolderRef,
    extensionOfMimeType,
    fileNameWithMimeExtension,
    isR2Ref,
    parseMediaFolderRef,
    readableSegment,
    type MediaType,
} from '@/lib/media/refs';
import { homeUlOf, isUlMember, ulSegmentOf } from '@/lib/media/server';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 4.2 * 1024 * 1024; // 4.2 Mo par fichier (corps Serverless limité à ~4.5 Mo)
const MAX_TOTAL_SIZE = 4.2 * 1024 * 1024; // 4.2 Mo par requête

/** Types acceptant un PDF en plus des images (rapport signé importé en PDF). */
const PDF_ALLOWED: readonly MediaType[] = ['mission-report-photo'];

const fieldsSchema = z.object({
    type: z.enum(MEDIA_TYPES),
    vehicleId: z.string().trim().min(1).max(200).optional(),
    tripId: z.string().trim().min(1).max(200).optional(),
    ulId: z.string().trim().min(1).max(200).optional(),
    name: z.string().trim().max(200).optional(),
    stage: z.enum(TRIP_STAGES).optional(),
    existingFolderId: z.string().trim().max(512).optional(),
}).superRefine((data, ctx) => {
    const isVehicle = VEHICLE_MEDIA_TYPES.includes(data.type);
    if (isVehicle && !data.vehicleId && !(data.type === 'trip-photos' && data.tripId)) {
        ctx.addIssue({ code: 'custom', path: ['vehicleId'], message: 'Véhicule manquant' });
    }
    if (data.tripId && data.type !== 'trip-photos') {
        ctx.addIssue({ code: 'custom', path: ['tripId'], message: 'Trajet réservé aux photos de trajet' });
    }
    if (!isVehicle && !data.name) {
        ctx.addIssue({ code: 'custom', path: ['name'], message: 'Nom de la mission manquant' });
    }
    if (data.type === 'trip-photos' && !data.stage) {
        ctx.addIssue({ code: 'custom', path: ['stage'], message: 'Étape manquante (emprunt ou rendu)' });
    }
    if (data.type !== 'trip-photos' && data.stage) {
        ctx.addIssue({ code: 'custom', path: ['stage'], message: 'Étape réservée aux photos de trajet' });
    }
});

function optionalField(formData: FormData, name: string): string | undefined {
    const value = formData.get(name);
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed && trimmed !== 'null' && trimmed !== 'undefined' ? trimmed : undefined;
}

function badRequest(error: string) {
    return NextResponse.json({ error }, { status: 400 });
}

/** Même règle que `POST /api/trips` : rôle de conduite du type de véhicule, sans dispense gestionnaire. */
function canBorrow(roles: string[], vehicleType: unknown): boolean {
    const isVPSP = String(vehicleType || '').toUpperCase().includes('VPSP');
    return isVPSP ? isChvpspDriver(roles) : isChvlDriver(roles);
}

interface TripContext {
    driveFolderId: string | null;
}

async function postHandler(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }
        const roles = session.user.roles || [];
        if (isQrBlocked(roles)) {
            return forbiddenResponse('Compte inactif');
        }

        let formData: FormData;
        try {
            formData = await request.formData();
        } catch {
            return badRequest('Requête invalide : des fichiers sont attendus.');
        }

        const parsed = fieldsSchema.safeParse({
            type: optionalField(formData, 'type'),
            vehicleId: optionalField(formData, 'vehicleId'),
            tripId: optionalField(formData, 'tripId'),
            ulId: optionalField(formData, 'ulId'),
            name: optionalField(formData, 'name'),
            stage: optionalField(formData, 'stage'),
            existingFolderId: optionalField(formData, 'existingFolderId'),
        });
        if (!parsed.success) {
            return badRequest(parsed.error.issues[0]?.message || 'Données invalides');
        }
        const data = parsed.data;

        const files = formData.getAll('files').filter((f): f is File => typeof f !== 'string');
        if (files.length === 0) {
            return badRequest('Aucun fichier reçu.');
        }
        const totalSize = files.reduce((acc, f) => acc + f.size, 0);
        if (totalSize > MAX_TOTAL_SIZE) {
            return badRequest(`La taille totale des fichiers (${(totalSize / (1024 * 1024)).toFixed(1)} Mo) dépasse la limite de 4.2 Mo par envoi.`);
        }
        const allowPdf = PDF_ALLOWED.includes(data.type);
        for (const file of files) {
            if (file.size > MAX_FILE_SIZE) {
                return badRequest(`Le fichier "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} Mo) dépasse la taille maximale autorisée de 4.2 Mo par fichier.`);
            }
            // Seuls les types que `/api/media/file` sait servir et que la liste reconnaît
            // (`MIME_BY_EXT`) : un SVG ou un JFIF serait stocké puis jamais affiché.
            const knownType = extensionOfMimeType(file.type) !== null;
            if (!knownType || (!file.type.startsWith('image/') && !(allowPdf && file.type === 'application/pdf'))) {
                return badRequest(allowPdf
                    ? `Le fichier "${file.name}" n'est pas une image ou un fichier PDF pris en charge.`
                    : `Le fichier "${file.name}" n'est pas une image prise en charge (JPEG, PNG, WebP, HEIC…).`);
            }
        }

        // UL, nom du dossier et droits : résolus CÔTÉ SERVEUR.
        let ulId: string | null = null;
        let folderName: string;
        let tripCtx: TripContext | null = null;
        if (VEHICLE_MEDIA_TYPES.includes(data.type)) {
            let vehicle: Record<string, unknown> | undefined;
            if (data.tripId) {
                const tripRes = await db.execute({
                    sql: `SELECT t.driverId, t.secondDriverId, t.driveFolderId, t.vehicleId,
                                 v.id AS vId, v.name AS vName, v.ulId AS vUlId, v.type AS vType
                          FROM Trip t JOIN Vehicle v ON v.id = t.vehicleId WHERE t.id = ?`,
                    args: [data.tripId],
                });
                const trip = tripRes.rows[0];
                if (!trip) {
                    return NextResponse.json({ error: 'Trajet non trouvé' }, { status: 404 });
                }
                if (data.vehicleId && data.vehicleId !== trip.vehicleId) {
                    return badRequest('Le véhicule ne correspond pas au trajet.');
                }
                const isDriver = !!session.user.id && (session.user.id === trip.driverId || session.user.id === trip.secondDriverId);
                const isUlManager = canManageVehicles(roles) && !isOutsideUl(roles, session.user.ulId, trip.vUlId);
                if (!isDriver && !isUlManager) {
                    return forbiddenResponse();
                }
                vehicle = { id: trip.vId, name: trip.vName, ulId: trip.vUlId, type: trip.vType };
                tripCtx = { driveFolderId: (trip.driveFolderId as string | null) || null };
            } else {
                const vehicleRes = await db.execute({
                    sql: `SELECT id, name, ulId, type FROM Vehicle WHERE id = ?`,
                    args: [data.vehicleId as string],
                });
                vehicle = vehicleRes.rows[0];
                if (!vehicle) {
                    return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
                }
                // Emprunt : qui peut emprunter ce véhicule. Incident : tout compte actif.
                if (data.type === 'trip-photos' && (isOutsideUl(roles, session.user.ulId, vehicle.ulId) || !canBorrow(roles, vehicle.type))) {
                    return forbiddenResponse();
                }
            }
            ulId = (vehicle.ulId as string | null) ?? null;
            folderName = String(vehicle.name ?? '');
        } else {
            const userId = await resolveSessionUserId(session);
            if (data.ulId) {
                const ulRes = await db.execute({ sql: `SELECT id FROM "UniteLocale" WHERE id = ?`, args: [data.ulId] });
                if (ulRes.rows[0] && (isSuperAdmin(roles) || await isUlMember(userId, data.ulId))) ulId = data.ulId;
            }
            if (!ulId) ulId = await homeUlOf(userId);
            if (!ulId && session.user.ulId && session.user.ulId !== 'default') ulId = session.user.ulId;
            folderName = data.name as string;
        }
        if (!ulId) {
            return badRequest('Unité locale introuvable pour ranger les fichiers.');
        }
        const ulSegment = await ulSegmentOf(ulId);

        // Dossier : réutilisé (rendu d'un trajet, lot suivant) ou créé.
        let folderRef: string | null = null;
        // Rendu d'un trajet : son préfixe R2 s'il en a un, quel que soit le dossier
        // envoyé. Une référence non R2 (id Drive résiduel, `mock-…`), envoyée ou portée
        // par le trajet, est ignorée : un nouveau préfixe est créé.
        const tripR2 = tripCtx && isR2Ref(tripCtx.driveFolderId) ? tripCtx.driveFolderId : null;
        const sentR2 = isR2Ref(data.existingFolderId) ? data.existingFolderId : null;
        const existing = tripR2 ?? sentR2;
        if (existing) {
            const existingParts = parseMediaFolderRef(existing);
            if (!existingParts || existingParts.type !== data.type) {
                return badRequest('Dossier existant invalide.');
            }
            const owner = await resolveFolderOwner(existing);
            if (tripCtx && tripCtx.driveFolderId === existing) {
                // Dossier du trajet visé : droits déjà vérifiés sur le trajet.
            } else if (owner) {
                // Dossier rattaché à un AUTRE enregistrement : pouvoir le lire n'autorise
                // pas à y verser des fichiers.
                if (!isSuperAdmin(roles)) {
                    return forbiddenResponse();
                }
            } else {
                // Dossier pas encore rattaché (lot suivant d'un même envoi) : seulement
                // dans l'UL résolue, et seulement s'il a déjà été créé par un envoi
                // précédent — jamais un préfixe inventé par le client.
                const { listObjects } = await import('@/lib/r2');
                if (existingParts.ulSegment !== ulSegment || (await listObjects(`${existing}/`)).length === 0) {
                    return forbiddenResponse();
                }
            }
            folderRef = existing;
        }
        if (!folderRef) {
            folderRef = buildMediaFolderRef(data.type, ulSegment, readableSegment(folderName, new Date()));
        }

        const { putObject } = await import('@/lib/r2');
        const stage = data.type === 'trip-photos' ? data.stage ?? null : null;
        const fileIds: string[] = [];
        for (const file of files) {
            const key = buildMediaFileKey(folderRef, fileNameWithMimeExtension(file.name, file.type), { stage });
            await putObject(key, Buffer.from(await file.arrayBuffer()), file.type || 'application/octet-stream');
            fileIds.push(key);
        }

        return NextResponse.json({
            success: true,
            folderId: folderRef,
            subfolderId: stage ? `${folderRef}/${stage}` : folderRef,
            fileIds,
        });
    } catch (error: unknown) {
        console.error('[POST /api/media/upload]', getErrorMessage(error));
        return NextResponse.json({ error: "Erreur lors de l'envoi des fichiers." }, { status: 500 });
    }
}

export const POST = withAudit(postHandler, { action: "Envoi d'une photo", entityType: 'photo' });
