import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRenaultVehicleData } from '@/lib/renault';

// Route sécurisée par Vercel Cron. On n'associe pas d'auth NextAuth ici.
export async function GET(request: Request) {
    // Optional: Protect route from external access if not from Vercel CRON.
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const adminUsersObj = await db.execute(`
            SELECT u.email 
            FROM User u 
            JOIN UserRole ur ON u.id = ur.userId 
            JOIN Role r ON ur.roleId = r.id 
            WHERE r.name = 'ADMIN'
        `);
        const adminEmails = adminUsersObj.rows.map(r => r.email as string).filter(Boolean);

        if (adminEmails.length === 0) {
            return NextResponse.json({ message: 'Aucun admin configuré pour recevoir des alertes.' });
        }

        // On cherche les véhicules qui sont connectés
        const connectedVehiclesObj = await db.execute(`
            SELECT id, name, mileage, status, isMaintenance, vin 
            FROM Vehicle 
            WHERE vin IS NOT NULL AND vin != ''
        `);
        const vehicles = connectedVehiclesObj.rows;

        const alertsSent = [];

        // Définir le début de la journée courante pour filtrer les Trajets du jour
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const startOfDayISO = startOfDay.toISOString();

        for (const v of vehicles) {
            const vehicleId = v.id as string;
            const name = v.name as string;
            const currentDbMileage = (v.mileage as number) || 0;
            const isMaintenance = v.isMaintenance as number === 1;

            if (isMaintenance) {
                continue; // Pas d'alerte pour les véhicules en maintenance
            }

            const vin = v.vin as string;
            if (!vin) continue;

            const rData = await getRenaultVehicleData(vin);
            if (!rData || !rData.totalMileage) continue;

            const newMileage = rData.totalMileage;

            // Si le kilométrage a augmenté significativement (buffer de 2km pour marge d'erreur GPS/Télématique de parking)
            const gap = newMileage - currentDbMileage;

            if (gap > 2) {
                // Vérifier s'il y a eu un trajet officiel dans la journée
                // Soit un statut IN_USE (non rentré), soit un voyage créé aujourd'hui
                const todayTrips = await db.execute({
                    sql: `SELECT id FROM Trip WHERE vehicleId = ? AND (createdAt >= ? OR checkInAt IS NULL)`,
                    args: [vehicleId, startOfDayISO]
                });

                if (todayTrips.rows.length === 0) {
                    // Aucune déclaration d'emprunt aujourd'hui, mais la voiture a été roulée d'au moins X km. ALERTE ADMIN.
                    // Envoi Notification Push aux admins
                    const { sendPushNotification } = await import('@/lib/onesignal');
                    await sendPushNotification({
                        tags: [{ field: "tag", key: "role_ADMIN", relation: "=", value: "true" }],
                        headings: { en: `🚨 Utilisation suspecte : ${name}`, fr: `🚨 Utilisation suspecte : ${name}` },
                        contents: {
                            en: `${name} a été déplacé sans emprunt. Mouvement inexpliqué de +${gap} km.`,
                            fr: `${name} a été déplacé sans emprunt. Mouvement inexpliqué de +${gap} km.`
                        },
                        url: `https://cr-chauffeur.vercel.app/vehicles/${name}`
                    });

                    alertsSent.push(name);

                    // On met à jour le kilométrage en base de données pour ne pas renvoyer le mail à l'infini les nuits suivantes.
                    await db.execute({
                        sql: `UPDATE Vehicle SET mileage = ? WHERE id = ?`,
                        args: [newMileage, vehicleId]
                    });
                } else {
                    // Si des trajets officiels existent, on met simplement à jour le DB mileage par sécurité.
                    await db.execute({
                        sql: `UPDATE Vehicle SET mileage = ? WHERE id = ?`,
                        args: [newMileage, vehicleId]
                    });
                }
            } else if (newMileage > currentDbMileage) {
                // Maj silencieuse pour les légères variations
                await db.execute({
                    sql: `UPDATE Vehicle SET mileage = ? WHERE id = ?`,
                    args: [newMileage, vehicleId]
                });
            }
        }

        return NextResponse.json({ success: true, alertsSent });

    } catch (error) {
        console.error('Error daily mileage checking:', error);
        return NextResponse.json({ error: 'Cron Failed' }, { status: 500 });
    }
}
