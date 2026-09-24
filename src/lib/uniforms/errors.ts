import { NextResponse } from 'next/server';

/**
 * Refus métier du module Uniformes, porteur de son code HTTP.
 *
 * La logique vit dans `src/lib/uniforms/*`, partagée entre les routes de
 * l'application et celles du QR : lever une erreur typée plutôt que renvoyer
 * une union de résultats garde les deux familles de routes alignées sur les
 * mêmes codes (404 indiscernable, 409 de disponibilité ou d'état).
 */
export class UniformError extends Error {
    constructor(public readonly status: 400 | 401 | 404 | 409, message: string) {
        super(message);
        this.name = 'UniformError';
    }
}

/** Traduit une `UniformError` en réponse JSON ; `null` pour toute autre erreur. */
export function uniformErrorResponse(e: unknown): NextResponse | null {
    if (e instanceof UniformError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return null;
}
