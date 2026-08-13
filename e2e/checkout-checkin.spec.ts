import { test, expect } from '@playwright/test';

// Flux réel : prise en charge (check-out) puis rendu (check-in) d'un véhicule.
// On part d'un véhicule disponible repéré dynamiquement dans la liste plutôt
// que codé en dur, pour résister à la dérive des fixtures de la DB de dev.

test('check-out puis check-in d\'un véhicule disponible', async ({ page }) => {
  await page.goto('/login');
  // Le compte dev CHVL a des "papiers" expirés dans les fixtures de la DB
  // de dev (bloque l'emprunt) — Admin est explicitement exempté de ce
  // contrôle (cf. VehicleDetailHeader.tsx: licenseBlocked && !isAdmin).
  await page.getByRole('button', { name: 'ADMIN Admin' }).click();
  await page.waitForURL('/');

  // Navigation "dure" (page.goto) plutôt qu'un clic sur le lien de nav : un
  // clic client-side juste après la connexion (form action serveur) laisse
  // useSession() dans un état obsolète tant que la page n'a pas rechargé.
  await page.goto('/vehicles');

  // Le guide d'onboarding ("Bienvenue !") peut apparaître pour un compte dev
  // fraîchement connecté et intercepte les clics — on le ferme s'il est là.
  await page.getByRole('button', { name: 'Passer' }).click({ timeout: 5000 }).catch(() => {});

  await page.getByRole('button', { name: '🟢 Disponibles' }).click();
  await page.locator('a.vehicle-card').first().click();
  await page.waitForURL(/\/vehicles\/.+/);

  // ── Check-out ──────────────────────────────────────────────────────────
  // Le bouton d'en-tête (aria-label="Prendre le véhicule {nom}", sans emoji)
  // et le bouton de soumission de la modale (texte "🚗 Prendre le véhicule",
  // sans aria-label) ont des noms accessibles différents — pas d'ambiguïté
  // ici tant que la modale n'est pas ouverte.
  await page.getByRole('button', { name: 'Prendre le véhicule' }).click();
  const checkoutDialog = page.getByRole('dialog');
  await expect(checkoutDialog.locator('.modal-title')).toContainText('Prendre');

  // Le nom du chauffeur est rempli automatiquement depuis la session Google —
  // on attend qu'il soit peuplé avant de soumettre (champ requis en lecture seule).
  await expect(page.getByLabel('Votre nom')).not.toHaveValue('', { timeout: 10000 });

  // Checklist personnalisée (configurée par véhicule/UL, cf. ChecklistItems.tsx) :
  // les items marqués "required" bloquent la soumission via l'attribut HTML natif.
  // On coche tout ce qui est requis, quel que soit le contenu réel de la checklist.
  for (const box of await checkoutDialog.locator('input[type="checkbox"][required]').all()) {
    if (!(await box.isChecked())) await box.check();
  }

  await checkoutDialog.getByRole('button', { name: '🚗 Prendre le véhicule', exact: true }).click();
  await expect(checkoutDialog).toBeHidden({ timeout: 10000 });

  // ── Vérifie le passage en IN_USE ──────────────────────────────────────
  await expect(page.getByRole('button', { name: '✅ Rendre le véhicule', exact: true })).toBeVisible({ timeout: 10000 });

  // ── Check-in ───────────────────────────────────────────────────────────
  await page.getByRole('button', { name: '✅ Rendre le véhicule', exact: true }).click();
  const checkinDialog = page.getByRole('dialog');
  await expect(checkinDialog.locator('.modal-title')).toContainText('Rendre');

  for (const box of await checkinDialog.locator('input[type="checkbox"][required]').all()) {
    if (!(await box.isChecked())) await box.check();
  }

  await checkinDialog.getByRole('button', { name: '✅ Rendre le véhicule', exact: true }).click();

  // ── Vérifie le retour à AVAILABLE ─────────────────────────────────────
  // Nom accessible du bouton d'en-tête = aria-label "Prendre le véhicule {nom}" (sans emoji).
  await expect(page.getByRole('button', { name: 'Prendre le véhicule' })).toBeVisible({ timeout: 10000 });
});
