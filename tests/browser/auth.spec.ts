import { expect, test, type Page } from "@playwright/test";

const fakeSupabase = "http://127.0.0.1:55431";

async function resetAccounts(page: Page) {
  await page.request.post(`${fakeSupabase}/__test/reset`);
}

async function signup(page: Page, handle = "creator_one") {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`${handle}@example.test`);
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Display name").fill("Creator One");
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
}

async function pendingSignup(page: Page, handle: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`${handle}@example.test`);
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Display name").fill("Pending Creator");
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page.getByText(/open the link on any device/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Resend confirmation email" }),
  ).toBeVisible();
}

async function confirmationToken(page: Page, email: string) {
  return page.request
    .get(`${fakeSupabase}/__test/confirmation-token?email=${email}`)
    .then(async (response) => {
      expect(response.ok()).toBe(true);
      return (await response.json()).tokenHash as string;
    });
}

async function requestCounts(page: Page) {
  return page.request
    .get(`${fakeSupabase}/__test/request-counts`)
    .then((response) => response.json() as Promise<Record<string, number>>);
}

test.beforeEach(async ({ page }) => resetAccounts(page));

test("signup restores its session, edits a public profile, and explicitly claims a local draft", async ({
  page,
}) => {
  await signup(page);
  await page.getByLabel("Handle").fill("creator_updated");
  await page.getByLabel("Display name").fill("Creator Updated");
  await page.getByLabel("Bio").fill("Portable learning package author.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page).toHaveURL(/\/profiles\/creator_updated$/);
  await expect(
    page.getByRole("heading", { name: "Creator Updated" }),
  ).toBeVisible();
  await expect(
    page.getByText("Portable learning package author."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No public packages yet" }),
  ).toBeVisible();

  await page.goto("/settings");
  await expect(page.getByText("creator_one@example.test")).toBeVisible();
  await page.reload();
  await expect(page.getByText("creator_one@example.test")).toBeVisible();

  await page.goto("/studio");
  await page.getByLabel("Package title").fill("Owned Local Course");
  await page.getByRole("button", { name: "Create package" }).click();
  await page.getByRole("button", { name: "Claim local draft" }).click();
  await expect(page.getByText("Owned by @creator_updated")).toBeVisible();
  await expect(page.getByText("Saved locally")).toBeVisible();
  await page.goto("/compile");
  await expect(page.getByText("Worker ready · MCF 1.1")).toBeVisible();
  await page.goto("/library");
  await page
    .locator('input[type="file"]')
    .setInputFiles(`${process.cwd()}/fixtures/local/minimal-1.1.mcf.zip`);
  await page.getByRole("link", { name: "Start learning" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome", exact: true }),
  ).toBeVisible();
});

test("login, logout, password reset initiation, and expired sessions remain recoverable", async ({
  page,
}) => {
  await signup(page);
  await page.goto("/settings");
  await page
    .getByRole("navigation", { name: "Account" })
    .getByText("Creator One")
    .click();
  await page
    .getByRole("navigation", { name: "Account" })
    .getByRole("button", { name: "Sign out" })
    .click();
  await expect(
    page
      .getByRole("navigation", { name: "Account" })
      .getByRole("link", { name: "Sign in" }),
  ).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email").fill("creator_one@example.test");
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/settings$/);

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("creator_one@example.test");
  await page.getByRole("button", { name: "Send recovery email" }).click();
  await expect(
    page.getByText(/If an account exists for that address/),
  ).toBeVisible();

  await page.request.post(`${fakeSupabase}/__test/expire`);
  await page.goto("/settings");
  await expect(page.getByText(/Signed out|Session expired/)).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Account" })
      .getByRole("link", { name: "Sign in" }),
  ).toBeVisible();
});

test("duplicate and invalid handles surface safe validation", async ({
  page,
}) => {
  await signup(page);
  await page.goto("/signup");
  await page.getByLabel("Email").fill("duplicate@example.test");
  await page.getByLabel("Handle").fill("creator_one");
  await page.getByLabel("Display name").fill("Duplicate");
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page.getByText("That handle is already in use.")).toBeVisible();

  await page.getByLabel("Handle").fill("not valid!");
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  expect(
    await page
      .getByLabel("Handle")
      .evaluate((input: HTMLInputElement) => input.validity.valid),
  ).toBe(false);
});

