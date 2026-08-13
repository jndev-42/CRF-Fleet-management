import { test, expect } from '@playwright/test';

// Vérifications basiques de garde d'authentification — regroupées ici pour
// libérer checkout-checkin.spec.ts pour le vrai flux qu'il est censé tester.

test('page d\'accueil — redirige vers /login si non authentifié', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/login/);
});

test('page stats — redirige vers /login si non authentifié', async ({ page }) => {
  await page.goto('/stats');
  await expect(page).toHaveURL(/login/);
});
