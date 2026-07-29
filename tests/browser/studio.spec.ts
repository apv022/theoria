import { expect, test, type Page } from "@playwright/test";

async function createCourse(page: Page) {
  await page.goto("/studio");
  await page.getByLabel("Package title").fill("Pilot Course");
  await page.getByLabel("Package kind").selectOption("course");
  await page.getByRole("button", { name: "Create package" }).click();
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await expect(page.getByText("valid", { exact: true })).toBeVisible();
}

test("creates, visually edits, autosaves, reloads, and exports a course draft", async ({
  page,
}) => {
  await createCourse(page);
  await page.getByRole("button", { name: "metadata", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Pilot Course Revised");
  await expect(page.getByText("Saved locally")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Pilot Course Revised",
  );
  await page.getByRole("button", { name: "content", exact: true }).click();
  await page.getByRole("button", { name: "Add lesson" }).click();
  await expect(page.getByLabel("Lesson title")).toHaveValue("New lesson");
  await page.getByLabel("Lesson title").fill("Second lesson");
  await expect(page.getByText("Saved locally")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export source" }).click();
  await expect((await download).suggestedFilename()).toMatch(/\.mcf\.zip$/);
});

test("applies direct source edits through the real parser without silent visual overwrite", async ({
  page,
}) => {
  await createCourse(page);
  await page.getByRole("button", { name: "source", exact: true }).click();
  const editor = page.locator("#source-editor");
  await expect(editor).toContainText("title: Pilot Course");
  await editor.fill(
    (await editor.inputValue()).replace(
      "title: Pilot Course",
      "title: Source Edited Course",
    ),
  );
  await expect(page.getByText("Unapplied changes")).toBeVisible();
  await page.getByRole("button", { name: "Apply and validate" }).click();
  await expect(page.getByText("valid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "metadata", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Source Edited Course",
  );
});

test("imports feature source losslessly, exposes the regeneration boundary, and previews in the real reader", async ({
  page,
}) => {
  await page.goto("/studio");
  await page
    .locator('input[type="file"][accept*=".zip"]')
    .setInputFiles(
      "/home/apv/examplecourses/archives/feature-showcase.mcf.zip",
    );
  await expect(
    page.getByRole("heading", { name: "MCF 1.1 Feature Showcase" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open draft" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Imported source is preserved exactly.",
    }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Enable visual editing" }).click();
  await page.getByRole("button", { name: "questions", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose A.", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "preview", exact: true }).click();
  await page.getByRole("button", { name: "Build preview" }).click();
  const preview = page.frameLocator('iframe[title="Theoria reader preview"]');
  await expect(
    preview.getByRole("heading", { name: "Core features", exact: true }),
  ).toBeVisible();
  const compiled = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export compiled ZIP" }).click();
  await expect((await compiled).suggestedFilename()).toMatch(/compiled\.zip$/);
});

test("Studio remains operable at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createCourse(page);
  await expect(page.locator(".creation-toolbar")).toBeVisible();
  await page.getByRole("button", { name: "questions", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "+ multiple choice" }),
  ).toBeVisible();
});

test("imports an MCF 1.0 package directory without converting its version", async ({
  page,
}) => {
  await page.goto("/studio");
  await page
    .getByText("Import package directory")
    .locator("input")
    .setInputFiles("/home/apv/mcf-samples/minimal");
  const card = page.locator(".draft-card").filter({ hasText: "MCF 1.0" });
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "Open draft" }).click();
  await expect(page.getByText("course · MCF 1.0")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Imported source is preserved exactly.",
    }),
  ).toBeVisible();
});
