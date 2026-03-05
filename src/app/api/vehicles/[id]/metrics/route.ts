import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { sendPushNotification } from '@/lib/onesignal';
import crypto from 'crypto';

const updateMetricsSchema = z.object({
    mileage: z.number().min(0).optional(),
    fuelLevel: z.number().min(0).max(100).optional(),
});

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }

        const { id: vehicleId } = await params;
        const body = await request.json();

        // Validate payload
        const data = updateMetricsSchema.parse(body);

        if (data.mileage === undefined && data.fuelLevel === undefined) {
            return NextResponse.json({ error: 'Aucune donnée à mettre à jour' }, { status: 400 });
        }

        // Fetch current vehicle
        const vehicleRes = await db.execute({
            sql: `SELECT * FROM Vehicle WHERE id = ?`,
            args: [vehicleId]
        });

        if (vehicleRes.rows.length === 0) {
            return NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 });
        }

        const vehicle = vehicleRes.rows[0];
        const vName = vehicle.name as string;

        // VERIFICATION: No manual edit if vehicle has a VIN (connected vehicle)
        if (vehicle.vin) {
            return NextResponse.json({
                error: 'Interdit : les métriques d\'un véhicule connecté (avec VIN) ne peuvent pas être modifiées manuellement.'
            }, { status: 403 });
        }

        // Build update query
        const setClauses: string[] = [];
        const args: (string | number)[] = [];
        const changes: string[] = [];

        if (data.mileage !== undefined && data.mileage !== vehicle.mileage) {
            setClauses.push('mileage = ?');
            args.push(data.mileage);
            changes.push(`kilométrage (${vehicle.mileage}km ➡️ ${data.mileage}km)`);
        }

        if (data.fuelLevel !== undefined && data.fuelLevel !== vehicle.fuelLevel) {
            setClauses.push('fuelLevel = ?');
            args.push(data.fuelLevel);
            const fuelType = vehicle.fuelType === 'Électrique' ? 'batterie' : 'carburant';
            changes.push(`niveau de ${fuelType} (${vehicle.fuelLevel}% ➡️ ${data.fuelLevel}%)`);
        }

        if (setClauses.length === 0) {
            return NextResponse.json({ message: 'Aucun changement détecté', vehicle });
        }

        const timestamp = new Date().toISOString();
        setClauses.push('updatedAt = ?');
        args.push(timestamp);
        args.push(vehicleId);

        // Update Vehicle
        await db.execute({
            sql: `UPDATE Vehicle SET ${setClauses.join(', ')} WHERE id = ?`,
            args
        });

        // Notifications
        const userActionName = session.user.name || session.user.email || 'Un utilisateur';
        const changesText = changes.join(' et le ');
        const notificationTitle = `🔧 Mise à jour du véhicule ${vName}`;
        const notificationMessage = `${userActionName} a modifié manuellement le ${changesText} pour le véhicule ${vName}.`;
        const notificationUrl = `/vehicles/${encodeURIComponent(vName)}`;

        try {
            // Send Push Notification via OneSignal (it also creates in-app notifications automatically)
            await sendPushNotification({
                tags: [{ field: "tag", key: "role_ADMIN", relation: "=", value: "true" }],
                headings: { en: notificationTitle, fr: notificationTitle },
                contents: { en: notificationMessage, fr: notificationMessage },
                url: `https://cr-chauffeur.vercel.app/vehicles/${encodeURIComponent(vName)}`
            });
        } catch (notifError) {
            console.error('Erreur lors de la création des notifications:', notifError);
            // Non-blocking error
        }

        // Refetch updated vehicle to return
        const updatedVehicleRes = await db.execute({
            sql: `SELECT * FROM Vehicle WHERE id = ? `,
            args: [vehicleId]
        });

        return NextResponse.json(updatedVehicleRes.rows[0]);

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.issues }, { status: 400 });
        }
        console.error('Error in PATCH /api/vehicles/[id]/metrics:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}
