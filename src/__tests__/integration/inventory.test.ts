/**
 * Tests d'intégration — module inventaire médical (nouveau système)
 *
 * Cas couverts :
 *  GET /api/inventory
 *   1. 401 sans session
 *   2. Retourne KPIs + stock + groupes
 *
 *  GET /api/inventory/items
 *   3. 401 sans session
 *   4. Retourne le catalogue InvItem
 *
 *  POST /api/inventory/items
 *   5. 401 sans session
 *   6. 403 pour GUEST
 *   7. 400 Zod — ni itemId ni name
 *   8. 409 si stock déjà existant (locationId + itemId)
 *   9. Happy path — item créé via nom + stock persisté en DB
 *  10. Réutilise un InvItem existant (même nom, insensible à la casse)
 *
 *  PATCH /api/inventory/items/[id]
 *  11. 401 sans session
 *  12. 404 stock inexistant
 *  13. Happy path — mise à jour quantité + vérification DB
 *
 *  DELETE /api/inventory/items/[id]
 *  14. 403 non-ADMIN
 *  15. Happy path ADMIN — supprime stock + orphan InvItem
 *
 *  POST /api/inventory/sacs
 *  16. 401 sans session
 *  17. 400 si parent n'est pas VEHICLE ou PHARMA_TAMPON
 *  18. Happy path — sac créé sous un lieu VEHICLE
 *
 *  POST /api/inventory/transfer (item)
 *  19. 401 sans session
 *  20. 404 stock source non trouvé
 *  21. 400 quantité insuffisante
 *  22. Happy path — décrémente source, incrémente destination
 *  23. Source supprimée si quantité tombe à 0
 *
 *  POST /api/inventory/transfer (sac)
 *  24. Happy path — déplace sac vers un autre parent
 *
 *  GET /api/inventory/vehicle/[vehicleId]
 *  25. 401 sans session
 *  26. Retourne sacs + stock direct pour le véhicule
 *
 *  GET /api/inventory/bag-templates
 *  27. 401 sans session
 *  28. Liste vide puis remplie
 *
 *  POST /api/inventory/bag-templates
 *  29. 403 non-ADMIN
 *  30. 400 Zod — nom manquant
 *  31. Happy path — modèle créé avec entries
 *
 *  GET /api/inventory/bag-templates/[id]
 *  32. Retourne le modèle + entries (avec itemName, unit)
 *
 *  PUT /api/inventory/bag-templates/[id]
 *  33. Mise à jour nom + entries
 *
 *  DELETE /api/inventory/bag-templates/[id]
 *  34. Cascade sur items
 *
 *  POST /api/inventory/sacs avec templateId
 *  35. Happy path — sac créé avec templateId
 *
 *  PATCH /api/inventory/sacs/[id] avec templateId
 *  36. 403 non-ADMIN pour modifier templateId
 *  37. Happy path ADMIN — templateId mis à jour
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { db } = await import('./setup');
  return { db };
});
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/drive', () => ({ deleteDriveFolder: vi.fn() }));
vi.mock('@/lib/onesignal', () => ({ sendPushNotification: vi.fn() }));

import { GET } from '@/app/api/inventory/route';
import { GET as GET_ITEMS, POST as POST_ITEM } from '@/app/api/inventory/items/route';
import { PATCH as PATCH_ITEM, DELETE as DELETE_ITEM } from '@/app/api/inventory/items/[id]/route';
import { POST as POST_SAC } from '@/app/api/inventory/sacs/route';
import { PATCH as PATCH_SAC } from '@/app/api/inventory/sacs/[id]/route';
import { POST as POST_TRANSFER } from '@/app/api/inventory/transfer/route';
import { GET as GET_VEHICLE } from '@/app/api/inventory/vehicle/[vehicleId]/route';
import { GET as GET_BAG_TEMPLATES, POST as POST_BAG_TEMPLATE } from '@/app/api/inventory/bag-templates/route';
import { GET as GET_BAG_TEMPLATE, PUT as PUT_BAG_TEMPLATE, DELETE as DELETE_BAG_TEMPLATE } from '@/app/api/inventory/bag-templates/[id]/route';
import { auth } from '@/auth';
import { db, seedVehicle, seedInvItem, seedInvLocation, seedInvStock, seedBagTemplate, seedBagTemplateItem } from './setup';

const mockedAuth = vi.mocked(auth);

function makeRequest(url: string, method: string, body?: Record<string, unknown>): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── GET /api/inventory ────────────────────────────────────────────────────────

describe('GET /api/inventory', () => {
  it('1. retourne 401 sans session', async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await GET(makeRequest('http://localhost/api/inventory', 'GET'));
    expect(res.status).toBe(401);
  });

  it('2. retourne KPIs + stock + groupes pour une session valide', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'chvl@test.com', roles: ['CHVL'] } } as never);
    await seedInvLocation({ id: 'loc-central', type: 'STOCK_CENTRAL', name: 'Stock Central' });
    await seedInvItem({ id: 'item-a', name: 'Pansement test' });
    await seedInvStock({ id: 'stock-a', locationId: 'loc-central', itemId: 'item-a', quantity: 3 });

    const res = await GET(makeRequest('http://localhost/api/inventory', 'GET'));
    expect(res.status).toBe(200);

    const data = await res.json() as { kpis: unknown; stock: unknown[]; groupes: unknown[] };
    expect(data.kpis).toBeDefined();
    expect(Array.isArray(data.stock)).toBe(true);
    expect(Array.isArray(data.groupes)).toBe(true);
  });
});

// ── GET /api/inventory/items ──────────────────────────────────────────────────

describe('GET /api/inventory/items', () => {
  it('3. retourne 401 sans session', async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await GET_ITEMS();
    expect(res.status).toBe(401);
  });

  it('4. retourne le catalogue InvItem', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'chvl@test.com', roles: ['CHVL'] } } as never);
    await seedInvItem({ id: 'cat-item-1', name: 'Gants nitrile catalogue' });

    const res = await GET_ITEMS();
    expect(res.status).toBe(200);
    const data = await res.json() as { items: Array<{ id: string }> };
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.some(i => i.id === 'cat-item-1')).toBe(true);
  });
});

// ── POST /api/inventory/items ─────────────────────────────────────────────────

describe('POST /api/inventory/items', () => {
  it('5. retourne 401 sans session', async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await POST_ITEM(makeRequest('http://localhost/api/inventory/items', 'POST', {
      name: 'Test',
      locationId: 'loc-1',
    }));
    expect(res.status).toBe(401);
  });

  it('6. retourne 403 pour GUEST', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'guest@test.com', roles: ['GUEST'] } } as never);
    const res = await POST_ITEM(makeRequest('http://localhost/api/inventory/items', 'POST', {
      name: 'Test',
      locationId: 'loc-1',
    }));
    expect(res.status).toBe(403);
  });

  it('7. retourne 400 Zod si ni itemId ni name fourni', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
    const res = await POST_ITEM(makeRequest('http://localhost/api/inventory/items', 'POST', {
      locationId: 'loc-central',
    }));
    expect(res.status).toBe(400);
  });

  it('8. retourne 409 si stock déjà existant pour cet emplacement + article', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
    await seedInvLocation({ id: 'loc-central', type: 'STOCK_CENTRAL', name: 'Stock Central' });
    await seedInvItem({ id: 'dup-item', name: 'Article dupliqué' });
    await seedInvStock({ id: 'dup-stock', locationId: 'loc-central', itemId: 'dup-item', quantity: 1 });

    const res = await POST_ITEM(makeRequest('http://localhost/api/inventory/items', 'POST', {
      itemId: 'dup-item',
      locationId: 'loc-central',
      quantity: 2,
    }));
    expect(res.status).toBe(409);
  });

  it('9. crée un nouvel InvItem + InvStock et les persiste en DB', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
    await seedInvLocation({ id: 'loc-pharma', type: 'PHARMA_TAMPON', name: 'Pharmacie Tampon' });

    const res = await POST_ITEM(makeRequest('http://localhost/api/inventory/items', 'POST', {
      name: 'Masque O2 test',
      category: 'Oxygénothérapie',
      unit: 'unité',
      locationId: 'loc-pharma',
      quantity: 3,
    }));
    expect(res.status).toBe(201);

    const body = await res.json() as { itemId: string; quantity: number; itemName: string };
    expect(body.itemName).toBe('Masque O2 test');
    expect(body.quantity).toBe(3);

    // Vérifie InvItem en DB
    const itemRow = await db.execute({ sql: `SELECT * FROM "InvItem" WHERE id = ?`, args: [body.itemId] });
    expect(itemRow.rows.length).toBe(1);
    expect(itemRow.rows[0].name).toBe('Masque O2 test');
  });

  it('10. réutilise un InvItem existant (nom insensible à la casse)', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
    await seedInvLocation({ id: 'loc-pharma', type: 'PHARMA_TAMPON', name: 'Pharmacie Tampon' });
    await seedInvLocation({ id: 'loc-sac', type: 'SAC', name: 'Sac test', parentId: 'loc-pharma' });
    await seedInvItem({ id: 'existing-item', name: 'Couverture de survie' });

    // Crée stock avec nom en casse différente
    const res = await POST_ITEM(makeRequest('http://localhost/api/inventory/items', 'POST', {
      name: 'COUVERTURE DE SURVIE',
      locationId: 'loc-sac',
      quantity: 1,
    }));
    expect(res.status).toBe(201);

    const body = await res.json() as { itemId: string };
    expect(body.itemId).toBe('existing-item');

    // Vérifie qu'aucun doublon n'a été créé dans InvItem
    const count = await db.execute({
      sql: `SELECT COUNT(*) as n FROM "InvItem" WHERE lower(name) = 'couverture de survie'`,
      args: [],
    });
    expect(Number(count.rows[0].n)).toBe(1);
  });
});

// ── PATCH /api/inventory/items/[id] ──────────────────────────────────────────

describe('PATCH /api/inventory/items/[id]', () => {
  it('11. retourne 401 sans session', async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await PATCH_ITEM(
      makeRequest('http://localhost/api/inventory/items/stock-1', 'PATCH', { quantity: 5 }),
      { params: Promise.resolve({ id: 'stock-1' }) }
    );
    expect(res.status).toBe(401);
  });

  it('12. retourne 404 si stock inexistant', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
    const res = await PATCH_ITEM(
      makeRequest('http://localhost/api/inventory/items/nonexistent', 'PATCH', { quantity: 5 }),
      { params: Promise.resolve({ id: 'nonexistent' }) }
    );
    expect(res.status).toBe(404);
  });

  it('13. met à jour la quantité et vérifie en DB', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
    await seedInvLocation({ id: 'loc-central', type: 'STOCK_CENTRAL', name: 'Stock Central' });
    await seedInvItem({ id: 'patch-item', name: 'Article PATCH' });
    await seedInvStock({ id: 'patch-stock', locationId: 'loc-central', itemId: 'patch-item', quantity: 5 });

    const res = await PATCH_ITEM(
      makeRequest('http://localhost/api/inventory/items/patch-stock', 'PATCH', { quantity: 10 }),
      { params: Promise.resolve({ id: 'patch-stock' }) }
    );
    expect(res.status).toBe(200);

    const row = await db.execute({ sql: `SELECT quantity FROM "InvStock" WHERE id = ?`, args: ['patch-stock'] });
    expect(Number(row.rows[0].quantity)).toBe(10);
  });
});

// ── DELETE /api/inventory/items/[id] ─────────────────────────────────────────

describe('DELETE /api/inventory/items/[id]', () => {
  it('14. retourne 403 pour non-ADMIN', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
    const res = await DELETE_ITEM(
      makeRequest('http://localhost/api/inventory/items/any', 'DELETE'),
      { params: Promise.resolve({ id: 'any' }) }
    );
    expect(res.status).toBe(403);
  });

  it('15. ADMIN supprime InvStock + orphan InvItem', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
    await seedInvLocation({ id: 'loc-central', type: 'STOCK_CENTRAL', name: 'Stock Central' });
    await seedInvItem({ id: 'del-item', name: 'Article à supprimer' });
    await seedInvStock({ id: 'del-stock', locationId: 'loc-central', itemId: 'del-item', quantity: 1 });

    const res = await DELETE_ITEM(
      makeRequest('http://localhost/api/inventory/items/del-stock', 'DELETE'),
      { params: Promise.resolve({ id: 'del-stock' }) }
    );
    expect(res.status).toBe(200);

    // Stock supprimé
    const stockRow = await db.execute({ sql: `SELECT * FROM "InvStock" WHERE id = ?`, args: ['del-stock'] });
    expect(stockRow.rows.length).toBe(0);

    // InvItem orphelin supprimé
    const itemRow = await db.execute({ sql: `SELECT * FROM "InvItem" WHERE id = ?`, args: ['del-item'] });
    expect(itemRow.rows.length).toBe(0);
  });
});

// ── POST /api/inventory/sacs ──────────────────────────────────────────────────

describe('POST /api/inventory/sacs', () => {
  it('16. retourne 401 sans session', async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await POST_SAC(makeRequest('http://localhost/api/inventory/sacs', 'POST', {
      name: 'Sac test',
      parentLocationId: 'loc-veh',
    }));
    expect(res.status).toBe(401);
  });

  it('17. retourne 400 si parent n\'est pas VEHICLE ou PHARMA_TAMPON', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
    await seedInvLocation({ id: 'loc-central', type: 'STOCK_CENTRAL', name: 'Stock Central' });

    const res = await POST_SAC(makeRequest('http://localhost/api/inventory/sacs', 'POST', {
      name: 'Sac invalide',
      parentLocationId: 'loc-central',
    }));
    expect(res.status).toBe(400);
  });

  it('18. crée un sac sous un lieu VEHICLE', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
    const vehicle = await seedVehicle({ id: 'veh-sac-test', name: 'VL Sac Test' });
    await seedInvLocation({ id: 'loc-veh-sac', type: 'VEHICLE', name: 'VL Sac Test', vehicleId: vehicle.id });

    const res = await POST_SAC(makeRequest('http://localhost/api/inventory/sacs', 'POST', {
      name: 'Sac PSE1 test',
      parentLocationId: 'loc-veh-sac',
      isSealed: true,
    }));
    expect(res.status).toBe(201);

    const body = await res.json() as { type: string; vehicleId: string; isSealed: boolean };
    expect(body.type).toBe('SAC');
    expect(body.vehicleId).toBe(vehicle.id);
    expect(body.isSealed).toBe(true);
  });
});

// ── POST /api/inventory/transfer (item) ──────────────────────────────────────

describe('POST /api/inventory/transfer (item)', () => {
  it('19. retourne 401 sans session', async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await POST_TRANSFER(makeRequest('http://localhost/api/inventory/transfer', 'POST', {
      transferType: 'item',
      itemId: 'item-x',
      fromLocationId: 'loc-a',
      toLocationId: 'loc-b',
      qty: 1,
    }));
    expect(res.status).toBe(401);
  });

  it('20. retourne 404 si stock source non trouvé', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
    await seedInvLocation({ id: 'loc-a', type: 'PHARMA_TAMPON', name: 'Pharmacie Tampon' });
    await seedInvLocation({ id: 'loc-b', type: 'STOCK_CENTRAL', name: 'Stock Central' });

    const res = await POST_TRANSFER(makeRequest('http://localhost/api/inventory/transfer', 'POST', {
      transferType: 'item',
      itemId: 'nonexistent-item',
      fromLocationId: 'loc-a',
      toLocationId: 'loc-b',
      qty: 1,
    }));
    expect(res.status).toBe(404);
  });

  it('21. retourne 400 si quantité insuffisante', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
    await seedInvLocation({ id: 'loc-pharma', type: 'PHARMA_TAMPON', name: 'Pharmacie Tampon' });
    await seedInvLocation({ id: 'loc-veh-t', type: 'VEHICLE', name: 'VL Test Transfer' });
    await seedInvItem({ id: 'transfer-item', name: 'Article transfert test' });
    await seedInvStock({ id: 'transfer-stock', locationId: 'loc-pharma', itemId: 'transfer-item', quantity: 2 });

    const res = await POST_TRANSFER(makeRequest('http://localhost/api/inventory/transfer', 'POST', {
      transferType: 'item',
      itemId: 'transfer-item',
      fromLocationId: 'loc-pharma',
      toLocationId: 'loc-veh-t',
      qty: 5,
    }));
    expect(res.status).toBe(400);
  });

  it('22. décrémente source et incrémente destination', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
    await seedInvLocation({ id: 'loc-pharma', type: 'PHARMA_TAMPON', name: 'Pharmacie Tampon' });
    await seedInvLocation({ id: 'loc-veh-dest', type: 'VEHICLE', name: 'VL Destination' });
    await seedInvItem({ id: 'item-trans', name: 'Article transfert' });
    await seedInvStock({ id: 'stock-src', locationId: 'loc-pharma', itemId: 'item-trans', quantity: 10 });

    const res = await POST_TRANSFER(makeRequest('http://localhost/api/inventory/transfer', 'POST', {
      transferType: 'item',
      itemId: 'item-trans',
      fromLocationId: 'loc-pharma',
      toLocationId: 'loc-veh-dest',
      qty: 4,
    }));
    expect(res.status).toBe(200);

    const srcRow = await db.execute({ sql: `SELECT quantity FROM "InvStock" WHERE id = ?`, args: ['stock-src'] });
    expect(Number(srcRow.rows[0].quantity)).toBe(6);

    const destRow = await db.execute({
      sql: `SELECT quantity FROM "InvStock" WHERE locationId = ? AND itemId = ?`,
      args: ['loc-veh-dest', 'item-trans'],
    });
    expect(Number(destRow.rows[0].quantity)).toBe(4);
  });

  it('23. supprime le stock source si quantité tombe à 0', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
    await seedInvLocation({ id: 'loc-pharma', type: 'PHARMA_TAMPON', name: 'Pharmacie Tampon' });
    await seedInvLocation({ id: 'loc-veh-zero', type: 'VEHICLE', name: 'VL Zero' });
    await seedInvItem({ id: 'item-zero', name: 'Article vers zéro' });
    await seedInvStock({ id: 'stock-zero', locationId: 'loc-pharma', itemId: 'item-zero', quantity: 3 });

    const res = await POST_TRANSFER(makeRequest('http://localhost/api/inventory/transfer', 'POST', {
      transferType: 'item',
      itemId: 'item-zero',
      fromLocationId: 'loc-pharma',
      toLocationId: 'loc-veh-zero',
      qty: 3,
    }));
    expect(res.status).toBe(200);

    const srcRow = await db.execute({ sql: `SELECT * FROM "InvStock" WHERE id = ?`, args: ['stock-zero'] });
    expect(srcRow.rows.length).toBe(0);
  });
});

// ── POST /api/inventory/transfer (sac) ───────────────────────────────────────

describe('POST /api/inventory/transfer (sac)', () => {
  it('24. déplace un sac entier vers un autre parent', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
    const veh = await seedVehicle({ id: 'veh-sac-move', name: 'VL Sac Move' });
    await seedInvLocation({ id: 'loc-veh-move', type: 'VEHICLE', name: 'VL Sac Move', vehicleId: veh.id });
    await seedInvLocation({ id: 'loc-pharma-sac', type: 'PHARMA_TAMPON', name: 'Pharmacie Tampon' });
    await seedInvLocation({
      id: 'loc-sac-move',
      type: 'SAC',
      name: 'Sac à déplacer',
      parentId: 'loc-pharma-sac',
      vehicleId: null,
    });

    const res = await POST_TRANSFER(makeRequest('http://localhost/api/inventory/transfer', 'POST', {
      transferType: 'sac',
      sacLocationId: 'loc-sac-move',
      toParentLocationId: 'loc-veh-move',
    }));
    expect(res.status).toBe(200);

    const row = await db.execute({ sql: `SELECT parentId, vehicleId FROM "InvLocation" WHERE id = ?`, args: ['loc-sac-move'] });
    expect(row.rows[0].parentId).toBe('loc-veh-move');
    expect(row.rows[0].vehicleId).toBe(veh.id);
  });
});

// ── GET /api/inventory/vehicle/[vehicleId] ────────────────────────────────────

describe('GET /api/inventory/vehicle/[vehicleId]', () => {
  it('25. retourne 401 sans session', async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await GET_VEHICLE(
      makeRequest('http://localhost/api/inventory/vehicle/VL001', 'GET'),
      { params: Promise.resolve({ vehicleId: 'VL001' }) }
    );
    expect(res.status).toBe(401);
  });

  it('26. retourne sacs + stock direct pour le véhicule', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'chvl@test.com', roles: ['CHVL'] } } as never);
    const veh = await seedVehicle({ id: 'veh-full', name: 'VL Full' });
    await seedInvLocation({ id: 'loc-veh-full', type: 'VEHICLE', name: 'VL Full', vehicleId: veh.id });
    await seedInvLocation({ id: 'loc-sac-full', type: 'SAC', name: 'Sac PSE1', parentId: 'loc-veh-full', vehicleId: veh.id });
    await seedInvItem({ id: 'item-full-veh', name: 'Trousse VL' });
    await seedInvItem({ id: 'item-full-sac', name: 'Gants nitrile sac' });
    await seedInvStock({ id: 'stock-direct', locationId: 'loc-veh-full', itemId: 'item-full-veh', quantity: 1 });
    await seedInvStock({ id: 'stock-sac', locationId: 'loc-sac-full', itemId: 'item-full-sac', quantity: 5 });

    const res = await GET_VEHICLE(
      makeRequest(`http://localhost/api/inventory/vehicle/${veh.id}`, 'GET'),
      { params: Promise.resolve({ vehicleId: veh.id }) }
    );
    expect(res.status).toBe(200);

    const data = await res.json() as { vehicleLocation: { id: string } | null; sacs: unknown[]; directStock: unknown[] };
    expect(data.vehicleLocation).not.toBeNull();
    expect(data.sacs.length).toBe(1);
    expect(data.directStock.length).toBe(1);
  });
});

// ── GET /api/inventory/bag-templates ─────────────────────────────────────────

describe('GET /api/inventory/bag-templates', () => {
  it('27. retourne 401 sans session', async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await GET_BAG_TEMPLATES();
    expect(res.status).toBe(401);
  });

  it('28. retourne liste vide puis remplie', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'chvl@test.com', roles: ['CHVL'] } } as never);

    // Liste vide
    let res = await GET_BAG_TEMPLATES();
    let data = await res.json() as { templates: unknown[] };
    expect(res.status).toBe(200);
    expect(data.templates.length).toBe(0);

    // Après seed
    await seedBagTemplate({ id: 'tpl-test', name: 'Modèle de test' });
    res = await GET_BAG_TEMPLATES();
    data = await res.json() as { templates: unknown[] };
    expect(data.templates.length).toBe(1);
  });
});

// ── POST /api/inventory/bag-templates ────────────────────────────────────────

describe('POST /api/inventory/bag-templates', () => {
  it('29. retourne 403 pour non-ADMIN', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
    const res = await POST_BAG_TEMPLATE(makeRequest('http://localhost/api/inventory/bag-templates', 'POST', {
      name: 'Modèle non autorisé',
    }));
    expect(res.status).toBe(403);
  });

  it('30. retourne 400 Zod si nom manquant', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
    const res = await POST_BAG_TEMPLATE(makeRequest('http://localhost/api/inventory/bag-templates', 'POST', {
      entries: [],
    }));
    expect(res.status).toBe(400);
  });

  it('31. crée un modèle avec entries', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
    await seedInvItem({ id: 'item-tpl-1', name: 'Couverture test' });
    await seedInvItem({ id: 'item-tpl-2', name: 'Gants test' });

    const res = await POST_BAG_TEMPLATE(makeRequest('http://localhost/api/inventory/bag-templates', 'POST', {
      name: 'PSE1 Intégration',
      entries: [
        { itemId: 'item-tpl-1', targetQty: 2 },
        { itemId: 'item-tpl-2', targetQty: 1 },
      ],
    }));
    expect(res.status).toBe(201);

    const body = await res.json() as { id: string; name: string; itemCount: number };
    expect(body.name).toBe('PSE1 Intégration');
    expect(body.itemCount).toBe(2);

    // Vérifie en DB
    const rows = await db.execute({ sql: `SELECT * FROM "InvBagTemplateItem" WHERE templateId = ?`, args: [body.id] });
    expect(rows.rows.length).toBe(2);
  });
});

// ── GET /api/inventory/bag-templates/[id] ─────────────────────────────────────

describe('GET /api/inventory/bag-templates/[id]', () => {
  it('32. retourne template + entries avec itemName et unit', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'chvl@test.com', roles: ['CHVL'] } } as never);
    await seedInvItem({ id: 'item-get-tpl', name: 'Masque O2 get test', unit: 'unité' });
    await seedBagTemplate({ id: 'tpl-get', name: 'Modèle GET' });
    await seedBagTemplateItem({ id: 'tpl-item-get', templateId: 'tpl-get', itemId: 'item-get-tpl', targetQty: 3 });

    const res = await GET_BAG_TEMPLATE(
      makeRequest('http://localhost/api/inventory/bag-templates/tpl-get', 'GET'),
      { params: Promise.resolve({ id: 'tpl-get' }) }
    );
    expect(res.status).toBe(200);

    const data = await res.json() as { name: string; entries: Array<{ itemId: string; targetQty: number; itemName: string }> };
    expect(data.name).toBe('Modèle GET');
    expect(data.entries.length).toBe(1);
    expect(data.entries[0].itemId).toBe('item-get-tpl');
    expect(data.entries[0].targetQty).toBe(3);
    expect(data.entries[0].itemName).toBe('Masque O2 get test');
  });
});

// ── PUT /api/inventory/bag-templates/[id] ─────────────────────────────────────

describe('PUT /api/inventory/bag-templates/[id]', () => {
  it('33. met à jour nom + entries et vérifie en DB', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
    await seedInvItem({ id: 'item-put-tpl-1', name: 'Pansement PUT' });
    await seedInvItem({ id: 'item-put-tpl-2', name: 'Collier PUT' });
    await seedBagTemplate({ id: 'tpl-put', name: 'Modèle PUT avant' });
    await seedBagTemplateItem({ id: 'old-entry', templateId: 'tpl-put', itemId: 'item-put-tpl-1', targetQty: 1 });

    const res = await PUT_BAG_TEMPLATE(
      makeRequest('http://localhost/api/inventory/bag-templates/tpl-put', 'PUT', {
        name: 'Modèle PUT après',
        entries: [
          { itemId: 'item-put-tpl-2', targetQty: 4 },
        ],
      }),
      { params: Promise.resolve({ id: 'tpl-put' }) }
    );
    expect(res.status).toBe(200);

    const body = await res.json() as { name: string; entries: Array<{ itemId: string }> };
    expect(body.name).toBe('Modèle PUT après');
    expect(body.entries.length).toBe(1);
    expect(body.entries[0].itemId).toBe('item-put-tpl-2');

    // Vérifie en DB — ancienne entry supprimée
    const old = await db.execute({ sql: `SELECT * FROM "InvBagTemplateItem" WHERE id = ?`, args: ['old-entry'] });
    expect(old.rows.length).toBe(0);
  });
});

// ── DELETE /api/inventory/bag-templates/[id] ──────────────────────────────────

describe('DELETE /api/inventory/bag-templates/[id]', () => {
  it('34. supprime modèle + cascade sur items', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
    await seedInvItem({ id: 'item-del-tpl', name: 'Article DELETE template' });
    await seedBagTemplate({ id: 'tpl-del', name: 'Modèle DELETE' });
    await seedBagTemplateItem({ id: 'entry-del', templateId: 'tpl-del', itemId: 'item-del-tpl', targetQty: 1 });

    const res = await DELETE_BAG_TEMPLATE(
      makeRequest('http://localhost/api/inventory/bag-templates/tpl-del', 'DELETE'),
      { params: Promise.resolve({ id: 'tpl-del' }) }
    );
    expect(res.status).toBe(200);

    const tplRow = await db.execute({ sql: `SELECT * FROM "InvBagTemplate" WHERE id = ?`, args: ['tpl-del'] });
    expect(tplRow.rows.length).toBe(0);

    const itemRow = await db.execute({ sql: `SELECT * FROM "InvBagTemplateItem" WHERE id = ?`, args: ['entry-del'] });
    expect(itemRow.rows.length).toBe(0);
  });
});

// ── POST /api/inventory/sacs avec templateId ──────────────────────────────────

describe('POST /api/inventory/sacs avec templateId', () => {
  it('35. crée un sac avec templateId', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
    const veh = await seedVehicle({ id: 'veh-tpl-sac', name: 'VL Template Sac' });
    await seedInvLocation({ id: 'loc-veh-tpl', type: 'VEHICLE', name: 'VL Template Sac', vehicleId: veh.id });
    await seedBagTemplate({ id: 'tpl-for-sac', name: 'Modèle pour sac' });

    const res = await POST_SAC(makeRequest('http://localhost/api/inventory/sacs', 'POST', {
      name: 'Sac avec modèle',
      parentLocationId: 'loc-veh-tpl',
      templateId: 'tpl-for-sac',
    }));
    expect(res.status).toBe(201);

    const body = await res.json() as { id: string; templateId: string | null };
    expect(body.templateId).toBe('tpl-for-sac');

    const row = await db.execute({ sql: `SELECT templateId FROM "InvLocation" WHERE id = ?`, args: [body.id] });
    expect(row.rows[0].templateId).toBe('tpl-for-sac');
  });
});

// ── PATCH /api/inventory/sacs/[id] avec templateId ────────────────────────────

describe('PATCH /api/inventory/sacs/[id] avec templateId', () => {
  it('36. retourne 403 pour non-ADMIN qui tente de modifier templateId', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'secouriste@test.com', roles: ['SECOURISTE'] } } as never);
    await seedInvLocation({ id: 'loc-pharma-patch', type: 'PHARMA_TAMPON', name: 'Pharmacie Tampon' });
    await seedInvLocation({ id: 'sac-patch-403', type: 'SAC', name: 'Sac PATCH 403', parentId: 'loc-pharma-patch' });

    const res = await PATCH_SAC(
      makeRequest('http://localhost/api/inventory/sacs/sac-patch-403', 'PATCH', {
        templateId: 'some-template',
      }),
      { params: Promise.resolve({ id: 'sac-patch-403' }) }
    );
    expect(res.status).toBe(403);
  });

  it('37. ADMIN met à jour templateId', async () => {
    mockedAuth.mockResolvedValue({ user: { email: 'admin@test.com', roles: ['ADMIN'] } } as never);
    await seedInvLocation({ id: 'loc-pharma-patch2', type: 'PHARMA_TAMPON', name: 'Pharmacie Tampon' });
    await seedInvLocation({ id: 'sac-patch-ok', type: 'SAC', name: 'Sac PATCH OK', parentId: 'loc-pharma-patch2' });
    await seedBagTemplate({ id: 'tpl-patch', name: 'Modèle PATCH' });

    const res = await PATCH_SAC(
      makeRequest('http://localhost/api/inventory/sacs/sac-patch-ok', 'PATCH', {
        templateId: 'tpl-patch',
      }),
      { params: Promise.resolve({ id: 'sac-patch-ok' }) }
    );
    expect(res.status).toBe(200);

    const row = await db.execute({ sql: `SELECT templateId FROM "InvLocation" WHERE id = ?`, args: ['sac-patch-ok'] });
    expect(row.rows[0].templateId).toBe('tpl-patch');
  });
});
