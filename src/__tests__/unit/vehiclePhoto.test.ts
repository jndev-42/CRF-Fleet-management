import { describe, it, expect } from 'vitest';
import {
    MAX_PHOTO_SIZE,
    hasAcceptedPhotoSignature,
    omitVehicleR2Keys,
    vehiclePhotoUrl,
} from '@/lib/vehiclePhoto';
import { buildVehiclePhotoKey } from '@/lib/r2';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe('MAX_PHOTO_SIZE', () => {
    it('vaut 4 Mo', () => {
        expect(MAX_PHOTO_SIZE).toBe(4 * 1024 * 1024);
    });
});

describe('hasAcceptedPhotoSignature', () => {
    it('accepte JPEG, PNG et WebP', () => {
        expect(hasAcceptedPhotoSignature(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
        expect(hasAcceptedPhotoSignature(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
        expect(hasAcceptedPhotoSignature(ascii('RIFF\0\0\0\0WEBPVP8 '))).toBe(true);
    });

    it('refuse PDF, SVG, HEIC, un RIFF non WebP et un contenu vide', () => {
        expect(hasAcceptedPhotoSignature(ascii('%PDF-1.7'))).toBe(false);
        expect(hasAcceptedPhotoSignature(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(false);
        expect(hasAcceptedPhotoSignature(ascii('\0\0\0\u0018ftypheic'))).toBe(false);
        expect(hasAcceptedPhotoSignature(ascii('RIFF\0\0\0\0WAVEfmt '))).toBe(false);
        expect(hasAcceptedPhotoSignature(bytes())).toBe(false);
    });

    it('refuse une signature tronquée', () => {
        expect(hasAcceptedPhotoSignature(bytes(0xff, 0xd8))).toBe(false);
        expect(hasAcceptedPhotoSignature(ascii('RIFF'))).toBe(false);
    });
});

describe('vehiclePhotoUrl', () => {
    it('suffixe la date de dépôt, encodée', () => {
        expect(vehiclePhotoUrl('/api/qr/t/photo', '2026-11-06T10:00:00.000Z'))
            .toBe('/api/qr/t/photo?v=2026-11-06T10%3A00%3A00.000Z');
    });

    it('renvoie null sans photo', () => {
        expect(vehiclePhotoUrl('/api/qr/t/photo', null)).toBeNull();
        expect(vehiclePhotoUrl('/api/qr/t/photo', undefined)).toBeNull();
    });
});

describe('omitVehicleR2Keys', () => {
    it('retire les deux clés sans toucher au reste ni à la ligne source', () => {
        const row = {
            id: 'v1',
            name: 'VL1',
            photoR2Key: 'vehicle-photos/v1/a.jpg',
            photoUpdatedAt: 'x',
            guideR2Key: 'vehicle-guides/v1/a.pdf',
            guideFileName: 'guide.pdf',
        };
        expect(omitVehicleR2Keys(row)).toEqual({ id: 'v1', name: 'VL1', photoUpdatedAt: 'x', guideFileName: 'guide.pdf' });
        expect(row.photoR2Key).toBe('vehicle-photos/v1/a.jpg');
        expect(row.guideR2Key).toBe('vehicle-guides/v1/a.pdf');
    });
});

describe('buildVehiclePhotoKey', () => {
    it('construit une clé versionnée sous vehicle-photos/<UL>/<nom du véhicule>/', () => {
        expect(buildVehiclePhotoKey('paris-18', 'VPSP 182', 'ab12cd34')).toBe('vehicle-photos/paris-18/vpsp-182/ab12cd34.jpg');
    });

    it('neutralise les caractères de chemin', () => {
        expect(buildVehiclePhotoKey('paris-18', '../x', 'a/b')).toBe('vehicle-photos/paris-18/x/ab.jpg');
    });

    it('exige un segment UL', () => {
        expect(() => buildVehiclePhotoKey('', 'VPSP 182', 'a')).toThrow();
    });
});
