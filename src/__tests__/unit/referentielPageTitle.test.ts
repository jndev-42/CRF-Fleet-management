import { describe, it, expect } from 'vitest';
import { applyFicheNames, normalizeFicheCode, pageTitle, splitPageHeader } from '@/lib/referentiel/pageTitle';
import { splitHighlight } from '@/lib/referentiel/highlight';

describe('pageTitle', () => {
    it('extrait le titre de fiche et retire « DUOS / Pole santé »', () => {
        expect(pageTitle(['Urgences vitales / Perte de connaissance / IV.B.5 DUOS / Pole santé', '2', 'BILAN']))
            .toBe('Urgences vitales / Perte de connaissance / IV.B.5');
    });

    it('gère l\'ancien bandeau « Version … DUS / Mai 2014 »', () => {
        expect(pageTitle(['Conduite à tenir / Affections circonstancielles / IV-E-13 Version 1.1.1 DUS / Mai 2014 ¢ p.6', 'x']))
            .toBe('Conduite à tenir / Affections circonstancielles / IV-E-13');
    });

    it('retire l\'en-tête « FORMATION AUX PREMIERS SECOURS… /N » sans en faire un titre', () => {
        const lines = ['FORMATION AUX PREMIERS SECOURS – GUIDE PRATIQUE – JANVIER 2022 /2', 'SOMMAIRE', 'I / Principes généraux'];
        expect(pageTitle(lines)).toBe('');
        expect(splitPageHeader(lines).bodyLines).toEqual(['SOMMAIRE', 'I / Principes généraux']);
    });

    it('ne prend pas une première ligne ordinaire pour un titre', () => {
        const lines = ['GLOSSAIRE', 'AVANT PROPOS'];
        expect(splitPageHeader(lines)).toEqual({ title: '', bodyLines: lines });
    });

    it('sépare l\'en-tête du corps', () => {
        expect(splitPageHeader(['Urgences vitales / Hémorragie / IV.B.1 DUOS / Pole santé', '1', 'texte']).bodyLines)
            .toEqual(['1', 'texte']);
    });

    it('retire tout bandeau d\'émetteur (« DABE / Pole santé »)', () => {
        expect(pageTitle(['Conduite à tenir / Affections traumatiques / IV.D.2 DABE / Pole santé', '5']))
            .toBe('Conduite à tenir / Affections traumatiques / IV.D.2');
    });

    it('lit le nom de fiche dans le cartouche d\'une page de couverture', () => {
        const lines = ['CONDUITE A TENIR', 'DÉFINITION', 'texte', 'Hémorragie externe', 'Urgences vitales Fiche IV – B - 2', 'VERSION 2.3.1'];
        const split = splitPageHeader(lines);
        expect(split.title).toBe('Hémorragie externe — Urgences vitales · IV.B.2');
        expect(split.bodyLines).toEqual(lines);
    });

    it('recolle un nom de fiche écrit sur deux lignes', () => {
        expect(pageTitle(['CONDUITE A TENIR', 'Arrêt cardiaque de l\'enfant', 'et du nourrisson', 'Urgences vitales Fiche IV – B – 7']))
            .toBe('Arrêt cardiaque de l\'enfant et du nourrisson — Urgences vitales · IV.B.7');
    });

    it('ne prend pas l\'en-tête « FORMATION… » pour le nom d\'une fiche', () => {
        const lines = [
            'FORMATION AUX PREMIERS SECOURS – GUIDE PRATIQUE – JANVIER 2022 /44',
            'Urgences vitales Fiche IV – B - 2',
            'texte',
        ];
        expect(splitPageHeader(lines)).toEqual({ title: '', bodyLines: ['Urgences vitales Fiche IV – B - 2', 'texte'] });
    });

    it('lit encore une couverture sous l\'en-tête « FORMATION… »', () => {
        const lines = [
            'FORMATION AUX PREMIERS SECOURS – GUIDE PRATIQUE – JANVIER 2022 /44',
            'Hémorragie externe',
            'Urgences vitales Fiche IV – B - 2',
        ];
        expect(pageTitle(lines)).toBe('Hémorragie externe — Urgences vitales · IV.B.2');
    });

    it('gère une page vide', () => {
        expect(splitPageHeader([])).toEqual({ title: '', bodyLines: [] });
        expect(splitPageHeader(['  ', ''])).toEqual({ title: '', bodyLines: [] });
    });
});

describe('normalizeFicheCode', () => {
    it('ramène toutes les graphies au format « IV.B.2 »', () => {
        expect(normalizeFicheCode('IV – B - 2')).toBe('IV.B.2');
        expect(normalizeFicheCode('IV-E-13')).toBe('IV.E.13');
        expect(normalizeFicheCode('IV.B.5')).toBe('IV.B.5');
    });
});

describe('applyFicheNames', () => {
    it('donne aux pages de suite le titre de leur couverture', () => {
        expect(applyFicheNames([
            { page: 111, title: 'Hémorragie externe — Urgences vitales · IV.B.2' },
            { page: 112, title: 'Conduite à tenir / Urgences vitales / IV.B.2' },
            { page: 300, title: 'Conduite à tenir / Affections circonstancielles / IV-E-13' },
            { page: 1, title: '' },
        ])).toEqual([{ page: 112, title: 'Hémorragie externe — Urgences vitales · IV.B.2' }]);
    });

    it('rapproche les codes écrits différemment', () => {
        expect(applyFicheNames([
            { page: 290, title: 'Fumées — Affections circonstancielles · IV.E.13' },
            { page: 295, title: 'Conduite à tenir / Affections circonstancielles / IV-E-13' },
        ])).toEqual([{ page: 295, title: 'Fumées — Affections circonstancielles · IV.E.13' }]);
    });
});

describe('splitHighlight', () => {
    it('découpe sur les marqueurs de surlignage', () => {
        expect(splitHighlight('avant \u0002mot\u0003 après')).toEqual([
            { text: 'avant ', mark: false },
            { text: 'mot', mark: true },
            { text: ' après', mark: false },
        ]);
    });

    it('rend un texte sans marqueur tel quel', () => {
        expect(splitHighlight('<b>pas du html</b>')).toEqual([{ text: '<b>pas du html</b>', mark: false }]);
    });

    it('tolère un marqueur ouvrant sans fermant', () => {
        expect(splitHighlight('a \u0002b')).toEqual([{ text: 'a ', mark: false }, { text: 'b', mark: false }]);
    });

    it('renvoie une liste vide pour une chaîne vide', () => {
        expect(splitHighlight('')).toEqual([]);
    });
});
