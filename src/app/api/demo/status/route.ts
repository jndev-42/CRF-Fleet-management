import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { unauthorizedResponse } from '@/lib/apiAuth';
import { getDemoClient } from '@/lib/demo/server';
import { readDemoState } from '@/lib/demo/cloneDatabase';

export const dynamic = 'force-dynamic';

/** GET /api/demo/status — Le mode démo est-il disponible ?
 *
 *  Disponible seulement si la base démo est configurée (client créé) ET que sa
 *  dernière recopie est terminée (`DemoMeta.state = 'ready'`) : une recopie en
 *  cours, interrompue ou jamais faite rend la démo indisponible. Toute erreur de
 *  lecture compte comme indisponible.
 *
 *  Ouvert à tout compte connecté : sert uniquement à afficher ou masquer le bouton
 *  d'activation. Ne révèle aucune configuration au-delà de ce booléen. */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }
        return NextResponse.json({ available: await isDemoReady() });
    } catch (error) {
        console.error('Error fetching demo status:', error);
        return NextResponse.json({ error: 'Erreur lors de la lecture du statut du mode démo' }, { status: 500 });
    }
}

async function isDemoReady(): Promise<boolean> {
    const client = getDemoClient();
    if (!client) return false;
    try {
        return (await readDemoState(client))?.state === 'ready';
    } catch (e: unknown) {
        console.error('[demo] état de la base démo illisible :', e instanceof Error ? e.message : String(e));
        return false;
    }
}
