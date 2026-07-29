import { expect, test } from "@playwright/test";
import { zipSync } from "fflate";

const fixture10 = "/home/apv/mcf-samples/minimal";
const fixture11 = "/home/apv/examplecourses/archives/minimal.mcf.zip";
const masterclass = "/home/apv/mcf-authoring-masterclass.mcf.zip";

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
  await expect(page.getByTitle("Compiled package preview")).toBeVisible();
  await expect(page.getByText("Minimal MCF Course").last()).toBeVisible();
});

test("imports and compiles an MCF 1.0 package directory", async ({ page }) => {
  await page.locator('input[type="file"]').nth(1).setInputFiles(fixture10);
  await page.getByRole("button", { name: "Compile package" }).click();
  await expect(
    page.getByRole("heading", { name: "Package ready" }),
  ).toBeVisible();
  await expect(page.getByText("MCF 1.0 · course")).toBeVisible();
  await expect(page.getByTitle("Compiled package preview")).toBeVisible();
  await page.getByRole("button", { name: "Add to library" }).click();
  await page.goto("/library");
  await page.getByRole("link", { name: "Start learning" }).click();
  await expect(page.locator(".reader-lesson")).toBeVisible();
});

test("keeps the UI responsive while compiling the MCF 1.1 masterclass", async ({
  page,
}) => {
  await page.locator('input[type="file"]').first().setInputFiles(masterclass);
  await page.getByRole("button", { name: "Compile package" }).click();
  await expect(page.locator(".compiler-header")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Package ready" }),
  ).toBeVisible();
  await expect(
    page.getByText("10 lessons · 30 activities · 74 questions"),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Compilation history" }),
  ).toBeVisible();
  await expect(page.getByText("Authoring MCF Courses").last()).toBeVisible();
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
