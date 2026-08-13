import { test, expect } from '@playwright/test';

// Flux réel de réservation d'un véhicule (ReservationBlock).

test('créer une réservation sur un véhicule', async ({ page }) => {
  await page.goto('/login');
  // Le compte dev CHVL a des "papiers" expirés dans les fixtures de la DB
  // de dev (bloque réservation/emprunt) — Admin est explicitement exempté
  // de ce contrôle (cf. VehicleDetailHeader.tsx / ReservationBlock.tsx).
  await page.getByRole('button', { name: 'ADMIN Admin' }).click();
  await page.waitForURL('/');

  // Navigation "dure" (page.goto) plutôt qu'un clic sur le lien de nav : un
  // clic client-side juste après la connexion (form action serveur) laisse
  // useSession() dans un état obsolète tant que la page n'a pas rechargé.
  await page.goto('/vehicles');

  // Le guide d'onboarding ("Bienvenue !") peut apparaître pour un compte dev
  // fraîchement connecté et intercepte les clics — on le ferme s'il est là.
  await page.getByRole('button', { name: 'Passer' }).click({ timeout: 5000 }).catch(() => {});

  await page.locator('a.vehicle-card').first().click();
  await page.waitForURL(/\/vehicles\/.+/);

  await page.getByRole('button', { name: '+ Réserver' }).click();
  const dialog = page.locator('.modal-content');
  await expect(dialog).toContainText('Réserver ce véhicule');

  const reason = `Test e2e ${Date.now()}`;
  await dialog.getByPlaceholder('Ex: Réserve pour une maraude').fill(reason);

  // Des réservations récurrentes des fixtures de la DB de dev peuvent occuper
  // un créneau donné sur une plage de dates étendue — un seul essai fixe
  // n'est pas fiable. On retente avec un décalage de jour différent en cas
  // de conflit ("Ce créneau chevauche...", 409), plutôt que de coder en dur
  // une date supposée libre.
  const dateInputs = dialog.locator('input[type="date"]');
  const timeInputs = dialog.locator('input[type="time"]');
  let created = false;
  for (let attempt = 0; attempt < 6 && !created; attempt++) {
    let conflict = false;
    page.once('dialog', d => {
      conflict = /chevauche/i.test(d.message());
      d.accept();
    });

    const future = new Date();
    future.setDate(future.getDate() + 300 + attempt * 37);
    const dateStr = future.toISOString().slice(0, 10);

    await dateInputs.nth(0).fill(dateStr);
    await timeInputs.nth(0).fill('02:15');
    await dateInputs.nth(1).fill(dateStr);
    await timeInputs.nth(1).fill('02:45');

    await dialog.getByRole('button', { name: /Soumettre la demande|Valider/ }).click();

    if (conflict) continue;
    created = await dialog.waitFor({ state: 'hidden', timeout: 5000 }).then(() => true).catch(() => false);
  }

  expect(created).toBe(true);
  await expect(page.getByText(reason)).toBeVisible({ timeout: 10000 });
});
