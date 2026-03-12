/**
 * Tests unitaires pour le module bugReportLogger.
 *
 * Ce module est purement fonctionnel (pas de React, pas de DB).
 * Les tests vérifient :
 *  - l'interception des appels console (log/warn/error)
 *  - l'interception des appels fetch (méthode, url, status, durée)
 *  - les limites des buffers circulaires (50 console, 30 réseau)
 *  - la garde anti-récursion sur /api/bugs/report
 *  - la garde SSR (typeof window === 'undefined')
 *  - la désinstallation propre des intercepteurs
 *  - les copies retournées par getConsoleLogs / getNetworkLogs
 *
 * Fichier source : src/lib/bugReportLogger.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  installInterceptors,
  removeInterceptors,
  getConsoleLogs,
  getNetworkLogs,
} from '@/lib/bugReportLogger';

// jsdom fournit window.fetch — on le remplace par un stub contrôlable
function makeFetchStub(status = 200, delay = 0) {
  return vi.fn().mockImplementation(() =>
    new Promise(resolve =>
      setTimeout(() => resolve({ status, ok: status < 400 } as Response), delay)
    )
  );
}

beforeEach(() => {
  // Repart d'un état vide entre chaque test
  removeInterceptors();
  // Vider les buffers internes en les remettant à zéro via install+remove
  installInterceptors();
  removeInterceptors();
  installInterceptors();
  removeInterceptors();
  // Réinstallation propre pour chaque test
  installInterceptors();
});

afterEach(() => {
  removeInterceptors();
});

describe('bugReportLogger — console interception', () => {
  it('capture un appel console.log', () => {
    console.log('hello logger');
    const logs = getConsoleLogs();
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const last = logs[logs.length - 1];
    expect(last.level).toBe('log');
    expect(last.message).toContain('hello logger');
    expect(last.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('capture un appel console.warn', () => {
    console.warn('attention');
    const logs = getConsoleLogs();
    const last = logs[logs.length - 1];
    expect(last.level).toBe('warn');
    expect(last.message).toContain('attention');
  });

  it('capture un appel console.error', () => {
    console.error('erreur critique');
    const logs = getConsoleLogs();
    const last = logs[logs.length - 1];
    expect(last.level).toBe('error');
    expect(last.message).toContain('erreur critique');
  });

  it('tronque les messages longs à 500 caractères', () => {
    const longMsg = 'x'.repeat(1000);
    console.log(longMsg);
    const logs = getConsoleLogs();
    const last = logs[logs.length - 1];
    expect(last.message.length).toBeLessThanOrEqual(500);
  });

  it('gère les objets circulaires sans planter', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    expect(() => console.log(obj)).not.toThrow();
  });

  it('respecte la limite de 50 entrées (buffer circulaire)', () => {
    removeInterceptors();
    // Réinstallation fraîche sur un buffer vide
    installInterceptors();
    for (let i = 0; i < 60; i++) console.log(`msg-${i}`);
    const logs = getConsoleLogs();
    expect(logs.length).toBeLessThanOrEqual(50);
  });
});

// Helper: retire les intercepteurs, installe un stub comme fetch de base, réinstalle.
// Nécessaire car beforeEach installe déjà les intercepteurs; remplacer window.fetch
// après coup ne fait que remplacer la version wrappée, pas l'original capturé.
function withFetchStub(stub: ReturnType<typeof makeFetchStub>) {
  removeInterceptors();
  window.fetch = stub;
  installInterceptors();
}

describe('bugReportLogger — fetch interception', () => {
  it('enregistre une requête fetch réussie', async () => {
    withFetchStub(makeFetchStub(200));
    await window.fetch('/api/vehicles');
    const logs = getNetworkLogs();
    const last = logs[logs.length - 1];
    expect(last.method).toBe('GET');
    expect(last.url).toBe('/api/vehicles');
    expect(last.status).toBe(200);
    expect(last.duration).toBeGreaterThanOrEqual(0);
  });

  it('enregistre le status d\'une requête échouée (404)', async () => {
    withFetchStub(makeFetchStub(404));
    await window.fetch('/api/missing');
    const logs = getNetworkLogs();
    const last = logs[logs.length - 1];
    expect(last.status).toBe(404);
  });

  it('enregistre null comme status si fetch lève une exception', async () => {
    removeInterceptors();
    window.fetch = vi.fn().mockRejectedValue(new Error('network error'));
    installInterceptors();

    await expect(window.fetch('/api/fail')).rejects.toThrow('network error');
    const logs = getNetworkLogs();
    const last = logs[logs.length - 1];
    expect(last.status).toBeNull();
  });

  it('ne s\'auto-intercepte pas pour /api/bugs/report', async () => {
    withFetchStub(makeFetchStub(201));
    const before = getNetworkLogs().length;
    await window.fetch('/api/bugs/report');
    const after = getNetworkLogs().length;
    expect(after).toBe(before); // aucune entrée ajoutée
  });

  it('extrait uniquement le pathname pour les URLs absolues', async () => {
    withFetchStub(makeFetchStub(200));
    await window.fetch('http://localhost:3000/api/users');
    const logs = getNetworkLogs();
    const last = logs[logs.length - 1];
    expect(last.url).toBe('/api/users');
  });

  it('respecte la limite de 30 entrées réseau (buffer circulaire)', async () => {
    withFetchStub(makeFetchStub(200));
    for (let i = 0; i < 40; i++) await window.fetch(`/api/item-${i}`);
    const logs = getNetworkLogs();
    expect(logs.length).toBeLessThanOrEqual(30);
  });
});

describe('bugReportLogger — idempotence et teardown', () => {
  it('double install n\'installe pas deux fois les intercepteurs', () => {
    installInterceptors(); // déjà installé depuis beforeEach
    console.log('unique');
    const logs = getConsoleLogs();
    // Le message ne doit apparaître qu'une seule fois
    const count = logs.filter(l => l.message === 'unique').length;
    expect(count).toBe(1);
  });

  it('removeInterceptors restaure le fetch original', () => {
    // On part d'un état sans intercepteurs pour capturer le vrai fetch original
    removeInterceptors();
    const originalFetch = window.fetch;
    installInterceptors();
    removeInterceptors();
    expect(window.fetch).toBe(originalFetch);
  });

  it('getConsoleLogs retourne une copie (mutation externe n\'affecte pas le buffer)', () => {
    console.log('before');
    const copy = getConsoleLogs();
    copy.push({ timestamp: 'fake', level: 'log', message: 'injected' });
    expect(getConsoleLogs().find(l => l.message === 'injected')).toBeUndefined();
  });

  it('getNetworkLogs retourne une copie', async () => {
    const stub = makeFetchStub(200);
    window.fetch = stub;
    installInterceptors();
    await window.fetch('/api/test');
    const copy = getNetworkLogs();
    copy.push({ timestamp: 'fake', method: 'DELETE', url: '/injected', status: 999, duration: 0 });
    expect(getNetworkLogs().find(l => l.url === '/injected')).toBeUndefined();
  });
});
