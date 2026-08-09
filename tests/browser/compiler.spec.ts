import { expect, test } from "@playwright/test";
import { zipSync } from "fflate";

const fixtureRoot = `${process.cwd()}/fixtures/local`;
const fixture10 = `${fixtureRoot}/minimal-1.0`;
const fixture11 = `${fixtureRoot}/minimal-1.1.mcf.zip`;
const stress = `${fixtureRoot}/stress.mcf.zip`;
const feature = `${fixtureRoot}/feature-showcase.mcf.zip`;

test.beforeEach(async ({ page }) => {
  await page.goto("/compile");
  await expect(page.getByText(/Worker ready · MCF 1.0 \+ 1.1/)).toBeVisible();
});

test("validates and compiles a small MCF 1.1 archive", async ({ page }) => {
  await page.locator('input[type="file"]').first().setInputFiles(fixture11);
  await page.getByRole("button", { name: "Compile package" }).click();
  await expect(
    page.getByRole("heading", { name: "Package ready" }),
  ).toBeVisible();
  await expect(page.getByText("MCF 1.1 · course")).toBeVisible();
  await expect(
    page.getByText("1 lessons · 1 activities · 0 questions"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview in Reader" }).click();
  await expect(
    page.getByRole("dialog", { name: "Minimal MCF Course" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Welcome", { exact: true }),
  ).toBeVisible();
});

test("imports and compiles an MCF 1.0 package directory", async ({ page }) => {
  await page.locator('input[type="file"]').nth(1).setInputFiles(fixture10);
  await page.getByRole("button", { name: "Compile package" }).click();
  await expect(
    page.getByRole("heading", { name: "Package ready" }),
  ).toBeVisible();
  await expect(page.getByText("MCF 1.0 · course")).toBeVisible();
  await page.getByRole("button", { name: "Preview in Reader" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close preview" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Add to library" }).click();
  await page.goto("/library");
  await page.getByRole("link", { name: "Start learning" }).click();
  await expect(page.locator(".reader-lesson")).toBeVisible();
});

test("Compiler Reader preview is bounded, isolated, and cannot recurse", async ({
  page,
}) => {
  await page.locator('input[type="file"]').first().setInputFiles(feature);
  await page.getByRole("button", { name: "Compile package" }).click();
  await page.getByRole("button", { name: "Preview in Reader" }).click();

  const preview = page.getByRole("dialog", {
    name: "MCF 1.1 Feature Showcase",
  });
  await expect(preview).toHaveCount(1);
  await expect(
    preview.getByRole("heading", { name: "Core features", exact: true }),
  ).toBeVisible();
  await expect(
    preview.locator(".platform-header, .site-header, .reader-header"),
  ).toHaveCount(0);
  await expect(
    preview.getByRole("link", { name: /Explore|Library|Studio|Compiler/ }),
  ).toHaveCount(0);
  await expect(preview.locator("iframe")).toHaveCount(0);
  await expect(preview.locator(".reader-outline-nav")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await preview.getByRole("button", { name: "Close preview" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Package ready" }),
  ).toBeVisible();

  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole("button", { name: "Preview in Reader" }).click();
  const mobilePreview = page.getByRole("dialog", {
    name: "MCF 1.1 Feature Showcase",
  });
  await expect(
    mobilePreview.getByRole("button", { name: "Course outline" }),
  ).toBeVisible();
  await expect(mobilePreview.locator(".reader-outline-nav")).toBeHidden();
  await mobilePreview.getByRole("button", { name: "Course outline" }).click();
  await expect(mobilePreview.locator(".reader-outline-nav")).toBeVisible();
  await mobilePreview.getByRole("button", { name: "Close preview" }).click();

  await page.goto("/library");
  await expect(page.getByText("Your shelf is ready.")).toBeVisible();
});

test("keeps the UI responsive while compiling the deterministic stress fixture", async ({
  page,
}) => {
  await page.locator('input[type="file"]').first().setInputFiles(stress);
  await page.getByRole("button", { name: "Compile package" }).click();
  await expect(page.locator(".compiler-header")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Package ready" }),
  ).toBeVisible();
  await expect(
    page.getByText("1 lessons · 1 activities · 24 questions"),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Compilation history" }),
  ).toBeVisible();
  await expect(
    page.getByText("Deterministic Stress Course").last(),
  ).toBeVisible();
});

test("shows structured security diagnostics for a hostile archive", async ({
  page,
}) => {
  const archive = zipSync({
    "manifest.yaml": new TextEncoder().encode("mcf: '1.1'\nkind: course\n"),
    "../escape.mcf": new TextEncoder().encode("hostile"),
  });
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "hostile.mcf.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(archive),
    });
  await page.getByRole("button", { name: "Validate only" }).click();
  await expect(
    page.getByRole("heading", { name: "Needs attention" }),
  ).toBeVisible();
  await expect(page.getByText("MCF_PATH_TRAVERSAL")).toBeVisible();
  await expect(page.getByText(/Unsafe archive entry/)).toBeVisible();
});
