import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getRenaultVehicleData, getVinFromName } from '@/lib/renault';
import { auth } from '@/auth';

const checkOutSchema = z.object({
    vehicleId: z.string().min(1),
    driverName: z.string().min(1, 'Le nom du chauffeur est requis'),
    driverEmail: z.string().email().optional().or(z.literal('')),
    missionType: z.string().min(1, 'Le type de mission est requis'),
    missionName: z.string().optional(),
    conditionOut: z.string().min(1, "L'état du véhicule est requis"),
    parkingOut: z.string().optional(),
    dsaChecked: z.boolean().default(false),
    commentsOut: z.string().optional(),
    secondDriverName: z.string().optional(),
    secondDriverEmail: z.string().email().optional().or(z.literal('')),
    driveFolderId: z.string().optional(),
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const data = checkOutSchema.parse(body);

        // Vérifier que le véhicule est disponible
        const vehicleResult = await db.execute({
            sql: `SELECT * FROM Vehicle WHERE id = ?`,
            args: [data.vehicleId]
        });
        const vehicle = vehicleResult.rows[0];

        if (!vehicle) {
            return NextResponse.json(
                { error: 'Véhicule non trouvé' },
                { status: 404 }
            );
        }

        if (vehicle.status !== 'AVAILABLE') {
            return NextResponse.json(
                { error: 'Ce véhicule n\'est pas disponible' },
                { status: 400 }
            );
        }

        // Verify Roles
        const session = await auth();
        const roles = session?.user?.roles || ['GUEST'];
        const isAdmin = roles.includes('ADMIN');
        const isCHVL = roles.includes('CHVL');
        const isCHVPSP = roles.includes('CHVPSP');
        const vehicleType = String(vehicle.type || '');
        const isVPSP = vehicleType.toUpperCase().includes('VPSP');

        let canBorrow = false;
        if (isAdmin) canBorrow = true;
        else if (isCHVPSP) canBorrow = true;
        else if (isCHVL && !isVPSP) canBorrow = true;

        if (!canBorrow) {
            return NextResponse.json(
                { error: 'Vous n\'avez pas les droits pour emprunter ce véhicule' },
                { status: 403 }
            );
        }

        // Fetch live Renault data if vehicle is connected
        let mileageOut = vehicle.mileage as number;
        let fuelOut = vehicle.fuelLevel as number;
        const vehicleName = vehicle.name as string | undefined;

        if (vehicleName && (vehicleName.includes('VL186') || vehicleName.includes('VL188'))) {
            const vin = getVinFromName(vehicleName);
            if (vin) {
                try {
                    const rData = await getRenaultVehicleData(vin);
                    if (rData.totalMileage !== null) mileageOut = rData.totalMileage;
                    if (rData.isElectric && rData.batteryLevel !== null) fuelOut = rData.batteryLevel;
                    if (!rData.isElectric && rData.fuelQuantity !== null) {
                        // Map fuel quantity (L) back to a rough percentage for DB consistency, or just store the L value
                        // DB expects 0-100. Assume ~50L tank capacity for Espace VI.
                        fuelOut = Math.min(Math.round((rData.fuelQuantity / 50) * 100), 100);
                    }
                } catch (e) {
                    console.error('Failed to get live Renault data during checkout', e);
                }
            }
        }

        // Créer le trip et mettre à jour le véhicule en transaction
        const tx = await db.transaction('write');
        const tripId = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        try {
            await tx.execute({
                sql: `INSERT INTO Trip (
                        id, vehicleId, driverName, driverEmail, missionType, missionName, 
                        checkOutAt, mileageOut, fuelOut, conditionOut, parkingOut, dsaChecked, commentsOut, 
                        secondDriverName, secondDriverEmail, driveFolderId, createdAt
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    tripId,
                    data.vehicleId,
                    data.driverName,
                    data.driverEmail || null,
                    data.missionType,
                    data.missionName || null,
                    timestamp, // checkOutAt
                    mileageOut,
                    fuelOut,
                    data.conditionOut,
                    data.parkingOut || (vehicle.parkingSpot as string) || null,
                    data.dsaChecked ? 1 : 0,
                    data.commentsOut || null,
                    data.secondDriverName || null,
                    data.secondDriverEmail || null,
                    data.driveFolderId || null,
                    timestamp // createdAt
                ]
            });

            await tx.execute({
                sql: `UPDATE Vehicle SET status = 'IN_USE', mileage = ?, fuelLevel = ?, updatedAt = ? WHERE id = ?`,
                args: [mileageOut, fuelOut, timestamp, data.vehicleId]
            });

            await tx.commit();

            // Incident email notification
            if (data.conditionOut === "Problème signalé" || data.conditionOut === "Dégradé") {
                try {
                    const respoUsers = await db.execute(`
                        SELECT u.email 
                        FROM User u 
                        JOIN UserRole ur ON u.id = ur.userId 
                        JOIN Role r ON ur.roleId = r.id 
                        WHERE r.name = 'RESPO'
                    `);
                    const respoEmails = respoUsers.rows.map(r => r.email as string).filter(Boolean);

                    if (respoEmails.length > 0) {
                        const { sendEmailViaWebhook } = await import('@/lib/email');
                        const vName = vehicle.name || 'Véhicule inconnu';

                        await sendEmailViaWebhook({
                            to: respoEmails,
                            subject: `🚨 Incident signalé à la prise de ${vName}`,
                            body: `
                                <h2>Alerte Incident Véhicule (Prise)</h2>
                                <p>Le conducteur <strong>${data.driverName}</strong> a signalé un incident lors de la prise du véhicule <strong>${vName}</strong>.</p>
                                <ul>
                                    <li><strong>État de la carrosserie :</strong> ${data.conditionOut}</li>
                                    <li><strong>Date/Heure :</strong> ${new Date(timestamp).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}</li>
                                </ul>
                                <p><strong>Commentaire :</strong><br />
                                <i>${data.commentsOut || 'Aucun commentaire fourni.'}</i></p>
                                <br />
                                <p><a href="https://cr-chauffeur.vercel.app/vehicles/${data.vehicleId}">Voir le véhicule sur l'application</a></p>
                            `
                        });
                    }
                } catch (emailError) {
                    console.error('Erreur lors de l\'envoi de l\'alerte email Incident:', emailError);
                }
            }

            const trip = {
                id: tripId,
                vehicleId: data.vehicleId,
                driverName: data.driverName,
                driverEmail: data.driverEmail || null,
                missionType: data.missionType,
                missionName: data.missionName || null,
                checkOutAt: timestamp,
                mileageOut,
                fuelOut,
                conditionOut: data.conditionOut,
                parkingOut: data.parkingOut || vehicle.parkingSpot,
                dsaChecked: data.dsaChecked,
                commentsOut: data.commentsOut || null,
                secondDriverName: data.secondDriverName || null,
                secondDriverEmail: data.secondDriverEmail || null,
                driveFolderId: data.driveFolderId || null,
                createdAt: timestamp,
                vehicle: { ...vehicle, status: 'IN_USE', mileage: mileageOut, fuelLevel: fuelOut, updatedAt: timestamp }
            };

            return NextResponse.json(trip, { status: 201 });
        } catch (e) {
            await tx.rollback();
            throw e;
        }



    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Données invalides', details: error.issues },
                { status: 400 }
            );
        }
        console.error('Error creating trip:', error);
        return NextResponse.json(
            { error: 'Erreur lors de la prise du véhicule' },
            { status: 500 }
        );
    }
}
