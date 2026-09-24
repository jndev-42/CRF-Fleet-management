import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MAX_LABEL_LENGTH, MAX_NAME_LENGTH, MAX_QUANTITY } from './catalog';
import { MAX_LOAN_PIECES } from './loans';

/**
 * Schémas partagés : les routes appli et QR valident le même panier et le même
 * rendu, un schéma recopié divergerait au premier ajustement de borne.
 */

const name = z.string().trim().min(1, 'Nom requis').max(MAX_NAME_LENGTH);
const label = z.string().trim().min(1, 'Taille requise').max(MAX_LABEL_LENGTH);
const quantity = z.number().int().min(0).max(MAX_QUANTITY);

export const sizeInputSchema = z.object({ label, quantity }).strict();

export const createItemSchema = z.object({
    name,
    sizes: z.array(sizeInputSchema).max(30).default([]),
}).strict();

export const renameItemSchema = z.object({ name }).strict();

export const updateSizeSchema = z.object({
    label: label.optional(),
    quantity: quantity.optional(),
}).strict().refine(v => v.label !== undefined || v.quantity !== undefined, 'Aucune modification');

export const loanSchema = z.object({
    lines: z.array(z.object({
        sizeId: z.string().min(1),
        quantity: z.number().int().min(1).max(MAX_LOAN_PIECES),
    }).strict()).min(1).max(MAX_LOAN_PIECES),
}).strict();

export const returnSchema = z.object({
    // Obligatoire, sans valeur par défaut : l'état de la pièce décide si elle
    // redevient disponible ou part à laver — il ne se devine pas.
    returnedClean: z.boolean(),
    comment: z.string().trim().max(1000).optional().nullable(),
}).strict();

/**
 * Lit et valide le corps JSON. Renvoie la donnée typée, ou la réponse 400 à
 * retourner telle quelle (JSON illisible ou schéma non respecté).
 */
export async function parseBody<T extends z.ZodType>(
    request: Request,
    schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return { response: NextResponse.json({ error: 'Corps invalide' }, { status: 400 }) };
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        return { response: NextResponse.json({ error: 'Données invalides', details: parsed.error.issues }, { status: 400 }) };
    }
    return { data: parsed.data };
}

/** UL active réelle de la session, ou `null` (absente ou sentinelle `'default'`). */
export function activeUlId(ulId: unknown): string | null {
    return typeof ulId === 'string' && ulId !== '' && ulId !== 'default' ? ulId : null;
}
