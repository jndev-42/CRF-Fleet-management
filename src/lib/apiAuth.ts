import { NextResponse } from 'next/server';

/**
 * Réponse 401 générique (pas de session active).
 * Corps canonique repris de src/app/api/CLAUDE.md — passer un message
 * uniquement pour les cas déjà spécifiques (ex. session invalide après impersonation).
 */
export function unauthorizedResponse(message = 'Non authentifié'): NextResponse {
    return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * Réponse 403 générique (rôle insuffisant).
 * Corps canonique repris de src/app/api/CLAUDE.md — passer un message
 * pour les refus avec une raison métier précise (ex. "Seul un responsable peut...").
 */
export function forbiddenResponse(message = 'Interdit'): NextResponse {
    return NextResponse.json({ error: message }, { status: 403 });
}
