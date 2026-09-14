/**
 * Tests unitaires — règles d'accès en lecture aux rapports d'incident.
 *
 * Frontière testée : l'ouverture à l'UL ne doit jamais déborder sur les brouillons
 * d'autrui, sur une autre UL, ni révéler l'identité du déclarant.
 */
import { describe, it, expect } from 'vitest';
import {
    canRevealIncidentAuthor,
    canViewIncident,
    isIncidentAuthor,
    isIncidentViewerBlocked,
    isWithinUlScope,
    type IncidentSubject,
    type IncidentViewer,
} from '@/lib/incidentAccess';

const UL = 'ul-paris-18';
const OTHER_UL = 'ul-lyon-3';

const viewer = (over: Partial<IncidentViewer> = {}): IncidentViewer => ({
    userId: 'user-1',
    ulId: UL,
    roles: ['CHVL'],
    ...over,
});

const subject = (over: Partial<IncidentSubject> = {}): IncidentSubject => ({
    authorId: 'user-2',
    vehicleUlId: UL,
    status: 'SUBMITTED',
    ...over,
});

describe('isIncidentViewerBlocked', () => {
    it('bloque INACTIF, même cumulé avec un rôle actif', () => {
        expect(isIncidentViewerBlocked(['INACTIF'])).toBe(true);
        expect(isIncidentViewerBlocked(['CHVL', 'INACTIF'])).toBe(true);
    });

    it('bloque la valeur héritée GUEST', () => {
        expect(isIncidentViewerBlocked(['GUEST'])).toBe(true);
    });

    it("n'exclut pas un compte sans rôle attribué", () => {
        expect(isIncidentViewerBlocked([])).toBe(false);
    });
});

describe('isWithinUlScope', () => {
    it('accepte la même UL', () => {
        expect(isWithinUlScope(viewer(), UL)).toBe(true);
    });

    it('refuse une autre UL', () => {
        expect(isWithinUlScope(viewer(), OTHER_UL)).toBe(false);
    });

    it('refuse quand une des deux ULs est absente (null ≠ null)', () => {
        expect(isWithinUlScope(viewer({ ulId: null }), null)).toBe(false);
        expect(isWithinUlScope(viewer(), null)).toBe(false);
        expect(isWithinUlScope(viewer({ ulId: null }), UL)).toBe(false);
    });

    it('laisse passer SUPER_ADMIN sur toute UL', () => {
        expect(isWithinUlScope(viewer({ roles: ['SUPER_ADMIN'], ulId: OTHER_UL }), UL)).toBe(true);
    });

    it('refuse un SUPER_ADMIN inactif', () => {
        expect(isWithinUlScope(viewer({ roles: ['SUPER_ADMIN', 'INACTIF'], ulId: OTHER_UL }), UL)).toBe(false);
    });
});

describe('isIncidentAuthor', () => {
    it('reconnaît le déclarant', () => {
        expect(isIncidentAuthor(viewer({ userId: 'user-2' }), subject())).toBe(true);
    });

    it('refuse un autre utilisateur', () => {
        expect(isIncidentAuthor(viewer(), subject())).toBe(false);
    });

    it("refuse une session sans identifiant, même face à un authorId vide", () => {
        expect(isIncidentAuthor(viewer({ userId: undefined }), subject({ authorId: '' }))).toBe(false);
    });
});

describe('canViewIncident', () => {
    it("ouvre le rapport SOUMIS d'autrui à un membre de l'UL", () => {
        expect(canViewIncident(viewer(), subject())).toBe(true);
    });

    it("refuse le brouillon d'autrui", () => {
        expect(canViewIncident(viewer(), subject({ status: 'DRAFT' }))).toBe(false);
    });

    it('autorise son propre brouillon', () => {
        expect(canViewIncident(viewer({ userId: 'user-2' }), subject({ status: 'DRAFT' }))).toBe(true);
    });

    it("autorise l'admin sur le brouillon d'autrui, dans son UL", () => {
        expect(canViewIncident(viewer({ roles: ['ADMIN'] }), subject({ status: 'DRAFT' }))).toBe(true);
    });

    it('refuse hors UL', () => {
        expect(canViewIncident(viewer(), subject({ vehicleUlId: OTHER_UL }))).toBe(false);
    });

    it("laisse l'auteur accéder à son rapport hors de son UL active", () => {
        // Un bénévole rattaché à plusieurs ULs ne doit pas perdre sa propre déclaration
        // en basculant d'UL — il en connaît déjà tout le contenu.
        expect(canViewIncident(viewer({ userId: 'user-2', ulId: OTHER_UL }), subject())).toBe(true);
    });

    it('refuse un compte inactif sur son propre rapport', () => {
        expect(canViewIncident(viewer({ userId: 'user-2', roles: ['CHVL', 'INACTIF'] }), subject())).toBe(false);
    });

    it('autorise SUPER_ADMIN hors UL', () => {
        expect(canViewIncident(viewer({ roles: ['SUPER_ADMIN'] }), subject({ vehicleUlId: OTHER_UL, status: 'DRAFT' }))).toBe(true);
    });
});

describe('canRevealIncidentAuthor', () => {
    it("masque l'auteur d'un rapport d'autrui", () => {
        expect(canRevealIncidentAuthor(viewer(), subject())).toBe(false);
    });

    it('révèle son propre nom', () => {
        expect(canRevealIncidentAuthor(viewer({ userId: 'user-2' }), subject())).toBe(true);
    });

    it("révèle l'auteur aux administrateurs", () => {
        expect(canRevealIncidentAuthor(viewer({ roles: ['ADMIN'] }), subject())).toBe(true);
        expect(canRevealIncidentAuthor(viewer({ roles: ['SUPER_ADMIN'] }), subject())).toBe(true);
    });

    it("ne révèle rien à un PRESIDENT (lecteur, pas administrateur)", () => {
        expect(canRevealIncidentAuthor(viewer({ roles: ['PRESIDENT'] }), subject())).toBe(false);
    });

    it('refuse un administrateur inactif', () => {
        expect(canRevealIncidentAuthor(viewer({ roles: ['ADMIN', 'INACTIF'] }), subject())).toBe(false);
    });
});
