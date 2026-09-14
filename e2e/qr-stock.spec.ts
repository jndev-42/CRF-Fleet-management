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

    // On part de la LIGNE, pas du bouton : la quantité lue doit être celle de
    // l'article effectivement manipulé. Et on vise une quantité NON NULLE — le
    // « − » d'un article à zéro est désactivé, et le plancher à 0 rendrait de
    // toute façon le retrait non observable, donc le test ne prouverait rien.
    const rows = page.locator('[data-testid^="item-"]');
    await expect(rows.first()).toBeVisible();

    let row = null;
    let before = 0;
    for (let i = 0; i < await rows.count(); i++) {
        const candidate = rows.nth(i);
        const quantity = Number(await candidate.locator('[data-testid^="qty-"]').innerText());
        if (quantity > 0) {
            row = candidate;
            before = quantity;
            break;
        }
    }
    expect(row, 'aucun article en stock dans la DB de dev — test non concluant').not.toBeNull();
    expect(before).toBeGreaterThan(0);

    const testId = await row!.locator('[data-testid^="qty-"]').getAttribute('data-testid');
    const firstRemove = row!.getByRole('button', { name: /^Retirer une unité de / });
    const itemName = (await firstRemove.getAttribute('aria-label'))!.replace('Retirer une unité de ', '');

    // ── 3. Panier : un retrait puis un ajout ──────────────────────────────
    await firstRemove.click();
    await expect(page.getByText(/Mouvements en attente \(1\)/)).toBeVisible();

    await page.getByRole('button', { name: `Ajouter une unité de ${itemName}` }).click();
    await page.getByRole('dialog').getByText('Stock sans date').click();
    await expect(page.getByText(/Mouvements en attente \(2\)/)).toBeVisible();

    // Annulation unitaire : on annule l'AJOUT pour ne garder que le retrait.
    // Cibler le libellé exact, et non `.first()` : les deux mouvements portent
    // sur le même article, et `.first()` annulait le retrait en laissant l'ajout
    // — la validation remontait alors le stock au lieu de le baisser.
    await page.getByRole('button', { name: `Annuler l'ajout de 1 sur ${itemName} — sans date` }).click();
    await expect(page.getByText(/Mouvements en attente \(1\)/)).toBeVisible();

    // ── 4. Validation — c'est ici que Zod .strict() est réellement exercé ──
    await page.getByRole('button', { name: 'Valider' }).click();

    await expect(page.getByText(/mouvement.* enregistré/)).toBeVisible();

    // ── 5. Retour : le stock est rechargé et la quantité a RÉELLEMENT baissé ──
    await page.getByRole('button', { name: 'Retour' }).click();
    await expect(page.getByText('Accès via QR Code')).toBeVisible();

    // Assertion EXACTE, et non `toBeLessThanOrEqual` : un seul mouvement a été
    // validé (`-1`, le second ayant été annulé plus haut). Accepter l'égalité
    // laisserait passer le cas où la route répond 200 sans rien persister, ou
    // celui où le rechargement sert une réponse en cache — c'est-à-dire une
    // assertion vraie quel que soit le code (RK-16).
    const after = Number(await page.getByTestId(testId!).innerText());
    expect(after).toBe(before - 1);
});
