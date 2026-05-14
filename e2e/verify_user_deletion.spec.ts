import { test, expect } from '@playwright/test';

test('User deletion', async ({ page }) => {
  await page.goto('/');

  // Login
  await page.click('button:has-text("Admin")');
  await page.waitForURL('**/');

  // Go to Users page
  await page.click('a[href="/users"]');
  await page.waitForURL('**/users');

  // Check if test user exists (seeded by setup-dev.ts)
  const testUserEmail = 'chvl@dev.local';
  const userRow = page.locator(`tr:has-text("${testUserEmail}")`);
  await expect(userRow).toBeVisible();

  // Click delete icon (the second button in the last cell, or by class/title if available)
  // Our UsersTab has: <button onClick={() => setDeletingUser(user)} className="text-red-600 hover:text-red-900" title="Supprimer l'utilisateur">
  const deleteButton = userRow.locator('button[title="Supprimer l\'utilisateur"]');
  await deleteButton.click();

  // Modal should be visible
  await expect(page.locator('text=Confirmer la suppression')).toBeVisible();

  // Click Confirm
  await page.click('button:has-text("Supprimer")');

  // Modal should close and user should be gone
  await expect(page.locator('text=Confirmer la suppression')).not.toBeVisible();
  await expect(userRow).not.toBeVisible();

  // Screenshot for verification
  await page.screenshot({ path: 'screenshots/user_deleted.png' });
});