test("email links use the canonical callback and unsafe next paths stay local", async ({
  page,
}) => {
  await signup(page, "redirect_author");
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("redirect_author@example.test");
  await page.getByRole("button", { name: "Send recovery email" }).click();
  const redirects = await page.request
    .get(`${fakeSupabase}/__test/auth-redirects`)
    .then((response) => response.json());
  expect(redirects).toEqual([
    {
      type: "signup",
      redirectTo:
        "http://127.0.0.1:3000/auth/confirm?next=%2Fsettings%2Fprofile",
    },
    {
      type: "recovery",
      redirectTo: "http://127.0.0.1:3000/auth/callback?next=%2Freset-password",
    },
  ]);

  await page.goto("/login?next=//example.test/escaped");
  await page.getByLabel("Email").fill("redirect_author@example.test");
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3000/settings");
  await page.goto("/auth/callback");
  await expect(page.locator(".form-message[role=alert]")).toContainText(
    "account link is incomplete",
  );
});

test("token-hash signup confirmation establishes a session on another device and keeps redirects local", async ({
  page,
  browser,
}) => {
  await page.request.post(`${fakeSupabase}/__test/require-confirmation`);
  await pendingSignup(page, "cross_device");
  const firstToken = await confirmationToken(page, "cross_device@example.test");

  const secondDevice = await browser.newContext();
  const confirmationPage = await secondDevice.newPage();
  await confirmationPage.goto(
    `/auth/confirm?token_hash=${firstToken}&type=email&next=%2Fsettings`,
  );
  await expect(
    confirmationPage.getByRole("heading", {
      name: "Confirm your email address",
    }),
  ).toBeVisible();
  expect((await requestCounts(confirmationPage))["/auth/v1/verify"] ?? 0).toBe(
    0,
  );
  await confirmationPage
    .getByRole("button", { name: "Confirm email address" })
    .click();
  await expect(confirmationPage).toHaveURL(/\/settings$/);
  await expect(
    confirmationPage.getByText("cross_device@example.test"),
  ).toBeVisible();
  expect((await requestCounts(confirmationPage))["/auth/v1/verify"]).toBe(1);

  await pendingSignup(page, "safe_redirect");
  const secondToken = await confirmationToken(
    page,
    "safe_redirect@example.test",
  );
  await confirmationPage.goto(
    `/auth/confirm?token_hash=${secondToken}&type=email&next=//example.test/escaped`,
  );
  await confirmationPage
    .getByRole("button", { name: "Confirm email address" })
    .click();
  await expect(confirmationPage).toHaveURL(/\/settings\/profile$/);
  await expect(confirmationPage).not.toHaveURL(/example\.test/);
  await secondDevice.close();
});

test("invalid confirmation recovers through a non-enumerating manual resend", async ({
  page,
}) => {
  await page.goto(
    "/auth/confirm?token_hash=expired-token&type=email&next=%2Fsettings",
  );
  await expect(
    page.getByRole("heading", { name: "Confirm your email address" }),
  ).toBeVisible();
  expect((await requestCounts(page))["/auth/v1/verify"] ?? 0).toBe(0);
  await page.getByRole("button", { name: "Confirm email address" }).click();
  await expect(page).toHaveURL(/\/resend-confirmation\?error=/);
  await expect(page.locator(".form-message[role=alert]")).toContainText(
    "invalid, expired, or has already been used",
  );

  await page.getByLabel("Email").fill("unknown@example.test");
  await page.getByRole("button", { name: "Resend confirmation email" }).click();
  const genericMessage =
    "If that address has an account awaiting confirmation, a confirmation email is on its way.";
  await expect(page.getByRole("status")).toHaveText(genericMessage);

  await page.getByLabel("Email").fill("another-unknown@example.test");
  await page.getByRole("button", { name: "Resend confirmation email" }).click();
  await expect(page.getByRole("status")).toHaveText(genericMessage);

  const redirects = await page.request
    .get(`${fakeSupabase}/__test/auth-redirects`)
    .then((response) => response.json());
  expect(redirects).toEqual([
    {
      type: "resend",
      redirectTo:
        "http://127.0.0.1:3000/auth/confirm?next=%2Fsettings%2Fprofile",
    },
    {
      type: "resend",
      redirectTo:
        "http://127.0.0.1:3000/auth/confirm?next=%2Fsettings%2Fprofile",
    },
  ]);
});
