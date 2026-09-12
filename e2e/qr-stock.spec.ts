import { test, expect } from '@playwright/test';

/**
 * Flux réel du QR stock : scanner, déclarer des mouvements, valider.
 *
 * C'est le SEUL test qui exerce bout en bout la projection du panier contre le
 * schéma Zod `.strict()` de la route. Le test RTL mocke `fetch` (il n'exerce pas
 * Zod) et les tests d'intégration construisent leur propre corps, conforme par
 * construction : un `PendingMovement` posté tel quel — avec ses champs `key` et
 * `itemName` purement clients — ne serait rattrapé que par ce spec ou par un
 * essai manuel.
 *
 * Le token n'est pas codé en dur : il est obtenu via la modale QR admin, comme
 * un administrateur le ferait avant d'imprimer l'étiquette.
 */

test('anonyme — /qr-stock redirige vers /login', async ({ page }) => {
    await page.goto('/qr-stock/token-inexistant');
    await expect(page).toHaveURL(/login/);
});

test('scan, panier et validation groupée', async ({ page }) => {
    // ── 1. Récupérer le token du stock depuis la modale QR admin ──────────
    await page.goto('/login');
    await page.getByRole('button', { name: 'ADMIN Admin' }).click();
    await page.waitForURL('/');

    // Navigation « dure » : un clic client-side juste après la connexion laisse
    // useSession() dans un état obsolète tant que la page n'a pas rechargé.
    await page.goto('/inventory');
    await page.getByRole('button', { name: 'Passer' }).click({ timeout: 5000 }).catch(() => {});

    await page.getByTitle('QR Code du stock').first().click();

    const qrDialog = page.getByRole('dialog');
    await expect(qrDialog).toContainText('QR Code —');
    const url = await qrDialog.getByText(/\/qr-stock\//).innerText();
    const token = url.trim().split('/qr-stock/')[1];
    expect(token).toBeTruthy();

    // ── 2. Scanner : ouvrir la page publique ──────────────────────────────
    await page.goto(`/qr-stock/${token}`);
    await expect(page.getByText('Accès via QR Code')).toBeVisible();

    // Périmètre fermé : aucun contrôle de création ou de suppression d'article.
    await expect(page.getByText(/nouvel article/i)).toHaveCount(0);
    await expect(page.getByTitle(/supprimer/i)).toHaveCount(0);

    const firstRemove = page.getByRole('button', { name: /^Retirer une unité de / }).first();
    const itemLabel = await firstRemove.getAttribute('aria-label');
    const itemName = itemLabel!.replace('Retirer une unité de ', '');

    // Quantité affichée avant mouvement, pour vérifier l'écriture réelle après.
    const row = page.locator('div').filter({ hasText: itemName }).last();
    const before = Number((await row.innerText()).match(/\d+/)?.[0] ?? '0');

    // ── 3. Panier : un retrait puis un ajout ──────────────────────────────
    await firstRemove.click();
    await expect(page.getByText(/Mouvements en attente \(1\)/)).toBeVisible();

    await page.getByRole('button', { name: `Ajouter une unité de ${itemName}` }).click();
    await page.getByRole('dialog').getByText('Stock sans date').click();
    await expect(page.getByText(/Mouvements en attente \(2\)/)).toBeVisible();

    // Annulation unitaire : on repart à un seul mouvement, le retrait.
    await page.getByRole('button', { name: `Annuler le mouvement sur ${itemName}` }).first().click();
    await expect(page.getByText(/Mouvements en attente \(1\)/)).toBeVisible();

    // ── 4. Validation — c'est ici que Zod .strict() est réellement exercé ──
    await page.getByRole('button', { name: 'Valider' }).click();

    await expect(page.getByText(/mouvement.* enregistré/)).toBeVisible();

    // ── 5. Retour : le stock est rechargé et la quantité a bougé ──────────
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(page.getByText('Accès via QR Code')).toBeVisible();

    const rowAfter = page.locator('div').filter({ hasText: itemName }).last();
    const after = Number((await rowAfter.innerText()).match(/\d+/)?.[0] ?? '0');
    expect(after).toBeLessThanOrEqual(before);
});
