import { describe, it, expect } from 'vitest';
import { buildFtsQuery } from '@/lib/referentiel/query';

describe('buildFtsQuery', () => {
    it('retire les mots vides et met chaque terme entre guillemets en préfixe', () => {
        expect(buildFtsQuery('que faire devant une hémorragie')).toBe('"hemorragie"*');
    });

    it('combine plusieurs termes avec OR', () => {
        expect(buildFtsQuery('brûlure enfant')).toBe('"brulure"* OR "enfant"*');
    });

    it('rend la requête insensible à la casse et aux accents', () => {
        expect(buildFtsQuery('HÉMORRAGIE')).toBe(buildFtsQuery('hemorragie'));
    });

    it('renvoie null quand il ne reste que des mots vides', () => {
        expect(buildFtsQuery('que faire ?')).toBeNull();
    });

    it('renvoie null pour une chaîne vide ou de la ponctuation', () => {
        expect(buildFtsQuery('')).toBeNull();
        expect(buildFtsQuery('   ')).toBeNull();
        expect(buildFtsQuery('?!.,')).toBeNull();
    });

    it('neutralise les caractères et opérateurs FTS', () => {
        expect(buildFtsQuery('"*(OR')).toBeNull();
        const query = buildFtsQuery('foo" OR "bar* NEAR(baz) -qux');
        expect(query).not.toBeNull();
        // Rien d'autre que des termes entre guillemets reliés par OR.
        expect(query).toMatch(/^("[a-z0-9 ]+"\*?)( OR "[a-z0-9 ]+"\*?)*$/);
    });

    it('ignore les termes d\'un seul caractère', () => {
        expect(buildFtsQuery('x hémorragie')).toBe('"hemorragie"*');
    });

    it('ajoute les synonymes du métier', () => {
        expect(buildFtsQuery('RCP enfant')).toBe(
            '"rcp"* OR "enfant"* OR "reanimation cardiopulmonaire" OR "massage cardiaque"',
        );
        expect(buildFtsQuery('DAE')).toContain('"defibrillateur"*');
        expect(buildFtsQuery('AVC')).toContain('"accident vasculaire cerebral"');
        expect(buildFtsQuery('PLS')).toContain('"position laterale de securite"');
    });

    it('relie malaise et détresse dans les deux sens', () => {
        expect(buildFtsQuery('malaise')).toContain('"detresse"*');
        expect(buildFtsQuery('détresse')).toContain('"malaise"*');
    });

    it('plafonne le nombre de termes', () => {
        const query = buildFtsQuery(Array.from({ length: 40 }, (_, i) => `terme${i}`).join(' '));
        expect(query!.split(' OR ')).toHaveLength(12);
    });
});
