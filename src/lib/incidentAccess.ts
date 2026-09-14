/**
 * Règles d'accès en LECTURE aux rapports d'incident.
 *
 * Pourquoi un module dédié plutôt que des conditions recopiées dans chaque route :
 * trois routes distinctes (liste par véhicule, détail, PDF) doivent appliquer
 * exactement la même frontière. Une divergence entre elles ouvrirait une porte
 * dérobée — le PDF a longtemps été plus permissif que le détail. Les prédicats sont
 * purs et couverts par `src/__tests__/unit/incidentAccess.test.ts`.
 *
 * Les autorisations d'ÉCRITURE (PATCH / DELETE) ne passent pas par ici : elles
 * restent réservées à l'auteur et aux administrateurs, et n'ont pas été élargies.
 */
import { isAdminOrAbove, isSuperAdmin, isQrBlocked } from './roles';

export interface IncidentViewer {
    /** Identifiant de l'appelant ; absent sur certaines sessions historiques. */
    userId?: string | null;
    /** UL active de la session (`session.user.ulId`). */
    ulId?: string | null;
    roles: string[];
}

export interface IncidentSubject {
    /** `IncidentReport.userId` — le déclarant. */
    authorId: string;
    /** `Vehicle.ulId` du véhicule concerné. */
    vehicleUlId: string | null;
    /** `IncidentReport.status` */
    status: string;
}

/**
 * Compte bloqué.
 *
 * `isQrBlocked` et non `isInactive` : l'élargissement vise « tous les utilisateurs
 * d'une UL », y compris un bénévole encore sans rôle attribué. `isInactive` refuse
 * une liste de rôles vide, ce qui exclurait ce cas ; `isQrBlocked` ne refuse que le
 * portage d'INACTIF (ou de sa valeur héritée GUEST), qui est la seule exclusion voulue.
 */
export function isIncidentViewerBlocked(roles: string[]): boolean {
    return isQrBlocked(roles);
}

/**
 * L'appelant est-il dans le périmètre UL du véhicule ?
 *
 * SUPER_ADMIN passe outre (accès inter-UL). Une UL absente des deux côtés ne vaut
 * pas correspondance : `null === null` serait vrai en JS, or deux véhicules non
 * rattachés ne constituent pas une UL commune.
 */
export function isWithinUlScope(viewer: IncidentViewer, vehicleUlId: string | null): boolean {
    if (isSuperAdmin(viewer.roles)) return true;
    return Boolean(viewer.ulId) && Boolean(vehicleUlId) && viewer.ulId === vehicleUlId;
}

/** L'appelant est-il le déclarant du rapport ? */
export function isIncidentAuthor(viewer: IncidentViewer, subject: IncidentSubject): boolean {
    return Boolean(viewer.userId) && viewer.userId === subject.authorId;
}

/**
 * Lecture autorisée d'un rapport.
 *
 * Dans son UL : tout rapport SOUMIS, plus ses propres brouillons. Un brouillon
 * d'autrui reste privé — il n'est ni relu ni validé, l'exposer reviendrait à
 * diffuser une déclaration inachevée.
 */
export function canViewIncident(viewer: IncidentViewer, subject: IncidentSubject): boolean {
    if (isIncidentViewerBlocked(viewer.roles)) return false;
    // L'auteur passe AVANT le cloisonnement : sa déclaration lui reste accessible même
    // si son UL active a changé depuis. Lui refuser un contenu qu'il a lui-même rédigé
    // ne protège personne, et un bénévole rattaché à plusieurs ULs perdrait son
    // historique en basculant d'UL.
    if (isIncidentAuthor(viewer, subject)) return true;
    if (!isWithinUlScope(viewer, subject.vehicleUlId)) return false;
    if (isAdminOrAbove(viewer.roles)) return true;
    return subject.status === 'SUBMITTED';
}

/**
 * L'identité du déclarant peut-elle être révélée ?
 *
 * Non par défaut : c'est le cœur de l'anonymisation. Seuls l'auteur lui-même et les
 * administrateurs la voient. Le dépouillement se fait à la SOURCE (champs absents de
 * la réponse JSON), jamais à l'affichage — un masquage côté client resterait lisible
 * dans l'onglet réseau.
 */
export function canRevealIncidentAuthor(viewer: IncidentViewer, subject: IncidentSubject): boolean {
    if (isIncidentViewerBlocked(viewer.roles)) return false;
    return isIncidentAuthor(viewer, subject) || isAdminOrAbove(viewer.roles);
}
