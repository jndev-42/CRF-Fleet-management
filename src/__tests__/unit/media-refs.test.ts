// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
    buildMediaFileKey,
    buildMediaFolderRef,
    datedSegment,
    displayNameOfKey,
    extensionOfMimeType,
    fileNameWithMimeExtension,
    toMediaUlSegment,
    folderRefOfKey,
    isAcceptableMediaRef,
    isMediaType,
    isR2Ref,
    isTripStage,
    mimeTypeOfKey,
    parisTimestamp,
    parseMediaFolderRef,
    randomSuffix,
    readableSegment,
    sanitizeFileName,
    sanitizeName,
    uuid8,
    validateMediaKey,
} from '@/lib/media/refs';

// 08/11/2026 14:30:00 à Paris (UTC+1 en novembre).
const NOV = new Date('2026-11-08T13:30:00.000Z');

describe('isR2Ref / isMediaType / isTripStage', () => {
    it('une référence R2 contient /, un id Drive jamais', () => {
        expect(isR2Ref('trip-photos/paris-18/x')).toBe(true);
        expect(isR2Ref('1AbCdEfGhIj')).toBe(false);
        expect(isR2Ref('mock-folder-1')).toBe(false);
        expect(isR2Ref(null)).toBe(false);
        expect(isR2Ref(undefined)).toBe(false);
    });

    it('types et étapes connus', () => {
        expect(isMediaType('trip-photos')).toBe(true);
        expect(isMediaType('mission-report-photo')).toBe(true);
        expect(isMediaType('ndf')).toBe(false);
        expect(isTripStage('emprunt')).toBe(true);
        expect(isTripStage('rendu')).toBe(true);
        expect(isTripStage('incident')).toBe(false);
    });
});

describe('sanitizeName', () => {
    it('retire les accents, passe en minuscules, garde [a-z0-9-]', () => {
        expect(sanitizeName('VSAV 1')).toBe('vsav-1');
        expect(sanitizeName('Poste de secours — Fête de la Musique !')).toBe('poste-de-secours-fete-de-la-musique');
        expect(sanitizeName('  --Éloïse__O\'Brien-- ')).toBe('eloise-o-brien');
    });

    it('60 caractères au plus, sans tiret final', () => {
        const out = sanitizeName(`${'a'.repeat(59)} b`);
        expect(out.length).toBeLessThanOrEqual(60);
        expect(out.endsWith('-')).toBe(false);
    });

    it('repli sans-nom', () => {
        expect(sanitizeName('')).toBe('sans-nom');
        expect(sanitizeName('!!!')).toBe('sans-nom');
        expect(sanitizeName(null)).toBe('sans-nom');
    });
});

describe('horodatage et segment lisible', () => {
    it('parisTimestamp : AAAAMMJJ-HHmmss en heure de Paris (hiver et été)', () => {
        expect(parisTimestamp(NOV)).toBe('20261108-143000');
        expect(parisTimestamp(new Date('2026-07-01T08:05:09Z'))).toBe('20260701-100509');
    });

    it('readableSegment : nom-horodatage-4 hex (exemple de la spec)', () => {
        expect(readableSegment('VSAV 1', NOV, 'a1b2')).toBe('vsav-1-20261108-143000-a1b2');
        expect(readableSegment('VSAV 1', NOV)).toMatch(/^vsav-1-20261108-143000-[0-9a-f]{4}$/);
    });

    it('datedSegment : sans suffixe aléatoire', () => {
        expect(datedSegment('Jean Dupont', NOV)).toBe('jean-dupont-20261108-143000');
    });

    it('randomSuffix / uuid8 : hexadécimal de la bonne longueur', () => {
        expect(randomSuffix()).toMatch(/^[0-9a-f]{4}$/);
        expect(uuid8()).toMatch(/^[0-9a-f]{8}$/);
    });
});

describe('buildMediaFolderRef / buildMediaFileKey', () => {
    const ref = 'trip-photos/paris-18/vsav-1-20261108-143000-a1b2';

    it('préfixe {type}/{UL}/{dossier}', () => {
        expect(buildMediaFolderRef('trip-photos', 'paris-18', 'vsav-1-20261108-143000-a1b2')).toBe(ref);
        expect(() => buildMediaFolderRef('ndf' as never, 'paris-18', 'x')).toThrow();
        expect(() => buildMediaFolderRef('trip-photos', '../x', 'x')).toThrow();
        expect(() => buildMediaFolderRef('trip-photos', 'paris-18', 'a/b')).toThrow();
    });

    it('trajet : sous emprunt/ ou rendu/, nom {uuid8}-{nom assaini}', () => {
        expect(buildMediaFileKey(ref, 'IMG 0001.JPG', { stage: 'emprunt', id: '0a1b2c3d' }))
            .toBe(`${ref}/emprunt/0a1b2c3d-img-0001.jpg`);
        expect(buildMediaFileKey(ref, 'photo.png', { stage: 'rendu' })).toMatch(new RegExp(`^${ref}/rendu/[0-9a-f]{8}-photo\\.png$`));
        expect(() => buildMediaFileKey(ref, 'photo.png')).toThrow();
    });

    it('autres types : à plat, sans étape', () => {
        const inc = 'incident-photos/paris-18/vsav-1-20261108-143000-a1b2';
        expect(buildMediaFileKey(inc, 'dégât.jpeg', { id: '0a1b2c3d' })).toBe(`${inc}/0a1b2c3d-degat.jpeg`);
        expect(() => buildMediaFileKey(inc, 'x.jpg', { stage: 'emprunt' })).toThrow();
        expect(() => buildMediaFileKey('pas/un/prefixe-valide/x', 'x.jpg')).toThrow();
    });

    it('sanitizeFileName : extension conservée en minuscules', () => {
        expect(sanitizeFileName('Rapport Signé.PDF')).toBe('rapport-signe.pdf');
        expect(sanitizeFileName('sans extension')).toBe('sans-extension');
    });
});

