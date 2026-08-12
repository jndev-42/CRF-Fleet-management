import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { canAccessAdminPanel } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

/** Validates incoming POST body for creating a reservation */
const createReservationSchema = z.object({
    startTime: z.string().datetime({ message: 'startTime doit être une date ISO valide' }),
    endTime: z.string().datetime({ message: 'endTime doit être une date ISO valide' }),
    reason: z.string().max(500).optional(),
    onBehalfOfUserId: z.string().min(1).optional(),
    isUnassignedDriver: z.boolean().optional(),
}).refine(data => new Date(data.endTime) > new Date(data.startTime), {
    message: 'endTime doit être après startTime',
    path: ['endTime'],
}).refine(data => new Date(data.startTime) > new Date(), {
    message: 'La réservation ne peut pas être dans le passé',
    path: ['startTime'],
});

/** Schema for a recurrence payload */
const recurrenceSchema = z.object({
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1, 'Au moins un jour de la semaine est requis'),
    startHour: z.string().regex(/^\d{2}:\d{2}$/, { message: 'startHour doit être au format HH:mm' }),
    endHour: z.string().regex(/^\d{2}:\d{2}$/, { message: 'endHour doit être au format HH:mm' }),
    recurrenceEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'recurrenceEndDate doit être au format YYYY-MM-DD' }),
    firstOccurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'firstOccurrenceDate doit être au format YYYY-MM-DD' }),
    reason: z.string().max(500).optional(),
    onBehalfOfUserId: z.string().min(1).optional(),
    isUnassignedDriver: z.boolean().optional(),
});

