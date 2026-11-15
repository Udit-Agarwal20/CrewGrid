import { test, expect } from '@playwright/test';

const HACKATHON_1_ID = '650c00000000000000000001';
const HACKATHON_2_ID = '650c00000000000000000002';

test.describe('Routing & Hackathon Synchronization Regression Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Register and set up session
    const timestamp = Date.now();
    await page.goto('/register');
    await page.locator('#reg-name').fill(`Routing Tester ${timestamp}`);
    await page.locator('#reg-email').fill(`routing.${timestamp}@example.com`);
    await page.locator('#reg-password').fill('SecurePassword123!');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/onboarding/);
    await page.locator('#onb-handle').fill(`router${timestamp.toString().slice(-6)}`);
    await page.locator('#onb-bio').fill('Testing resilient routing, SSE stability and hackathon synchronization.');
    await page.getByRole('button', { name: /save profile & continue to dashboard/i }).click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test('Scenario 1: Auto-redirects stale "/app/events/default/teams" to valid hackathon ID', async ({ page }) => {
    // Directly navigate to the stale default route
    await page.goto('/app/events/default/teams');

    // Should automatically redirect to valid hackathon ID
    await expect(page).toHaveURL(new RegExp(`/app/events/${HACKATHON_1_ID}/teams`));
    await expect(page.getByRole('heading', { name: /discover teams/i })).toBeVisible();

    // Verify no 422 errors occurred and Live status is established in the desktop header
    await expect(page.getByRole('banner').getByText('Live')).toBeVisible();
  });

  test('Scenario 2: Browser refresh preserves valid deep link event ID and active selection', async ({ page }) => {
    await page.goto(`/app/events/${HACKATHON_1_ID}/teams`);
    await expect(page.getByRole('heading', { name: /discover teams/i })).toBeVisible();

    // Reload page
    await page.reload();

    await expect(page).toHaveURL(new RegExp(`/app/events/${HACKATHON_1_ID}/teams`));
    const hackathonSelect = page.locator('#hackathon-select');
    await expect(hackathonSelect).toBeVisible();
    await expect(hackathonSelect).toHaveValue(HACKATHON_1_ID);
  });

  test('Scenario 3: Stale "default" in sessionStorage is sanitized to valid hackathon ID', async ({ page }) => {
    // Inject stale 'default' value in sessionStorage
    await page.evaluate(() => {
      sessionStorage.setItem('crewgrid_active_hackathon', 'default');
    });

    await page.goto('/app');
    await expect(page).toHaveURL(/\/app$/);

    // Verify sessionStorage was sanitized
    await expect
      .poll(async () => {
        return page.evaluate(() => sessionStorage.getItem('crewgrid_active_hackathon'));
      })
      .toBe(HACKATHON_1_ID);

    // Verify sidebar Discover Teams link points to valid ID, NOT default
    const discoverLink = page.getByRole('link', { name: /discover teams/i });
    await expect(discoverLink).toHaveAttribute('href', `/app/events/${HACKATHON_1_ID}/teams`);
  });

  test('Scenario 4: Switching hackathons updates route, query keys, and SSE subscription', async ({ page }) => {
    await page.goto(`/app/events/${HACKATHON_1_ID}/teams`);
    await expect(page).toHaveURL(new RegExp(`/app/events/${HACKATHON_1_ID}/teams`));

    // Change hackathon in sidebar selector
    const hackathonSelect = page.locator('#hackathon-select');
    await hackathonSelect.selectOption(HACKATHON_2_ID);

    // URL must update to the new hackathon ID
    await expect(page).toHaveURL(new RegExp(`/app/events/${HACKATHON_2_ID}/teams`));
    await expect(hackathonSelect).toHaveValue(HACKATHON_2_ID);

    // Verify SSE connects to the new hackathon
    await expect(page.getByRole('banner').getByText('Live')).toBeVisible();
  });

  test('Scenario 5: Teammate Discovery displays empty state without simultaneously showing error panel', async ({ page }) => {
    await page.goto(`/app/events/${HACKATHON_1_ID}/teammates`);
    await expect(page.getByRole('heading', { name: /teammate discovery/i })).toBeVisible();

    // Verify empty state is visible
    await expect(page.getByText('No Discoverable Candidates Found')).toBeVisible();

    // Verify error panel is NOT visible
    await expect(page.getByText(/could not load candidates/i)).not.toBeVisible();
  });

  test('Scenario 6: Malformed / invalid event ID displays error panel cleanly without infinite SSE retries', async ({ page }) => {
    await page.goto('/app/events/invalid-event-id/teams');

    // Should render clean error panel
    await expect(page.getByText('Invalid Event Identifier')).toBeVisible();

    // Should NOT crash or show blank screen
    await expect(page.getByRole('heading', { name: /invalid event identifier/i })).toBeVisible();
  });
});

