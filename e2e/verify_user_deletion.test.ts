import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    recordVideo: { dir: 'videos/' }
  });
  const page = await context.newPage();

  try {
    console.log('Navigating to login page...');
    await page.goto('http://localhost:3000/login');

    console.log('Clicking Admin dev login button...');
    // Use a more specific selector if possible
    await page.click('button:has-text("Admin")');

    console.log('Waiting for navigation...');
    // Wait for something that indicates we are logged in, e.g., the navbar or home page content
    // Based on the app, "/" usually has some content.
    await page.waitForURL('http://localhost:3000/', { timeout: 60000 });
    console.log('Logged in successfully, at home page.');

    console.log('Navigating to /users...');
    await page.goto('http://localhost:3000/users');

    console.log('Waiting for the users table to load...');
    await page.waitForSelector('.admin-table', { timeout: 30000 });

    // Take a screenshot of the initial state
    await page.screenshot({ path: 'screenshots/initial_users_list.png' });

    // Look for a user that is NOT admin@dev.local to delete
    // In setup-dev.ts, 'chvl@dev.local' is created.
    console.log('Looking for a user to delete...');
    const userRow = page.locator('tr:has-text("chvl@dev.local")');
    if (await userRow.count() > 0) {
      console.log('Found chvl@dev.local. Clicking delete button...');
      // The delete button is the second button in the last cell (actions)
      // or find by class btn-danger if it's the only one
      const deleteButton = userRow.locator('button.btn-danger');
      await deleteButton.click();

      console.log('Waiting for confirmation modal...');
      await page.waitForSelector('.modal-overlay', { state: 'visible' });
      await page.screenshot({ path: 'screenshots/delete_confirmation_modal.png' });

      console.log('Confirming deletion...');
      const confirmButton = page.locator('.modal-actions button.btn-danger');
      await confirmButton.click();

      console.log('Waiting for user to disappear from the list...');
      // We expect the row to be gone
      await expect(userRow).toHaveCount(0, { timeout: 10000 });

      console.log('User deleted successfully.');
      await page.screenshot({ path: 'screenshots/user_deleted_success.png' });
    } else {
      console.log('User chvl@dev.local not found.');
      // List all users for debugging
      const allUsers = await page.locator('tr').allInnerTexts();
      console.log('All users found:', allUsers);
    }

  } catch (error) {
    console.error('An error occurred:', error);
    await page.screenshot({ path: 'screenshots/error_screenshot.png' });
  } finally {
    await browser.close();
  }
})();

// Helper to simulate expect if not using a test runner
async function expect(locator: any) {
  return {
    toHaveCount: async (count: number, options: { timeout: number }) => {
      const start = Date.now();
      while (Date.now() - start < options.timeout) {
        if (await locator.count() === count) return;
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error(`Expected count ${count} but got ${await locator.count()}`);
    }
  };
}
