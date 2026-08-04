import { expect, test, type Page } from "@playwright/test";

const fakeSupabase = "http://127.0.0.1:55431";

async function signup(page: Page, handle: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`${handle}@example.test`);
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Display name").fill(handle.replaceAll("_", " "));
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
}

async function createDraft(page: Page, title: string) {
  await page.goto("/studio");
  await page.getByLabel("Package title").fill(title);
  await page.getByLabel("Package kind").selectOption("course");
  await page.getByRole("button", { name: "Create package" }).click();
  await page.getByRole("button", { name: "publish", exact: true }).click();
}

async function publishFirst(
  page: Page,
  slug: string,
  visibility: "public" | "unlisted" | "private" = "public",
) {
  const claim = page
    .locator(".publish-panel")
    .getByRole("button", { name: "Claim local draft" });
  if (await claim.isVisible()) await claim.click();
  await page.getByLabel("Package slug").fill(slug);
  await page.getByLabel("Semantic version").fill("1.0.0");
  await page.getByLabel("Visibility").selectOption(visibility);
  await page.getByLabel("Release notes").fill("Pilot-ready release.");
  await page.getByRole("button", { name: "Check slug" }).click();
  await expect(page.getByText("Slug available")).toBeVisible();
  await page.getByRole("button", { name: "Publish first version" }).click();
  await expect(page.getByText(`Published ${slug} version 1.0.0`)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.request.post(`${fakeSupabase}/__test/reset`);
});

test("signed-out authoring remains local and publishing asks for sign-in", async ({
  page,
}) => {
  await createDraft(page, "Offline Course");
  await expect(
    page.getByRole("heading", { name: "Sign in to publish" }),
  ).toBeVisible();
  await expect(
    page.locator(".publish-panel").getByRole("link", { name: "Sign in" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "metadata", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Still local");
  await expect(page.getByText("Saved locally")).toBeVisible();
});

test("publishes two immutable versions and keeps the draft editable", async ({
  page,
  request,
}) => {
  await signup(page, "version_author");
  await createDraft(page, "Versioned Course");
  await publishFirst(page, "versioned-course");

  await page.getByRole("link", { name: "View immutable version" }).click();
  await expect(
    page.getByRole("heading", { name: /Versioned Course 1\.0\.0/ }),
  ).toBeVisible();
  await expect(page.getByText("Pilot-ready release.")).toBeVisible();
  await expect(page.getByText(/^[0-9a-f]{64}$/)).toBeVisible();
  const source = await page.request.get(
    "/api/packages/versioned-course/versions/1.0.0/source",
  );
  expect(source.status()).toBe(200);
  expect(source.headers()["content-type"]).toContain("application/zip");
  const anonymousSource = await request.get(
    "/api/packages/versioned-course/versions/1.0.0/source",
  );
  expect(anonymousSource.status()).toBe(200);

  await page.goBack();
  await page.getByRole("button", { name: "metadata", exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Versioned Course Revised");
  await expect(page.getByText("Saved locally")).toBeVisible();
  await page.getByRole("button", { name: "publish", exact: true }).click();
  await page.getByLabel("Semantic version").fill("1.0.1");
  await page.getByLabel("Release notes").fill("A second immutable version.");
  await page
    .getByRole("button", { name: "Publish new immutable version" })
    .click();
  await expect(
    page.getByText("Published versioned-course version 1.0.1"),
  ).toBeVisible();
  await page.goto("/packages/versioned-course");
  await expect(page.getByText("Latest · 1.0.1")).toBeVisible();
  await expect(page.getByText("1.0.0", { exact: true })).toBeVisible();
  await expect(page.getByText("1.0.1", { exact: true })).toBeVisible();
});

test("reports slug and duplicate-version conflicts", async ({ page }) => {
  await signup(page, "first_author");
  await createDraft(page, "First Course");
  await publishFirst(page, "shared-course");
  await page.getByLabel("Semantic version").fill("1.0.0");
  await page
    .getByLabel("Release notes")
    .fill("Conflicting metadata for an existing version.");
  await page
    .getByRole("button", { name: "Publish new immutable version" })
    .click();
  await expect(page.getByText(/already exists|not owned/)).toBeVisible();

  await page.goto("/signup");
  await signup(page, "second_author");
  await createDraft(page, "Second Course");
  const claim = page
    .locator(".publish-panel")
    .getByRole("button", { name: "Claim local draft" });
  if (await claim.isVisible()) await claim.click();
  await page.getByLabel("Package slug").fill("shared-course");
  await page.getByRole("button", { name: "Check slug" }).click();
  await expect(page.getByText("Slug unavailable")).toBeVisible();
});

test("blocks invalid source and supports retry after an upload failure", async ({
  page,
}) => {
  await signup(page, "retry_author");
  await createDraft(page, "Retry Course");
  const claim = page
    .locator(".publish-panel")
    .getByRole("button", { name: "Claim local draft" });
  if (await claim.isVisible()) await claim.click();
  await page.getByLabel("Package slug").fill("retry-course");

  await page.getByRole("button", { name: "source", exact: true }).click();
  await page.locator("#source-editor").fill("not: valid: yaml:");
  await page.getByRole("button", { name: "Apply and validate" }).click();
  await expect(page.getByText("invalid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "publish", exact: true }).click();
  await page.getByRole("button", { name: "Publish first version" }).click();
  await expect(page.getByText(/Resolve every validation error/)).toBeVisible();

  await createDraft(page, "Retry Valid Course");
  const retryClaim = page
    .locator(".publish-panel")
    .getByRole("button", { name: "Claim local draft" });
  if (await retryClaim.isVisible()) await retryClaim.click();
  await page.getByLabel("Package slug").fill("retry-valid-course");
  await page.getByLabel("Semantic version").fill("1.0.0");
  await page.request.post(`${fakeSupabase}/__test/fail-upload`);
  await page.getByRole("button", { name: "Publish first version" }).click();
  await expect(page.getByText("Temporary upload failure")).toBeVisible();
  await page.getByRole("button", { name: "Retry publish" }).click();
  await expect(
    page.getByText("Published retry-valid-course version 1.0.0"),
  ).toBeVisible();
});

test("private source and metadata reject anonymous readers", async ({
  page,
  request,
}) => {
  await signup(page, "private_author");
  await createDraft(page, "Private Course");
  await publishFirst(page, "private-course", "private");
  await expect(
    page.getByRole("link", { name: "View immutable version" }),
  ).toBeVisible();
  const anonymousPage = await request.get("/packages/private-course");
  expect(anonymousPage.status()).toBe(200);
  expect(await anonymousPage.text()).toContain("Package unavailable");
  const anonymousSource = await request.get(
    "/api/packages/private-course/versions/1.0.0/source",
  );
  expect(anonymousSource.status()).toBe(404);
});
