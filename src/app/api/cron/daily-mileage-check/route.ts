import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRenaultVehicleData } from '@/lib/vehicle-connection';
import { unauthorizedResponse } from '@/lib/apiAuth';
import { getErrorMessage } from '@/lib/utils/error';

// Route sécurisée par Vercel Cron. On n'associe pas d'auth NextAuth ici.
export async function GET(request: Request) {
    // Optional: Protect route from external access if not from Vercel CRON.
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return unauthorizedResponse();
    }

    try {
        // Supprimer les réservations dont la date de fin est antérieure à maintenant
        const now = new Date().toISOString();
        const deleted = await db.execute({
            sql: `DELETE FROM Reservation WHERE endTime < ?`,
            args: [now]
        });
        console.log(`Cron: ${deleted.rowsAffected} réservation(s) expirée(s) supprimée(s)`);

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

        // On cherche les véhicules qui sont connectés — la connexion est portée
        // par VehicleConnection, plus par la présence d'un VIN sur Vehicle.
        // Les lignes en ERROR sont incluses : sans backoff (le cron ne tourne
        // qu'une fois par jour, cf. vercel.json), c'est ce run qui porte
        // l'auto-guérison d'un credential réparé.
        const connectedVehiclesObj = await db.execute(`
            SELECT v.id, v.name, v.mileage, v.status, v.ulId
            FROM Vehicle v
            JOIN VehicleConnection vc ON vc.vehicleId = v.id AND vc.status IN ('CONNECTED','ERROR')
        `);
        const vehicles = connectedVehiclesObj.rows;

        const alertsSent = [];
        // Portée RUN, jamais module : un Set de module survivrait sur une lambda
        // tiède et bloquerait un credential même après correction du mot de passe.
        const failedCredentials = new Set<string>();
        let processed = 0;
        let skipped = 0;
        let failures = 0;

        // Définir le début de la journée courante pour filtrer les Trajets du jour
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const startOfDayISO = startOfDay.toISOString();

        for (const v of vehicles) {
            const vehicleId = v.id as string;
            // Isolation par véhicule : une exception ne doit jamais interrompre
            // le run — VehicleNotConnectedError et BrandAuthError sont désormais
            // des levées normales, et le premier véhicule en échec tuerait
            // sinon la tâche quotidienne entière.
            try {
                const name = v.name as string;
                const currentDbMileage = (v.mileage as number) || 0;
                const isMaintenance = v.status === 'MAINTENANCE';

                if (isMaintenance) {
                    skipped++;
                    continue; // Pas d'alerte pour les véhicules en maintenance
                }

                const rData = await getRenaultVehicleData(vehicleId, { failedCredentials });
                processed++;
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
                            url: `https://cr-chauffeur.vercel.app/vehicles/${name}`,
                            ulId: v.ulId as string || 'ul-paris-18'
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
            } catch (e: unknown) {
                failures++;
                console.error('[vehicle-connection] véhicule ignoré', vehicleId, getErrorMessage(e));
                continue;
            }
        }

        // Le compteur d'exceptions est la métrique qui rend visible un cron
        // qui échoue silencieusement véhicule après véhicule.
        console.log(`[vehicle-connection] cron: ${processed} traité(s), ${skipped} ignoré(s), ${failures} exception(s)`);

        return NextResponse.json({ success: true, alertsSent, reservationsDeleted: deleted.rowsAffected });

    } catch (error) {
        console.error('Error daily mileage checking:', error);
        return NextResponse.json({ error: 'Cron Failed' }, { status: 500 });
    }
}
