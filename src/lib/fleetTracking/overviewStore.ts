import { db } from '@/lib/db';
import { parisDay } from './controls';
import { loadUlControls } from './controlsStore';
import { listDossiers } from './dossiersStore';
import { buildOverview, type FleetOverview } from './overview';
import { listTasks } from './tasksStore';

/**
 * Chargement de la vue d'ensemble d'une UL (livrable 5) — **serveur uniquement**.
 * Lecture seule : tâches non terminées, dossiers ouverts, contrôles et véhicules de
 * l'UL, agrégés par `buildOverview`.
 */
export async function loadUlOverview(ulId: string, sessionUserId: string | null, today: string = parisDay()): Promise<FleetOverview> {
    const [tasks, dossiers, controls, vehiclesRes] = await Promise.all([
        listTasks(ulId, { status: 'TODO,IN_PROGRESS,WAITING' }, sessionUserId),
        listDossiers(ulId, { status: 'OPEN' }),
        loadUlControls(ulId, today),
        db.execute({ sql: `SELECT id, name, type, plate FROM "Vehicle" WHERE ulId = ?`, args: [ulId] }),
    ]);
    const vehicles = vehiclesRes.rows.map(r => ({
        id: String(r.id),
        name: String(r.name),
        model: r.type ? String(r.type) : null,
        plate: r.plate ? String(r.plate) : null,
    }));
    return buildOverview({ today, tasks, dossiers, controls, vehicles });
}
