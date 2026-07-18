import { test, expect } from '@playwright/test';

test('GDPR and Mentions Légales workflow', async ({ page }) => {
  // 1. Aller sur la page de connexion
  await page.goto('/login');

  // 2. Vérifier que la note d'acceptation RGPD est présente
  const gdprNote = page.locator('text=En vous connectant sur cette application, vous acceptez que la croix-rouge');
  await expect(gdprNote).toBeVisible();

  // 3. Cliquer sur le lien "mentions légales" de la note
  await page.locator('main').locator('text=mentions légales').click();
  await page.waitForURL(url => url.pathname === '/mentions-legales');

  // 4. Vérifier que la page affiche bien le titre "Mentions Légales"
  const pageTitle = page.locator('h1.page-title');
  await expect(pageTitle).toBeVisible();
  await expect(pageTitle).toContainText('Mentions Légales');

  // 5. Vérifier que les informations obligatoires sont présentes
  await expect(page.getByRole('heading', { name: 'Éditeur du site' })).toBeVisible();
  await expect(page.locator('text=Responsable de l’application')).toBeVisible();
  await expect(page.locator('text=Jean-Noël Durand').first()).toBeVisible();
  await expect(page.locator('text=jeannoel.durand@croix-rouge.fr').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hébergement du site' })).toBeVisible();
  await expect(page.getByText('Vercel', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hébergement de la base de données' })).toBeVisible();
  await expect(page.getByText('Turso', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Politique de confidentialité (RGPD)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pourquoi collectons-nous vos données ?' })).toBeVisible();

  // 6. Cliquer sur le bouton retour et vérifier qu'on revient sur la page de connexion (non authentifié)
  await page.getByRole('link', { name: 'Retour à l’accueil' }).click();
  await page.waitForURL(url => url.pathname === '/login');

  // 7. Se connecter (Admin)
  await page.click('button:has-text("Admin")');
  await page.waitForURL(url => url.pathname === '/');

  // 8. Vérifier que le footer contient le lien "Mentions Légales"
  const footerLink = page.locator('footer').locator('text=Mentions Légales');
  await expect(footerLink).toBeVisible();

  // 9. Cliquer sur le lien du footer et s'assurer que la navigation fonctionne pour un utilisateur connecté
  await footerLink.click();
  await page.waitForURL(url => url.pathname === '/mentions-legales');
  await expect(page.locator('h1.page-title')).toContainText('Mentions Légales');
});
