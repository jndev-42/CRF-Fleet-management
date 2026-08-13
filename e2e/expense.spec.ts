import { test, expect } from '@playwright/test';

// Flux réel de création d'une note de frais (brouillon, sans justificatif).

test('créer une note de frais en brouillon', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'CHVL' }).click();
  await page.waitForURL('/');

  // Navigation "dure" (page.goto) plutôt qu'un clic sur le lien de nav : un
  // clic client-side juste après la connexion (form action serveur) laisse
  // useSession() dans un état obsolète tant que la page n'a pas rechargé.
  await page.goto('/expenses');

  // Le guide d'onboarding ("Bienvenue !") peut apparaître pour un compte dev
  // fraîchement connecté et intercepte les clics — on le ferme s'il est là.
  await page.getByRole('button', { name: 'Passer' }).click({ timeout: 5000 }).catch(() => {});

  await page.getByRole('button', { name: 'Nouvelle note de frais' }).click();

  const description = `Test e2e ${Date.now()}`;
  await page.getByPlaceholder('Description (ex: Essence, Billet de train...)').fill(description);
  await page.getByPlaceholder('0.00').fill('12.50');

  // Désactive "Demande de remboursement" pour éviter d'avoir à fournir un
  // justificatif ou cocher la déclaration sur l'honneur — pas de nom
  // accessible exposé sur ce switch, on cible donc sa classe.
  await page.locator('label.switch').click();

  await page.getByRole('button', { name: 'Enregistrer Brouillon' }).click();

  // Le panneau de création se referme après succès (onSuccess ramène isCreating à false).
  await expect(page.getByRole('button', { name: 'Nouvelle note de frais' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(description)).toBeVisible({ timeout: 10000 });
});