describe('validateMediaKey / folderRefOfKey / parseMediaFolderRef', () => {
    const ref = 'trip-photos/paris-18/vsav-1-20261108-143000-a1b2';

    it('accepte les formes attendues', () => {
        expect(validateMediaKey(`${ref}/emprunt/0a1b2c3d-x.jpg`)).toEqual({
            type: 'trip-photos', folderRef: ref, stage: 'emprunt', fileName: '0a1b2c3d-x.jpg',
        });
        expect(validateMediaKey('mission-report-photo/paris-18/dps-20261108-143000-a1b2/0a1b2c3d-rapport.pdf')?.type)
            .toBe('mission-report-photo');
        expect(folderRefOfKey(`${ref}/rendu/0a1b2c3d-x.jpg`)).toBe(ref);
    });

    it('clé forgée : `..`, type inconnu, forme inattendue → null', () => {
        expect(validateMediaKey('../x')).toBeNull();
        expect(validateMediaKey(`${ref}/emprunt/../../x.jpg`)).toBeNull();
        expect(validateMediaKey('ndf/paris-18/x/note-de-frais.pdf')).toBeNull();
        expect(validateMediaKey('referentiels/x/y/z.pdf')).toBeNull();
        expect(validateMediaKey(`${ref}/autre/0a1b2c3d-x.jpg`)).toBeNull();
        expect(validateMediaKey(`${ref}/0a1b2c3d-x.jpg`)).toBeNull();
        expect(validateMediaKey('incident-photos/paris-18/x/sous/0a1b2c3d-x.jpg')).toBeNull();
        expect(validateMediaKey('/trip-photos/a/b/emprunt/x.jpg')).toBeNull();
        expect(validateMediaKey('trip-photos//b/emprunt/x.jpg')).toBeNull();
        expect(validateMediaKey(42)).toBeNull();
        expect(folderRefOfKey('../x')).toBeNull();
    });

    it('parseMediaFolderRef : 3 segments exactement, type connu', () => {
        expect(parseMediaFolderRef(ref)).toEqual({ type: 'trip-photos', ulSegment: 'paris-18', folder: 'vsav-1-20261108-143000-a1b2' });
        expect(parseMediaFolderRef(`${ref}/emprunt`)).toBeNull();
        expect(parseMediaFolderRef('trip-photos/paris-18')).toBeNull();
        expect(parseMediaFolderRef('autre/paris-18/x')).toBeNull();
        expect(parseMediaFolderRef('trip-photos/../x')).toBeNull();
    });
});

describe('isAcceptableMediaRef', () => {
    it('id Drive accepté (transition), référence R2 seulement du bon type', () => {
        expect(isAcceptableMediaRef('1AbCdrive', 'trip-photos')).toBe(true);
        expect(isAcceptableMediaRef('trip-photos/paris-18/x', 'trip-photos')).toBe(true);
        expect(isAcceptableMediaRef('incident-photos/paris-18/x', 'trip-photos')).toBe(false);
        expect(isAcceptableMediaRef('trip-photos/paris-18/x/emprunt', 'trip-photos')).toBe(false);
        expect(isAcceptableMediaRef('mission-report-photo/paris-18/x/0a1b2c3d-r.pdf', 'mission-report-photo', 'file')).toBe(true);
        expect(isAcceptableMediaRef('mission-report-photo/paris-18/x', 'mission-report-photo', 'file')).toBe(false);
    });
});

describe('fileNameWithMimeExtension / toMediaUlSegment', () => {
    it('extension repliée sur le type MIME si absente ou inconnue', () => {
        expect(fileNameWithMimeExtension('photo', 'image/png')).toBe('photo.png');
        expect(fileNameWithMimeExtension('scan.bin', 'application/pdf')).toBe('scan.bin.pdf');
        expect(fileNameWithMimeExtension('a.JPG', 'image/png')).toBe('a.JPG');
        expect(fileNameWithMimeExtension('x', 'application/zip')).toBe('x');
    });

    it('segment UL : caractères initiaux non sûrs retirés', () => {
        expect(toMediaUlSegment('-paris-18')).toBe('paris-18');
        expect(toMediaUlSegment('..x')).toBe('x');
        expect(toMediaUlSegment('paris-18')).toBe('paris-18');
        expect(toMediaUlSegment('---')).toBe('_');
        expect(() => buildMediaFolderRef('trip-photos', toMediaUlSegment('-x'), 'v-20261108-143000-a1b2')).not.toThrow();
    });
});

describe('affichage et types MIME', () => {
    it('displayNameOfKey retire le préfixe uuid8', () => {
        expect(displayNameOfKey('a/b/c/0a1b2c3d-photo.jpg')).toBe('photo.jpg');
    });

    it('mimeTypeOfKey / extensionOfMimeType', () => {
        expect(mimeTypeOfKey('x/y.JPG')).toBe('image/jpeg');
        expect(mimeTypeOfKey('x/y.pdf')).toBe('application/pdf');
        expect(mimeTypeOfKey('x/y.exe')).toBe('application/octet-stream');
        expect(extensionOfMimeType('image/png')).toBe('png');
        expect(extensionOfMimeType('application/zip')).toBeNull();
        expect(extensionOfMimeType(null)).toBeNull();
    });
});
