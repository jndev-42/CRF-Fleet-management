import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { unauthorizedResponse } from '@/lib/apiAuth';
import { getDemoClient } from '@/lib/demo/server';
import { readDemoState, type DemoState } from '@/lib/demo/cloneDatabase';
import { isSuperAdmin } from '@/lib/roles';

export const dynamic = 'force-dynamic';

/** GET /api/demo/status — Le mode démo est-il disponible ?
 *
 *  Disponible seulement si la base démo est configurée (client créé) ET que sa
 *  dernière recopie est terminée (`DemoMeta.state = 'ready'`) : une recopie en
 *  cours, interrompue ou jamais faite rend la démo indisponible. Toute erreur de
 *  lecture compte comme indisponible.
 *
 *  Ouvert à tout compte connecté : sert uniquement à afficher ou masquer le bouton
 *  d'activation. Ne révèle aucune configuration au-delà de ce booléen, sauf au
 *  SUPER_ADMIN : `canRefresh: true` si la base démo est configurée (bouton de recopie,
 *  proposé même démo indisponible). Le champ n'est jamais renvoyé aux autres comptes.
 *
 *  `refreshing: true` (tout compte, absent sinon) si `DemoMeta.state = 'refreshing'` :
 *  une personne déjà en démo y reste au lieu d'être rebasculée sur les vraies données. */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }
        const state = await readState();
        const canRefresh = isSuperAdmin(session.user.roles || []) && getDemoClient() !== null;
        return NextResponse.json({
            available: state === 'ready',
            ...(state === 'refreshing' ? { refreshing: true } : {}),
            ...(canRefresh ? { canRefresh } : {}),
        });
    } catch (error) {
        console.error('Error fetching demo status:', error);
        return NextResponse.json({ error: 'Erreur lors de la lecture du statut du mode démo' }, { status: 500 });
    }
}

async function readState(): Promise<DemoState | null> {
    const client = getDemoClient();
    if (!client) return null;
    try {
        return (await readDemoState(client))?.state ?? null;
    } catch (e: unknown) {
        console.error('[demo] état de la base démo illisible :', e instanceof Error ? e.message : String(e));
        return null;
    }
}
