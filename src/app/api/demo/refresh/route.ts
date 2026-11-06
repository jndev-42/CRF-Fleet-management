import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { forbiddenResponse, unauthorizedResponse } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';
import { refreshDemoDatabase } from '@/lib/demo/refresh';
import { isSuperAdmin } from '@/lib/roles';

// Même budget que le cron : la recopie peut prendre plusieurs minutes.
export const maxDuration = 300;

/** POST /api/demo/refresh — Recopie la prod dans la base démo, à la demande (SUPER_ADMIN).
 *
 *  Même code que le cron de 23h59 et même verrou : une seule recopie à la fois.
 *  Le détail d'un échec reste dans les logs. */
async function refreshDemo() {
    try {
        const session = await auth();
        if (!session?.user) return unauthorizedResponse();
        if (!isSuperAdmin(session.user.roles || [])) return forbiddenResponse();

        const result = await refreshDemoDatabase();
        switch (result.status) {
            case 'ok': {
                const { tables, rows, durationMs, purged } = result;
                return NextResponse.json({ success: true, tables, rows, durationMs, purged });
            }
            case 'not-configured':
                return NextResponse.json({ error: "La base de démonstration n'est pas configurée" }, { status: 503 });
            case 'locked':
                return NextResponse.json({ error: "Une recopie de la base de démonstration est déjà en cours ou vient de s'interrompre : réessayez dans quelques minutes." }, { status: 409 });
            case 'failed':
                return NextResponse.json({ error: 'La recopie de la base de démonstration a échoué' }, { status: 500 });
        }
    } catch (error) {
        console.error('Error refreshing demo database:', error);
        return NextResponse.json({ error: 'La recopie de la base de démonstration a échoué' }, { status: 500 });
    }
}

export const POST = withAudit(refreshDemo, { action: 'Recopie manuelle de la base démo', entityType: 'demo' });
