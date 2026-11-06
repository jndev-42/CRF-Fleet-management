/**
 * Documents liés à un véhicule — helpers serveur communs aux routes véhicule et QR.
 *
 * Un document n'est jamais résolu que par `id` ET `vehicleId` : un jeton QR (ou un
 * nom de véhicule) n'ouvre donc jamais le document d'un autre véhicule.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { guideContentDisposition } from '@/lib/vehicleGuide';
import type { VehicleDocumentMeta } from './types';

export async function listVehicleDocuments(vehicleId: string): Promise<VehicleDocumentMeta[]> {
    const res = await db.execute({
        sql: `SELECT id, fileName, size, createdAt FROM VehicleDocument WHERE vehicleId = ? ORDER BY createdAt ASC, id ASC`,
        args: [vehicleId],
    });
    return res.rows.map(r => ({
        id: r.id as string,
        fileName: r.fileName as string,
        size: Number(r.size),
        createdAt: r.createdAt as string,
    }));
}

/**
 * Restitue un document depuis R2 (`inline`, ou `attachment` avec `download`).
 * 404 si le document n'appartient pas à ce véhicule.
 */
export async function vehicleDocumentResponse(
    vehicleId: string,
    documentId: string,
    download: boolean,
): Promise<NextResponse> {
    const res = await db.execute({
        sql: `SELECT r2Key, fileName FROM VehicleDocument WHERE id = ? AND vehicleId = ?`,
        args: [documentId, vehicleId],
    });
    const row = res.rows[0];
    if (!row) {
        return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 });
    }

    const key = row.r2Key as string;
    const { getObject } = await import('@/lib/r2');
    const buffer = await getObject(key);
    if (!buffer) {
        // La base référence une clé absente du bucket : anomalie à faire remonter.
        console.error(`[vehicle-document] objet R2 introuvable pour le véhicule ${vehicleId} : ${key}`);
        return NextResponse.json({
            error: 'Le document est introuvable. Contactez un administrateur.',
        }, { status: 409 });
    }

    return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': guideContentDisposition(row.fileName as string, download),
            'Content-Length': String(buffer.length),
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}

/**
 * Supprime les lignes puis les objets R2 de tous les documents d'un véhicule.
 * À appeler après la suppression du véhicule : un échec R2 est journalisé, jamais fatal.
 */
export async function deleteVehicleDocuments(vehicleId: string): Promise<void> {
    const res = await db.execute({
        sql: `SELECT r2Key FROM VehicleDocument WHERE vehicleId = ?`,
        args: [vehicleId],
    });
    const keys = res.rows.map(r => r.r2Key as string);
    if (keys.length === 0) return;

    await db.execute({ sql: `DELETE FROM VehicleDocument WHERE vehicleId = ?`, args: [vehicleId] });

    const { deleteObject } = await import('@/lib/r2');
    await Promise.all(keys.map(key =>
        deleteObject(key).catch((e: unknown) =>
            console.error(`[vehicle-document] suppression de ${key} impossible :`, e instanceof Error ? e.message : String(e)))));
}
