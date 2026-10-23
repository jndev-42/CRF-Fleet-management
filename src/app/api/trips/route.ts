import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { canManageVehicles, isChvlDriver, isChvpspDriver } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse, isOutsideUl } from '@/lib/apiAuth';
import { isLicenseBlocked, LICENSE_BLOCKED_MESSAGE, secondDriverLicenseError } from '@/lib/licenseGuard';
import { UNASSIGNED_DRIVER_NAME } from '@/lib/reservationDriver';
import { checkOutSchema } from './schema';
import { withAudit } from '@/lib/audit/log';
import { secondDriverError } from '@/lib/eligibleDrivers';
import { applyCheckoutCorrection, readCheckoutBaseline, sendCheckoutAlerts } from '@/lib/checkout';

async function postHandler(request: Request) {
    try {
        // Auth check must happen before any body parsing or DB queries
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        // Rôles résolus dès l'authentification : la garde de cloisonnement UL ci-dessous
        // en a besoin, bien avant la garde d'éligibilité (`canBorrow`) qui les consommait
        // seule auparavant.
        const roles = session?.user?.roles || ['INACTIF'];
        const isAdmin = canManageVehicles(roles);

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

        // Cloisonnement UL — placé AVANT les gardes d'état (disponibilité, maintenance)
        // pour deux raisons distinctes :
        //
        // 1. Emprunt inter-UL. Cette route n'avait aucun contrôle d'UL : un `vehicleId`
        //    récolté dans la vision DT (qui liste les véhicules des autres ULs) suffisait
        //    à sortir le véhicule d'une autre unité. La garde de rôle (`canBorrow`) ne
        //    ferme rien ici : un CHVL légitime de Lyon reste un CHVL face à un VL parisien.
        // 2. Oracle d'état de flotte. Les gardes suivantes répondent 400 « pas disponible »
        //    ou 400 « en maintenance » — trois réponses distinctes qui laissaient tout
        //    compte authentifié, INACTIF compris, sonder la flotte d'une autre UL.
        //
        // Le refus est donc un 404 et non un 403 : il doit être indiscernable d'un
        // identifiant inconnu. `isOutsideUl` refuse aussi les sentinelles (`ulId` vide ou
        // `'default'`) avant toute comparaison, cf. `@/lib/apiAuth`.
        if (isOutsideUl(roles, session.user.ulId, vehicle.ulId)) {
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

        // Instant de référence partagé par toutes les gardes de pré-condition qui suivent
        // (maintenance, puis réservation) : deux « maintenant » divergents dans une même
        // requête seraient un piège.
        const nowISO = new Date().toISOString();

        // Verrou maintenance : la colonne Vehicle.status ne suffit pas — une maintenance
        // datée du futur n'y est jamais projetée (maintenance-events/route.ts:61) et tout
        // check-in la réécrit à 'AVAILABLE' (trips/[id]/checkin/route.ts:209).
        // Prédicat copié de api/vehicles/[id]/route.ts:88-96 pour rester en phase avec
        // la définition système de « maintenance active ».
        // Hors transaction : garde de pré-condition, aucune écriture.
        const todayDate = nowISO.split('T')[0];
        const maintCheck = await db.execute({
            sql: `SELECT 1 FROM "VehicleMaintenance"
                  WHERE vehicleId = ?
                    AND ((startDate LIKE '%T%' AND startDate <= ?) OR (startDate NOT LIKE '%T%' AND startDate <= ?))
                    AND (endDate IS NULL OR (endDate LIKE '%T%' AND endDate > ?) OR (endDate NOT LIKE '%T%' AND endDate >= ?))
                  LIMIT 1`,
            args: [data.vehicleId, nowISO, todayDate, nowISO, todayDate],
        });
        if (maintCheck.rows.length > 0) {
            return NextResponse.json({ error: 'Ce véhicule est en maintenance' }, { status: 400 });
        }

        // Garde de réservation : un véhicule couvert par une réservation VALIDATED
        // active maintenant n'est empruntable que par son détenteur — ou par un admin.
        //
        // Exception : une réservation « Chauffeur non décidé » n'a pas de détenteur
        // opposable (son `userEmail` n'est que celui du gestionnaire (canManageReservations) qui l'a posée). Elle est
        // donc exclue de la recherche du `holder` : tout chauffeur éligible peut prendre
        // le véhicule sur le créneau. Le `!=` écarte aussi le créateur d'un privilège
        // qu'il n'a pas — il emprunte au même titre que les autres.
        const activeRes = await db.execute({
            sql: `SELECT userEmail FROM "Reservation"
                  WHERE vehicleId = ? AND status = 'VALIDATED'
                    AND startTime <= ? AND endTime >= ?
                    AND userName != ?
                  LIMIT 1`,
            args: [data.vehicleId, nowISO, nowISO, UNASSIGNED_DRIVER_NAME],
        });
        const holder = activeRes.rows[0]?.userEmail as string | undefined;
        if (holder && holder !== session.user.email && !isAdmin) {
            return forbiddenResponse('Ce véhicule est réservé par un autre utilisateur');
        }

        const isCHVL = isChvlDriver(roles);
        const isCHVPSP = isChvpspDriver(roles);
        const vehicleType = String(vehicle.type || '');
        const isVPSP = vehicleType.toUpperCase().includes('VPSP');

        // Garde des papiers de conduite, sans dispense par rôle : un gestionnaire qui
        // prend le volant y est soumis comme un chauffeur. Fermée par défaut (compte
        // introuvable → refus) et rejouée en lecture seule, cf. `@/lib/licenseGuard`.
        // La dispense de *rôle chauffeur* des gestionnaires (`canBorrow`) est conservée.
        if (await isLicenseBlocked(session.user.id)) {
            return forbiddenResponse(LICENSE_BLOCKED_MESSAGE);
        }

        // Désinfection n'est disponible que pour les véhicules VPSP (validation véhicule indépendante du rôle)
        if (data.missionType === 'Désinfection' && !isVPSP) {
            return NextResponse.json(
                { error: 'Le type de mission Désinfection est réservé aux véhicules VPSP' },
                { status: 400 }
            );
        }

        let canBorrow = false;
        if (isAdmin) canBorrow = true;
        else if (isCHVPSP && isVPSP) canBorrow = true;
        else if (isCHVL && !isVPSP) canBorrow = true;

        if (!canBorrow) {
            return forbiddenResponse('Vous n\'avez pas les droits pour emprunter ce véhicule');
        }

        // Kilométrage/carburant de départ et correction déclarée — règles partagées avec
        // `POST /api/qr/[token]/checkout` (cf. `@/lib/checkout`).
        const baseline = await readCheckoutBaseline(vehicle);
        const correction = applyCheckoutCorrection(baseline, data);
        if (!correction.ok) {
            return NextResponse.json(correction.body, { status: 400 });
        }
        const { mileage: mileageOut, fuel: fuelOut } = correction.levels;

        const driverId = session.user.id;

        // 2ème conducteur : chauffeur actif habilité, distinct de l'emprunteur (même
        // contrôle que l'emprunt par QR code).
        if (data.secondDriverId) {
            const secondDriverMessage = await secondDriverError(vehicle.type, driverId, data.secondDriverId);
            if (secondDriverMessage) {
                return NextResponse.json({ error: secondDriverMessage }, { status: 400 });
            }
            // Papiers du 2ème conducteur : même garde que l'emprunt par QR code.
            const licenseMessage = await secondDriverLicenseError(data.secondDriverId);
            if (licenseMessage) {
                return forbiddenResponse(licenseMessage);
            }
        }

        // Créer le trip et mettre à jour le véhicule en transaction
        const tx = await db.transaction('write');
        const tripId = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        try {
            await tx.execute({
                sql: `INSERT INTO Trip (
                        id, vehicleId, driverId, secondDriverId, missionType, missionName,
                        checkOutAt, mileageOut, fuelOut, conditionOut, cleanlinessOut, parkingOut, dsaChecked, commentsOut,
                        driveFolderId, checklistOut, createdAt
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    tripId,
                    data.vehicleId,
                    driverId,
                    data.secondDriverId || null,
                    data.missionType,
                    data.missionName || null,
                    timestamp, // checkOutAt
                    mileageOut,
                    fuelOut,
                    data.conditionOut,
                    data.cleanlinessOut || null,
                    data.parkingOut || (vehicle.parkingSpot as string) || null,
                    data.dsaChecked ? 1 : 0,
                    data.commentsOut || null,
                    data.driveFolderId || null,
                    data.checklistOut ? JSON.stringify(data.checklistOut) : null,
                    timestamp // createdAt
                ]
            });

            await tx.execute({
                sql: `UPDATE Vehicle SET status = 'IN_USE', mileage = ?, fuelLevel = ?, updatedAt = ? WHERE id = ?`,
                args: [mileageOut, fuelOut, timestamp, data.vehicleId]
            });

            // Auto-delete active reservation for this user if they are taking the vehicle they reserved.
            // Une réservation VALIDATED « Chauffeur non décidé » est consommée de la même
            // façon, quel que soit l'emprunteur : elle n'appartient à personne, et la
            // laisser en place rouvrirait le créneau à un second chauffeur au retour du
            // premier. Le filtre `status` n'est appliqué qu'à cette branche : la branche
            // nominative continue d'emporter aussi les PENDING de l'emprunteur.
            if (session.user.email) {
                await tx.execute({
                    sql: `DELETE FROM "Reservation"
                          WHERE vehicleId = ? AND startTime <= ? AND endTime >= ?
                            AND (userEmail = ? OR (userName = ? AND status = 'VALIDATED'))`,
                    args: [data.vehicleId, timestamp, timestamp, session.user.email, UNASSIGNED_DRIVER_NAME]
                });
            }

            await tx.commit();

            await sendCheckoutAlerts({
                vehicle,
                user: session.user,
                conditionOut: data.conditionOut,
                baseline,
                levels: correction.levels,
            });

            const trip = {
                id: tripId,
                vehicleId: data.vehicleId,
                driverId,
                driverName: session.user.name || null,
                driverEmail: session.user.email || null,
                missionType: data.missionType,
                missionName: data.missionName || null,
                checkOutAt: timestamp,
                mileageOut,
                fuelOut,
                conditionOut: data.conditionOut,
                parkingOut: data.parkingOut || vehicle.parkingSpot,
                dsaChecked: data.dsaChecked,
                commentsOut: data.commentsOut || null,
                secondDriverId: data.secondDriverId || null,
                driveFolderId: data.driveFolderId || null,
                checklistOut: data.checklistOut || null,
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

export const POST = withAudit(postHandler, { action: "Prise d'un véhicule", entityType: 'trip' });