/** Generates all occurrence dates for a recurrence rule */
function generateOccurrenceDates(
    firstOccurrenceDate: string,
    recurrenceEndDate: string,
    daysOfWeek: number[]
): string[] {
    const occurrences: string[] = [];
    const start = new Date(`${firstOccurrenceDate}T00:00:00`);
    const end = new Date(`${recurrenceEndDate}T23:59:59`);

    const current = new Date(start);
    current.setHours(0, 0, 0, 0);

    while (current <= end) {
        const dayOfWeek = current.getDay(); // 0=Sun, 1=Mon, ...
        if (daysOfWeek.includes(dayOfWeek)) {
            const yyyy = current.getFullYear();
            const mm = String(current.getMonth() + 1).padStart(2, '0');
            const dd = String(current.getDate()).padStart(2, '0');
            occurrences.push(`${yyyy}-${mm}-${dd}`);
        }
        current.setDate(current.getDate() + 1);
    }

    return occurrences;
}

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const params = await props.params;
        const vehicleId = params.id;

        const result = await db.execute({
            sql: `
                SELECT r.id, r.vehicleId, r.userEmail, r.userName, r.startTime, r.endTime, r.reason, r.status, r.createdAt, r.recurrenceGroupId
                FROM "Reservation" r
                WHERE r.vehicleId = ?
                ORDER BY r.startTime ASC
            `,
            args: [vehicleId]
        });

        const reservations = result.rows.map(row => ({
            id: row.id as string,
            vehicleId: row.vehicleId as string,
            userEmail: row.userEmail as string,
            userName: row.userName as string,
            startTime: row.startTime as string,
            endTime: row.endTime as string,
            reason: row.reason as string | null,
            status: (row.status as string) || 'PENDING',
            createdAt: row.createdAt as string,
            recurrenceGroupId: (row.recurrenceGroupId as string | null) || null,
        }));

        return NextResponse.json(reservations);
    } catch (error) {
        console.error('Failed to fetch reservations:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const params = await props.params;
        const vehicleId = params.id;
        const body = await request.json();

        // ADMIN, CADRE, PRESIDENT, RESPO voient leurs réservations auto-validées
        const userRoles: string[] = session.user.roles || [];
        const isValidator = canAccessAdminPanel(userRoles);
        const status = isValidator ? 'VALIDATED' : 'PENDING';
        const canManageDriver = isValidator || userRoles.includes('RESPO');

        // ── Récurrence ────────────────────────────────────────────────────────────
        if (body.recurrence) {
            let recurrenceData: z.infer<typeof recurrenceSchema>;
            try {
                recurrenceData = recurrenceSchema.parse(body.recurrence);
            } catch (zodErr) {
                if (zodErr instanceof z.ZodError) {
                    return NextResponse.json({ error: 'Données de récurrence invalides', details: zodErr.issues }, { status: 400 });
                }
                throw zodErr;
            }

            // Vérification limite 6 mois
            const maxEndDate = new Date();
            maxEndDate.setMonth(maxEndDate.getMonth() + 6);
            const recEnd = new Date(recurrenceData.recurrenceEndDate);
            if (recEnd > maxEndDate) {
                return NextResponse.json({
                    error: 'La récurrence ne peut pas dépasser 6 mois à partir d\'aujourd\'hui.',
                }, { status: 400 });
            }

            // Vérification du premier jour dans le futur
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const firstDate = new Date(`${recurrenceData.firstOccurrenceDate}T00:00:00`);
            if (firstDate < today) {
                return NextResponse.json({
                    error: 'La date de début de la récurrence ne peut pas être dans le passé.',
                }, { status: 400 });
            }

            if ((recurrenceData.onBehalfOfUserId || recurrenceData.isUnassignedDriver) && !canManageDriver) {
                return forbiddenResponse('Seul un responsable peut réserver au nom d\'un autre chauffeur ou déclarer "Chauffeur non décidé".');
            }

            // Résolution du chauffeur
            let userEmail = session.user.email as string;
            let userName = session.user.name || session.user.email as string;

            if (recurrenceData.isUnassignedDriver || recurrenceData.onBehalfOfUserId === 'UNASSIGNED') {
                userName = 'Chauffeur non décidé';
                userEmail = session.user.email as string;
            } else if (recurrenceData.onBehalfOfUserId) {
                const targetResult = await db.execute({
                    sql: `SELECT id, name, email FROM "User" WHERE id = ?`,
                    args: [recurrenceData.onBehalfOfUserId],
                });
                if (targetResult.rows.length === 0) {
                    return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 });
                }
                userEmail = targetResult.rows[0].email as string;
                userName = (targetResult.rows[0].name as string) || userEmail;
            }

            // Génération des occurrences
            const occurrenceDates = generateOccurrenceDates(
                recurrenceData.firstOccurrenceDate,
                recurrenceData.recurrenceEndDate,
                recurrenceData.daysOfWeek
            );

            if (occurrenceDates.length === 0) {
                return NextResponse.json({
                    error: 'Aucune occurrence générée avec ces paramètres. Vérifiez les jours sélectionnés et la période.',
                }, { status: 400 });
            }

            const groupId = crypto.randomUUID();
            const created: string[] = [];
            const skipped: string[] = [];

            for (const dateStr of occurrenceDates) {
                const startISO = new Date(`${dateStr}T${recurrenceData.startHour}:00`).toISOString();
                const endISO = new Date(`${dateStr}T${recurrenceData.endHour}:00`).toISOString();

                // Vérification de conflit pour cette occurrence
                const conflicts = await db.execute({
                    sql: `
                        SELECT id, status
                        FROM "Reservation"
                        WHERE vehicleId = ?
                        AND status IN ('VALIDATED', 'PENDING')
                        AND (startTime < ? AND endTime > ?)
                    `,
                    args: [vehicleId, endISO, startISO],
                });

                if (conflicts.rows.length > 0) {
                    skipped.push(dateStr);
                    continue;
                }

                const id = crypto.randomUUID();
                await db.execute({
                    sql: `
                        INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, reason, status, recurrenceGroupId)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `,
                    args: [
                        id,
                        vehicleId,
                        userEmail,
                        userName,
                        startISO,
                        endISO,
                        recurrenceData.reason || null,
                        status,
                        groupId,
                    ],
                });
                created.push(dateStr);
            }

            if (created.length === 0) {
                return NextResponse.json({
                    error: 'Aucune occurrence n\'a pu être créée : tous les créneaux sont déjà réservés.',
                    skipped,
                }, { status: 409 });
            }

            // Notification groupée si en attente (une seule notif pour le groupe)
            if (status === 'PENDING') {
                try {
                    const vehicleResult = await db.execute({
                        sql: `SELECT name, ulId FROM "Vehicle" WHERE id = ?`,
                        args: [vehicleId],
                    });
                    const vehicleName = vehicleResult.rows[0]?.name as string || vehicleId;
                    const vehicleUlId = vehicleResult.rows[0]?.ulId as string || 'ul-paris-18';
                    const requesterName = session.user.name || session.user.email;

                    const { sendPushNotification } = await import('@/lib/onesignal');

                    const notifMsg = {
                        fr: `${requesterName} demande ${vehicleName} en récurrence (${created.length} créneaux). En attente de validation.`,
                        en: `${requesterName} requests ${vehicleName} as recurring reservation (${created.length} slots). Pending validation.`,
                    };

                    await sendPushNotification({
                        tags: [{ field: 'tag', key: 'role_ADMIN', relation: '=', value: 'true' }],
                        headings: { fr: `📋 Nouvelle réservation récurrente`, en: `📋 New recurring reservation` },
                        contents: notifMsg,
                        url: `https://cr-chauffeur.vercel.app/vehicles/${vehicleName}`,
                        ulId: vehicleUlId,
                    });

                    await sendPushNotification({
                        tags: [{ field: 'tag', key: 'role_RESPO', relation: '=', value: 'true' }],
                        headings: { fr: `📋 Nouvelle réservation récurrente`, en: `📋 New recurring reservation` },
                        contents: notifMsg,
                        url: `https://cr-chauffeur.vercel.app/vehicles/${vehicleName}`,
                        ulId: vehicleUlId,
                    });
                } catch (notifErr) {
                    console.error('Failed to send recurrence notification:', notifErr);
                }
            }

            return NextResponse.json({
                success: true,
                groupId,
                status,
                created: created.length,
                skipped,
            }, { status: 201 });
        }

        // ── Réservation simple (comportement original) ────────────────────────────
        let data: z.infer<typeof createReservationSchema>;
        try {
            data = createReservationSchema.parse(body);
        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Données invalides', details: zodErr.issues }, { status: 400 });
            }
            throw zodErr;
        }

        if ((data.onBehalfOfUserId || data.isUnassignedDriver) && !canManageDriver) {
            return forbiddenResponse('Seul un responsable peut réserver au nom d\'un autre chauffeur ou déclarer "Chauffeur non décidé".');
        }

        const start = new Date(data.startTime);
        const end = new Date(data.endTime);

        // Vérification de chevauchement : une seule requête pour VALIDATED et PENDING
        const conflicts = await db.execute({
            sql: `
                SELECT id, status
                FROM "Reservation"
                WHERE vehicleId = ?
                AND status IN ('VALIDATED', 'PENDING')
                AND (startTime < ? AND endTime > ?)
            `,
            args: [vehicleId, end.toISOString(), start.toISOString()]
        });

        const hasValidated = conflicts.rows.some(r => r.status === 'VALIDATED');
        const hasPending   = conflicts.rows.some(r => r.status === 'PENDING');

        // Tout le monde est bloqué par une réservation VALIDÉE
        if (hasValidated) {
            return NextResponse.json({ error: 'Ce créneau chevauche une réservation déjà validée.' }, { status: 409 });
        }
        // Tout le monde est bloqué par une réservation EN ATTENTE
        if (hasPending) {
            return NextResponse.json({ error: 'Ce créneau chevauche une demande de réservation déjà en attente.' }, { status: 409 });
        }

        let userEmail = session.user.email as string;
        let userName = session.user.name || session.user.email as string;

        if (data.isUnassignedDriver || data.onBehalfOfUserId === 'UNASSIGNED') {
            userName = 'Chauffeur non décidé';
            userEmail = session.user.email as string;
        } else if (data.onBehalfOfUserId) {
            const targetResult = await db.execute({
                sql: `SELECT id, name, email FROM "User" WHERE id = ?`,
                args: [data.onBehalfOfUserId]
            });
            if (targetResult.rows.length === 0) {
                return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 });
            }
            userEmail = targetResult.rows[0].email as string;
            userName = (targetResult.rows[0].name as string) || userEmail;
        }

        const id = crypto.randomUUID();

        await db.execute({
            sql: `
                INSERT INTO "Reservation" (id, vehicleId, userEmail, userName, startTime, endTime, reason, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `,
            args: [
                id,
                vehicleId,
                userEmail,
                userName,
                start.toISOString(),
                end.toISOString(),
                data.reason || null,
                status
            ]
        });

        // Si la réservation est en attente, notifier les ADMIN et RESPO
        if (status === 'PENDING') {
            try {
                const vehicleResult = await db.execute({
                    sql: `SELECT name, ulId FROM "Vehicle" WHERE id = ?`,
                    args: [vehicleId]
                });
                const vehicleName = vehicleResult.rows[0]?.name as string || vehicleId;
                const vehicleUlId = vehicleResult.rows[0]?.ulId as string || 'ul-paris-18';
                const requesterName = session.user.name || session.user.email;

                const { sendPushNotification } = await import('@/lib/onesignal');

                // Notifier les ADMIN
                await sendPushNotification({
                    tags: [{ field: "tag", key: "role_ADMIN", relation: "=", value: "true" }],
                    headings: { fr: `📋 Nouvelle demande de réservation`, en: `📋 New reservation request` },
                    contents: {
                        fr: `${requesterName} demande ${vehicleName} du ${start.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} au ${end.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}. En attente de validation.`,
                        en: `${requesterName} requests ${vehicleName} from ${start.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} to ${end.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}. Pending validation.`
                    },
                    url: `https://cr-chauffeur.vercel.app/vehicles/${vehicleName}`,
                    ulId: vehicleUlId
                });

                // Notifier les RESPO
                await sendPushNotification({
                    tags: [{ field: "tag", key: "role_RESPO", relation: "=", value: "true" }],
                    headings: { fr: `📋 Nouvelle demande de réservation`, en: `📋 New reservation request` },
                    contents: {
                        fr: `${requesterName} demande ${vehicleName} du ${start.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} au ${end.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}. En attente de validation.`,
                        en: `${requesterName} requests ${vehicleName} from ${start.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })} to ${end.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}. Pending validation.`
                    },
                    url: `https://cr-chauffeur.vercel.app/vehicles/${vehicleName}`,
                    ulId: vehicleUlId
                });
            } catch (notifErr) {
                console.error('Failed to send reservation notification:', notifErr);
            }
        }

        return NextResponse.json({ success: true, id, status }, { status: 201 });
    } catch (error) {
        console.error('Failed to create reservation:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
