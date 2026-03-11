import { test, expect } from '@playwright/test';

test('checkout and checkin flow — redirects to login when unauthenticated', async ({ page }) => {
  await page.goto('/');
  // If not logged in, should redirect to /login
  await expect(page).toHaveURL(/login/);
});
