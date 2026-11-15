import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const HACKATHON_ID = '650c00000000000000000002';

test.describe.serial('Phase 3A: Accessibility, Modal Focus, C08 & Responsive Hardening', () => {
  let authenticatedPage: Page;
  let testTeamId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    authenticatedPage = await context.newPage();

    // Register a user to access authenticated views
    await authenticatedPage.goto('/register');
    await authenticatedPage.locator('#reg-name').fill('Grace Hopper');
    await authenticatedPage.locator('#reg-email').fill('grace.hopper@navy.mil');
    await authenticatedPage.locator('#reg-password').fill('SecureCompArch2026!');
    await authenticatedPage.getByRole('button', { name: /create account/i }).click();

    await expect(authenticatedPage).toHaveURL(/\/onboarding/);
    await authenticatedPage.locator('#onb-handle').fill('gracehopper');
    await authenticatedPage.locator('#onb-bio').fill('Pioneer in compilers.');
    const skillInput = authenticatedPage.locator('input[placeholder*="TypeScript"]');
    await skillInput.fill('compilers');
    await authenticatedPage.getByRole('button', { name: /^add$/i }).click();
    await authenticatedPage.getByRole('button', { name: /save profile & continue to dashboard/i }).click();
    await expect(authenticatedPage).toHaveURL(/\/app$/);

    // Create a team so team leader controls and team detail are available
    await authenticatedPage.goto(`/app/events/${HACKATHON_ID}/teams`);
    await authenticatedPage.getByRole('button', { name: /create team/i }).first().click();
    const dialog = authenticatedPage.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    await dialog.locator('#team-name').fill('Compiler Squad');
    await dialog.locator('#team-desc').fill('Building verified optimizing compiler toolchains.');
    await dialog.locator('#team-min-size').fill('2');
    await dialog.locator('#team-max-size').fill('3');
    await dialog.getByRole('button', { name: /^create team$/i }).click();

    await expect(dialog).toBeHidden();
    await expect(authenticatedPage).toHaveURL(/\/app\/teams\/[a-f0-9]{24}/);
    const urlParts = authenticatedPage.url().split('/');
    testTeamId = urlParts[urlParts.length - 1];
  });

  test.afterAll(async () => {
    await authenticatedPage?.context()?.close();
  });

  // 1. AUTOMATED WCAG 2.2 AA SCANS ON PUBLIC & AUTHENTICATED PAGES
  test('A11y Scan: Landing page (/) meets WCAG 2.2 AA standards', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('A11y Scan: Login page (/login) meets WCAG 2.2 AA standards', async ({ page }) => {
    await page.goto('/login');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('A11y Scan: Registration page (/register) meets WCAG 2.2 AA standards', async ({ page }) => {
    await page.goto('/register');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('A11y Scan: Technical Evidence page (/engineering) meets WCAG 2.2 AA standards', async ({ page }) => {
    await page.goto('/engineering');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('A11y Scan: Authenticated Dashboard (/app) meets WCAG 2.2 AA standards', async () => {
    await authenticatedPage.goto('/app');
    const results = await new AxeBuilder({ page: authenticatedPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('A11y Scan: Team Discovery (/app/events/:id/teams) meets WCAG 2.2 AA standards', async () => {
    await authenticatedPage.goto(`/app/events/${HACKATHON_ID}/teams`);
    const results = await new AxeBuilder({ page: authenticatedPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('A11y Scan: Teammate Discovery (/app/events/:id/teammates) meets WCAG 2.2 AA standards', async () => {
    await authenticatedPage.goto(`/app/events/${HACKATHON_ID}/teammates`);
    const results = await new AxeBuilder({ page: authenticatedPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('A11y Scan: Team Detail (/app/teams/:id) meets WCAG 2.2 AA standards', async () => {
    await authenticatedPage.goto(`/app/teams/${testTeamId}`);
    const results = await new AxeBuilder({ page: authenticatedPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('A11y Scan: Profile Settings (/app/profile) meets WCAG 2.2 AA standards', async () => {
    await authenticatedPage.goto('/app/profile');
    const results = await new AxeBuilder({ page: authenticatedPage })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  // 2. MODAL KEYBOARD ACCESSIBILITY (C09)
  test('C09 Modal: Modal focus entry, trapping, and Escape restoration', async () => {
    await authenticatedPage.goto(`/app/teams/${testTeamId}`);
    const editBtn = authenticatedPage.getByRole('button', { name: /edit team/i });
    await expect(editBtn).toBeVisible();
    await editBtn.click();

    const dialog = authenticatedPage.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Verify initial focus is on team name input
    const nameInput = dialog.locator('#edit-team-name');
    await expect(nameInput).toBeFocused();

    // Verify Tab cycling stays inside dialog
    await authenticatedPage.keyboard.press('Tab');
    const insideDialogAfterTab = await authenticatedPage.evaluate(() => {
      const active = document.activeElement;
      const dlg = document.querySelector('div[role="dialog"]');
      return dlg?.contains(active);
    });
    expect(insideDialogAfterTab).toBe(true);

    // Verify Escape dismisses modal and restores focus to edit button
    await authenticatedPage.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(editBtn).toBeFocused();
  });

  test('C09 Modal: Invite modal accessible copy button and Escape dismissal', async () => {
    await authenticatedPage.goto(`/app/teams/${testTeamId}`);
    const inviteBtn = authenticatedPage.getByRole('button', { name: /invite link/i });
    await expect(inviteBtn).toBeVisible();
    await inviteBtn.click();

    const dialog = authenticatedPage.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Verify modal has accessible title and description
    await expect(dialog.getByRole('heading', { name: /team invite links/i })).toBeVisible();

    // Click "Generate Link" to produce single-use link
    const generateBtn = dialog.getByRole('button', { name: /generate link/i });
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();

    // Verify copy button appears and has accessible label
    const copyBtn = dialog.getByRole('button', { name: /copy invite link/i });
    await expect(copyBtn).toBeVisible();

    // Verify Escape key closes invite modal and returns focus to invite button
    await authenticatedPage.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(inviteBtn).toBeFocused();
  });

  // 3. C08 INVITATION HARDENING
  test('C08 Invitation: Teammate discovery does not present misleading candidate-specific invite actions', async () => {
    await authenticatedPage.goto(`/app/events/${HACKATHON_ID}/teammates`);

    // Verify leader has clear team-level invite action
    const teamInviteBtn = authenticatedPage.getByRole('button', { name: /create team invite link/i });
    await expect(teamInviteBtn).toBeVisible();

    // Verify explanation of single-use team invite links is visible
    await expect(authenticatedPage.getByText(/single-use link for/i)).toBeVisible();

    // Verify candidate cards (if any) do NOT have individual candidate invite buttons
    const candidateCards = authenticatedPage.locator('div.grid > div');
    const count = await candidateCards.count();
    for (let i = 0; i < count; i++) {
      const card = candidateCards.nth(i);
      const cardInviteBtn = card.getByRole('button', { name: /invite/i });
      await expect(cardInviteBtn).toHaveCount(0);
    }
  });

  // 4. RESPONSIVE LAYOUT & MOBILE DRAWER ACCESSIBILITY
  test('Responsive: No horizontal scroll and accessible mobile drawer at 320px, 375px, 390px, 768px', async ({ page }) => {
    const viewports = [
      { width: 320, height: 640 },
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 }
    ];

    for (const vp of viewports) {
      await page.setViewportSize(vp);
      await page.goto('/');

      // Verify no horizontal overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    }

    // Test mobile drawer accessibility at 375px
    await authenticatedPage.setViewportSize({ width: 375, height: 667 });
    await authenticatedPage.goto('/app');

    const hamburger = authenticatedPage.getByRole('button', { name: /open menu|menu/i });
    await expect(hamburger).toBeVisible();
    await hamburger.click();

    const mobileDrawer = authenticatedPage.locator('div[role="dialog"][aria-label="Mobile navigation menu"]');
    await expect(mobileDrawer).toBeVisible();

    // Verify Escape dismisses mobile drawer and restores focus
    await authenticatedPage.keyboard.press('Escape');
    await expect(mobileDrawer).toBeHidden();
    const isHamburgerFocused = await hamburger.evaluate((el) => document.activeElement === el);
    expect(isHamburgerFocused).toBe(true);

    // Reset viewport for subsequent tests
    await authenticatedPage.setViewportSize({ width: 1280, height: 720 });
  });
});
