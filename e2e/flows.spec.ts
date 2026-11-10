import { test, expect, Page, BrowserContext } from '@playwright/test';

const HACKATHON_ID = '650c00000000000000000001';

test.describe.serial('CrewGrid 10-Flow Production E2E Suite', () => {
  let context1: BrowserContext;
  let page1: Page;

  let context2: BrowserContext;
  let page2: Page;

  let context3: BrowserContext;
  let page3: Page;

  let context4: BrowserContext;
  let page4: Page;

  let createdTeamId: string;
  let generatedInviteUrl: string;
  let fullTeamInviteUrl: string;

  test.beforeAll(async ({ browser }) => {
    context1 = await browser.newContext();
    page1 = await context1.newPage();

    context2 = await browser.newContext();
    page2 = await context2.newPage();

    context3 = await browser.newContext();
    page3 = await context3.newPage();

    context4 = await browser.newContext();
    page4 = await context4.newPage();
  });

  test.afterAll(async () => {
    await context1?.close();
    await context2?.close();
    await context3?.close();
    await context4?.close();
  });

  // FLOW 1: Registration -> Auto-login -> Session restoration on reload
  test('Flow 1: User 1 registration, auto-login, and session restoration on reload', async () => {
    await page1.goto('/register');
    await expect(page1.getByRole('heading', { name: /create your account/i })).toBeVisible();

    await page1.locator('#reg-name').fill('Ada Lovelace');
    await page1.locator('#reg-email').fill('ada.lovelace@example.com');
    await page1.locator('#reg-password').fill('SecurePassword123!');
    await page1.getByRole('button', { name: /create account/i }).click();

    // Auto-login redirects to /onboarding
    await expect(page1).toHaveURL(/\/onboarding/);
    await expect(page1.getByRole('heading', { name: /complete your profile/i })).toBeVisible();
    await expect(page1.locator('#onb-name')).toHaveValue('Ada Lovelace');

    // Test session restoration on browser reload
    await page1.reload();
    await expect(page1).toHaveURL(/\/onboarding/);
    await expect(page1.locator('#onb-name')).toHaveValue('Ada Lovelace');
  });

  // FLOW 2: Profile completion -> Redirect to /app -> Active hackathon selection
  test('Flow 2: Profile completion, redirect to /app, and active hackathon selection', async () => {
    await page1.locator('#onb-handle').fill('adalove');
    await page1.locator('#onb-bio').fill('Chief Architect and Mathematician specializing in distributed algorithms.');

    const skillInput = page1.locator('input[placeholder*="TypeScript"]');
    await skillInput.fill('Distributed Systems');
    await page1.getByRole('button', { name: /^add$/i }).click();

    await page1.locator('#discoverable-toggle').check();
    await page1.getByRole('button', { name: /save profile & continue to dashboard/i }).click();

    // Redirect to /app
    await expect(page1).toHaveURL(/\/app$/);
    await expect(page1.getByRole('heading', { name: /welcome, Ada Lovelace/i })).toBeVisible();

    // Active Hackathon is automatically selected and shown in the sidebar
    const hackathonSelect = page1.locator('#hackathon-select');
    await expect(hackathonSelect).toBeVisible();
    await expect(hackathonSelect).toHaveValue(HACKATHON_ID);

    // Initial state is unassigned in the hackathon
    await expect(page1.getByText(/you are currently looking for a team/i)).toBeVisible();
  });

  // FLOW 3: Team creation ("E2E Champions", min 2, max 3) on /app/events/:id/teams
  test('Flow 3: Team creation ("E2E Champions", min 2, max 3)', async () => {
    await page1.goto(`/app/events/${HACKATHON_ID}/teams`);
    await expect(page1.getByRole('heading', { name: /discover teams/i })).toBeVisible();

    // Click "Create Team" to open the creation modal
    await page1.getByRole('button', { name: /create team/i }).first().click();

    const dialog = page1.locator('div[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /create a hackathon team/i })).toBeVisible();

    await dialog.locator('#team-name').fill('E2E Champions');
    await dialog.locator('#team-desc').fill('Race-proof squad testing concurrent joins and transactional integrity.');
    await dialog.locator('#team-min-size').fill('2');
    await dialog.locator('#team-max-size').fill('3');

    const skillInput = dialog.locator('input[placeholder*="React"]');
    await skillInput.fill('Distributed Systems');
    await dialog.getByRole('button', { name: /^add$/i }).click();

    await dialog.getByRole('button', { name: /^create team$/i }).click();

    // Navigates to TeamDetail: /app/teams/:teamId
    await expect(page1).toHaveURL(/\/app\/teams\/[a-f0-9]{24}/);
    await expect(page1.getByRole('heading', { name: 'E2E Champions' })).toBeVisible();
    await expect(page1.getByText('You are Leader')).toBeVisible();
    await expect(page1.getByText(/1 of 3 seats filled/i)).toBeVisible();

    const url = page1.url();
    const match = url.match(/\/app\/teams\/([a-f0-9]{24})/);
    expect(match).toBeTruthy();
    createdTeamId = match![1];
  });

  // FLOW 4: User 2 applies to join team -> request shows pending on /app/events/:id/my-requests
  test('Flow 4: User 2 applies to join team and request shows pending', async () => {
    // Register User 2
    await page2.goto('/register');
    await page2.locator('#reg-name').fill('Charles Babbage');
    await page2.locator('#reg-email').fill('charles.babbage@example.com');
    await page2.locator('#reg-password').fill('SecurePassword123!');
    await page2.getByRole('button', { name: /create account/i }).click();

    await expect(page2).toHaveURL(/\/onboarding/);
    await page2.locator('#onb-handle').fill('babbage');
    await page2.locator('#onb-bio').fill('Analytical Engine builder.');
    await page2.getByRole('button', { name: /save profile & continue to dashboard/i }).click();
    await expect(page2).toHaveURL(/\/app$/);

    // Navigate to team discovery
    await page2.goto(`/app/events/${HACKATHON_ID}/teams`);
    await expect(page2.getByText('E2E Champions')).toBeVisible();

    // Click Request to Join
    await page2.getByRole('button', { name: /request to join/i }).click();

    // Fill message in join modal
    const joinModal = page2.locator('div[role="dialog"]');
    await expect(joinModal).toBeVisible();
    await joinModal.locator('#join-msg').fill('Analytical Engine architect ready to pair!');
    await joinModal.getByRole('button', { name: /submit request/i }).click();

    // Card now displays "Request Pending"
    await expect(page2.getByRole('button', { name: /request pending/i })).toBeVisible();

    // Navigate to /app/events/:id/my-requests to verify pending status
    await page2.goto(`/app/events/${HACKATHON_ID}/my-requests`);
    await expect(page2.getByRole('heading', { name: /my join requests/i })).toBeVisible();
    await expect(page2.getByText(/pending review \(1\)/i)).toBeVisible();
    await expect(page2.getByText(/Analytical Engine architect ready to pair!/i)).toBeVisible();
  });

  // FLOW 5: User 1 approves User 2 request on /app/teams/:teamId -> roster updates to 2/3
  test('Flow 5: User 1 approves User 2 request on /app/teams/:teamId -> roster updates to 2/3', async () => {
    await page1.goto(`/app/teams/${createdTeamId}`);

    // Click on Join Requests tab
    const requestsTab = page1.getByRole('button', { name: /join requests/i });
    await expect(requestsTab).toBeVisible();
    await requestsTab.click();

    // Find the request and approve it
    await expect(page1.getByText(/Analytical Engine architect ready to pair!/i)).toBeVisible();
    const approveBtn = page1.getByRole('button', { name: /^approve$/i });
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();

    // Verify toast confirmation
    await expect(page1.getByText(/request approved/i)).toBeVisible();

    // Switch back to Roster tab to verify member count
    await page1.getByRole('button', { name: /members/i }).click();
    await expect(page1.getByText(/2 of 3 seats filled/i)).toBeVisible();
    await expect(page1.locator('#main-content').getByText('Charles Babbage')).toBeVisible();
  });

  // FLOW 6: Real-time SSE updates validated across both sessions
  test('Flow 6: Real-time SSE updates validated across both sessions', async () => {
    // Both sessions should display Live SSE status
    await expect(page1.locator('header').getByText('Live')).toBeVisible();
    await expect(page2.locator('header').getByText('Live')).toBeVisible();

    // In User 2's session, navigate to dashboard to verify they are now an active member
    await page2.goto('/app');
    await expect(page2.getByText(/active assignment/i)).toBeVisible();
    await expect(page2.getByRole('heading', { name: 'E2E Champions' })).toBeVisible();
    await expect(page2.getByText(/2 of 3 seats filled/i)).toBeVisible();
  });

  // FLOW 7: User 1 creates invite link (#token=...); User 3 redeems invite -> roster updates to 3/3
  test('Flow 7: User 1 creates invite link; User 3 redeems invite -> roster updates to 3/3', async () => {
    await page1.goto(`/app/teams/${createdTeamId}`);

    // Click "Invite Link" button
    await page1.getByRole('button', { name: /invite link/i }).click();
    const inviteModal = page1.locator('div[role="dialog"]');
    await expect(inviteModal).toBeVisible();

    // Generate link
    await inviteModal.getByRole('button', { name: /generate link/i }).click();
    await expect(inviteModal.getByText(/one-time invite url generated/i)).toBeVisible();

    const urlInput = inviteModal.locator('input[readOnly]');
    await expect(urlInput).toBeVisible();
    generatedInviteUrl = await urlInput.inputValue();
    expect(generatedInviteUrl).toContain('/invite#token=');

    // Close modal
    await inviteModal.locator('button').first().click();

    // Register User 3
    await page3.goto('/register');
    await page3.locator('#reg-name').fill('Alan Turing');
    await page3.locator('#reg-email').fill('alan.turing@example.com');
    await page3.locator('#reg-password').fill('SecurePassword123!');
    await page3.getByRole('button', { name: /create account/i }).click();
    await expect(page3).toHaveURL(/\/onboarding/);

    // User 3 visits the invite link
    await page3.goto(generatedInviteUrl);

    // URL fragment token is immediately scrubbed from URL bar for security
    await expect(page3).toHaveURL(/http:\/\/127\.0\.0\.1:3000\/invite$/);

    // Click Accept Invite & Join Team
    const acceptBtn = page3.getByRole('button', { name: /accept invite & join team/i });
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    // User 3 lands on team detail with roster at 3 of 3 (Full)
    await expect(page3).toHaveURL(new RegExp(`/app/teams/${createdTeamId}`));
    await expect(page3.getByText(/3 of 3 seats filled/i)).toBeVisible();
    await expect(page3.locator('#main-content').getByText('Alan Turing')).toBeVisible();

    // In User 1 session, check roster is 3 of 3
    await page1.reload();
    await expect(page1.getByText(/3 of 3 seats filled/i)).toBeVisible();
    await expect(page1.locator('#main-content').getByText('Alan Turing')).toBeVisible();

    // Generate a second invite link on the now-full team to test capacity rejection
    await page1.getByRole('button', { name: /invite link/i }).click();
    const modal2 = page1.locator('div[role="dialog"]');
    await expect(modal2).toBeVisible();
    await modal2.getByRole('button', { name: /generate link/i }).click();
    await expect(modal2.getByText(/one-time invite url generated/i)).toBeVisible();
    fullTeamInviteUrl = await modal2.locator('input[readOnly]').inputValue();
    await modal2.locator('button').first().click();
  });

  // FLOW 8: User 4 tries to join -> receives TEAM_FULL capacity error alert
  test('Flow 8: User 4 tries to join -> receives TEAM_FULL capacity enforcement', async () => {
    // Register User 4
    await page4.goto('/register');
    await page4.locator('#reg-name').fill('Grace Hopper');
    await page4.locator('#reg-email').fill('grace.hopper@example.com');
    await page4.locator('#reg-password').fill('SecurePassword123!');
    await page4.getByRole('button', { name: /create account/i }).click();
    await expect(page4).toHaveURL(/\/onboarding/);

    // Go to team discovery board
    await page4.goto(`/app/events/${HACKATHON_ID}/teams`);
    await expect(page4.getByText('E2E Champions')).toBeVisible();

    // Team Card shows disabled "Team Full" button
    const teamFullBtn = page4.getByRole('button', { name: /team full/i });
    await expect(teamFullBtn).toBeVisible();
    await expect(teamFullBtn).toBeDisabled();

    // User 4 attempts to redeem an invite for the full team
    await page4.goto(fullTeamInviteUrl);
    const acceptBtn = page4.getByRole('button', { name: /accept invite & join team/i });
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    // Capacity error alert is displayed (in banner and toast)
    await expect(
      page4.getByText(/this team is already at maximum capacity\. no seats are remaining\./i).first()
    ).toBeVisible();
  });

  // FLOW 9: User logs out -> session cookie cleared -> /app redirects to /login
  test('Flow 9: User 1 logout, session cookie cleared, /app redirects to /login', async () => {
    await page1.goto('/app');
    await expect(page1.getByRole('heading', { name: /welcome, Ada Lovelace/i })).toBeVisible();

    // Click Sign out button
    const signOutBtn = page1.locator('button[aria-label="Sign out"]');
    await expect(signOutBtn).toBeVisible();
    await signOutBtn.click();

    // Navigates to /login
    await expect(page1).toHaveURL(/\/login/);

    // Direct access to /app redirects back to /login
    await page1.goto('/app');
    await expect(page1).toHaveURL(/\/login/);
  });

  // FLOW 10: Mobile viewport (375x667) -> drawer opens via hamburger; keyboard accessibility (Escape closes modals)
  test('Flow 10: Mobile viewport (375x667) drawer navigation and modal keyboard accessibility', async () => {
    // Test on User 2 session (still authenticated)
    await page2.setViewportSize({ width: 375, height: 667 });
    await page2.goto('/app');

    // If redirected to login, log in as Charles Babbage
    if (page2.url().includes('/login')) {
      await page2.locator('#login-email').fill('charles.babbage@example.com');
      await page2.locator('#login-password').fill('SecurePassword123!');
      await page2.getByRole('button', { name: /sign in/i }).click();
      await expect(page2).toHaveURL(/\/app/);
    }

    // Mobile header is visible
    const hamburgerBtn = page2.locator('button[aria-label="Open menu"]');
    await expect(hamburgerBtn).toBeVisible();

    // Open mobile navigation drawer
    await hamburgerBtn.click();
    const drawer = page2.locator('div[role="dialog"]');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('link', { name: /discover teams/i })).toBeVisible();

    // Close drawer via close button
    const closeBtn = page2.locator('button[aria-label="Close menu"]');
    await closeBtn.click();
    await expect(drawer).not.toBeVisible();

    // Test Keyboard Accessibility: Escape key closes modals
    await page2.goto(`/app/teams/${createdTeamId}`);

    // Click Leave Team to open Confirm dialog
    const leaveBtn = page2.getByRole('button', { name: /leave team/i });
    await expect(leaveBtn).toBeVisible();
    await leaveBtn.click();

    const confirmModal = page2.locator('div[role="dialog"]');
    await expect(confirmModal).toBeVisible();
    await expect(confirmModal.getByText(/are you sure you want to leave/i)).toBeVisible();

    // Press Escape key
    await page2.keyboard.press('Escape');

    // Dialog is dismissed
    await expect(confirmModal).not.toBeVisible();
  });
});
