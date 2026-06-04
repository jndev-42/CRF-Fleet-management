import { test, expect } from '@playwright/test';

test('Incident report flow', async ({ page }) => {
  // Login
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'admin@dev.local');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL('http://localhost:3000/vehicles');

  // Go to vehicle detail
  await page.click('text=VL186');
  await expect(page).toHaveURL(/\/vehicles\/.+/);

  // Open incident modal
  await page.click('text=Déclarer un incident');
  await expect(page.locator('.modal-title')).toContainText('Déclarer un incident');
  await page.screenshot({ path: '/home/jules/verification/incident_step1.png' });

  // Prompt -> Guidelines
  await page.click('text=Oui, voir les consignes');
  await expect(page.locator('.modal-title')).toContainText('Consignes incident');

  // Guidelines -> Type Selection
  await page.click('text=Déclarer l\'incident');
  await expect(page.locator('.modal-title')).toContainText('Type d\'incident');
  await page.screenshot({ path: '/home/jules/verification/incident_types.png' });

  // Select Accident
  await page.click('text=Accident / Incident de circulation');
  await expect(page.locator('.modal-title')).toContainText('Accident / Incident');

  // Fill Form
  await page.fill('input[placeholder="Arrondissement, type de voie..."]', 'Paris 18e, Rue Damrémont');

  // Click on SVG zone
  await page.click('path[id="front"]');

  await page.fill('textarea[placeholder="Précisez les dégâts visibles..."]', 'Pare-choc avant rayé');
  await page.fill('textarea[placeholder="Comment auriez-vous pu éviter cet incident ?"]', 'En faisant plus attention lors des manoeuvres');

  await page.screenshot({ path: '/home/jules/verification/incident_form.png' });

  // Submit Form -> Summary
  await page.click('button:has-text("Suivant")');
  await expect(page.locator('.modal-title')).toContainText('Récapitulatif');
  await page.screenshot({ path: '/home/jules/verification/incident_summary.png' });
});
