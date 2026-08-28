import { expect, test, type Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { readFile } from "node:fs/promises";

const fakeSupabase = "http://127.0.0.1:55431";

async function signup(page: Page, handle: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`${handle}@example.test`);
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Display name").fill(handle);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
}

const deprecatedArchive = Buffer.from(
  zipSync({
    "manifest.yaml": strToU8(
      'mcf: "1.0"\nkind: course\nid: old\ntitle: Old\nlanguage: en\nversion: "1.0.0"\nchapters: []\n',
    ),
  }),
);

async function fixturePayload(filename: string) {
  return {
    name: filename,
    mimeType: "application/zip",
    buffer: await readFile(`${process.cwd()}/fixtures/local/${filename}`),
  };
}

test.beforeEach(async ({ page }) => {
  await page.request.post(`${fakeSupabase}/__test/reset`);
});

test("mixed packages validate independently, detect duplicates, and publish valid selections", async ({
  page,
}) => {
  await signup(page, "batch_author");
  await page.goto("/studio/batch-upload");
  const minimal = await fixturePayload("minimal-1.1.mcf.zip");
  await page.locator('input[type="file"]').setInputFiles([
    minimal,
    await fixturePayload("standalone-module.mcf.zip"),
    {
      name: "invalid.mcf.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("not a zip"),
    },
    {
      name: "old.mcf.zip",
      mimeType: "application/zip",
      buffer: deprecatedArchive,
    },
    { ...minimal, name: "minimal-copy.mcf.zip" },
  ]);

  await page.getByText("old.mcf.zip · validation details").click();
  await expect(
    page.getByText("MCF 1.0 is no longer supported").last(),
  ).toBeVisible();
  await expect(page.getByText("Same source checksum as")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish selected (2)" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Publish selected (2)" }).click();
  await expect(page.getByText("Published", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("link", { name: "View package" })).toHaveCount(2);

  const minimalState = await page.request
    .get(`${fakeSupabase}/__test/repository-state?slug=minimal-mcf-course`)
    .then((response) => response.json());
  const moduleState = await page.request
    .get(
      `${fakeSupabase}/__test/repository-state?slug=field-observation-evidence-and-sequence`,
    )
    .then((response) => response.json());
  expect(minimalState.versions).toHaveLength(1);
  expect(minimalState.sourceObjects).toHaveLength(1);
  expect(moduleState.versions).toHaveLength(1);
  expect(moduleState.sourceObjects).toHaveLength(1);

  await page.getByRole("button", { name: "Clear batch" }).click();
  await page.locator('input[type="file"]').setInputFiles(minimal);
  await expect(
    page.getByRole("button", { name: "Publish selected (1)" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Publish selected (1)" }).click();
  await expect(page.getByText("Duplicate", { exact: true })).toBeVisible();
  const unchanged = await page.request
    .get(`${fakeSupabase}/__test/repository-state?slug=minimal-mcf-course`)
    .then((response) => response.json());
  expect(unchanged.versions).toHaveLength(1);
});

test("a failed upload retries alone without republishing successful packages", async ({
  page,
}) => {
  await signup(page, "batch_retry");
  await page.goto("/studio/batch-upload");
  await page
    .getByLabel("Visibility for new repositories")
    .selectOption("private");
  await page
    .locator('input[type="file"]')
    .setInputFiles([
      await fixturePayload("standalone-lesson.mcf.zip"),
      await fixturePayload("standalone-module.mcf.zip"),
    ]);
  await expect(
    page.getByRole("button", { name: "Publish selected (2)" }),
  ).toBeEnabled();
  await page.request.post(`${fakeSupabase}/__test/fail-upload`);
  await page.getByRole("button", { name: "Publish selected (2)" }).click();
  await expect(page.getByText("Failed", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Published", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Retry failed (1)" }).click();
  await expect(page.getByText("Published", { exact: true })).toHaveCount(2);

  for (const packageSlug of [
    "reading-map-scale",
    "field-observation-evidence-and-sequence",
  ]) {
    const state = await page.request
      .get(`${fakeSupabase}/__test/repository-state?slug=${packageSlug}`)
      .then((response) => response.json());
    expect(state.versions).toHaveLength(1);
    expect(state.package.visibility).toBe("private");
  }
});

test("large batch remains stable and does not select deterministic duplicates", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/studio/batch-upload");
  const archive = await readFile(
    `${process.cwd()}/fixtures/local/minimal-1.1.mcf.zip`,
  );
  await page.locator('input[type="file"]').setInputFiles(
    Array.from({ length: 32 }, (_, index) => ({
      name: `catalog-${index + 1}.mcf.zip`,
      mimeType: "application/zip",
      buffer: archive,
    })),
  );
  await expect(page.getByText("Same source checksum as")).toHaveCount(31);
  await expect(
    page.getByRole("button", { name: "Publish selected (1)" }),
  ).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});

test("Batch Upload empty state remains usable at mobile width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studio/batch-upload");
  await expect(
    page.getByRole("heading", { name: "No packages in this batch." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select packages" }),
  ).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});
