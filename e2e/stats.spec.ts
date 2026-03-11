import { test, expect } from '@playwright/test';

test('stats page — redirects to login when unauthenticated', async ({ page }) => {
  await page.goto('/stats');
  await expect(page).toHaveURL(/login/);
});
