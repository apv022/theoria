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
  await expect(page.getByText(/Worker ready · MCF 1.0 \+ 1.1/)).toBeVisible();
  await page.goto("/library");
  await page
    .locator('input[type="file"]')
    .setInputFiles("/home/apv/theoria/fixtures/local/minimal-1.1.mcf.zip");
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
