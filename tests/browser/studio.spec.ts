import { expect, test, type Page } from "@playwright/test";

const fixtureRoot = `${process.cwd()}/fixtures/local`;
const featureFixture = `${fixtureRoot}/feature-showcase.mcf.zip`;
const mcf10Fixture = `${fixtureRoot}/minimal-1.0`;

async function createCourse(page: Page) {
  await page.goto("/studio");
  await page.getByLabel("Package title").fill("Pilot Course");
  await page.getByLabel("Package kind").selectOption("course");
  await page.getByRole("button", { name: "Create package" }).click();
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await expect(page.getByText("valid", { exact: true })).toBeVisible();
}

test("Creation Studio shell controls retain contrast and full source paths remain readable", async ({
  page,
}) => {
  await createCourse(page);
  const colors = await page.locator(".app-sidebar").evaluate((sidebar) => {
    const link = sidebar.querySelector("a");
    return {
      background: getComputedStyle(sidebar).backgroundColor,
      foreground: getComputedStyle(sidebar).color,
      link: link ? getComputedStyle(link).color : "",
    };
  });
  expect(colors).toEqual({
    background: "rgb(17, 23, 19)",
    foreground: "rgb(241, 245, 240)",
    link: "rgb(241, 245, 240)",
  });
  const lessonSource = page.getByRole("button", {
    name: "chapters/introduction/lessons/welcome.mcf",
  });
  await expect(lessonSource).toHaveAttribute(
    "title",
    "chapters/introduction/lessons/welcome.mcf",
  );
  const pathStyles = await lessonSource.evaluate((button) => ({
    whiteSpace: getComputedStyle(button).whiteSpace,
    overflowWrap: getComputedStyle(button).overflowWrap,
  }));
  expect(pathStyles).toEqual({
    whiteSpace: "normal",
    overflowWrap: "anywhere",
  });
});

test("Studio creation and primary actions fit a narrow touch viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await createCourse(page);
  await expect(page.getByRole("button", { name: "content" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export source" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
});

test("an opened Studio draft remains editable when the app shell is offline", async ({
  page,
  context,
}) => {
  await createCourse(page);
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
    await page.getByRole("button", { name: "metadata", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "Pilot Course",
    );
  } finally {
    await context.setOffline(false);
  }
});

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
    .setInputFiles(featureFixture);
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
    page.getByRole("heading", { name: /Which value equals/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "preview", exact: true }).click();
  await page.getByRole("button", { name: "Build preview" }).click();
  const preview = page.frameLocator('iframe[title="Theoria reader preview"]');
  await expect(
    preview.getByRole("heading", { name: "Core features", exact: true }),
  ).toBeVisible();
  await expect(
    preview.locator(".reader-header, .site-header, .site-footer"),
  ).toHaveCount(0);
  await expect(
    preview.locator('a[href^="/read"], a[href="/library"], a[href="/studio"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('iframe[title="Theoria reader preview"]'),
  ).toHaveAttribute("src", /\/preview\//);
  const compiled = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export compiled ZIP" }).click();
  await expect((await compiled).suggestedFilename()).toMatch(/compiled\.zip$/);
});

test("assets, math, isolated preview, export/import, and Reader survive the complete local journey", async ({
  page,
}) => {
  await createCourse(page);
  const draftUrl = page.url();
  await page.getByRole("button", { name: "assets", exact: true }).click();
  await page
    .getByText("Add local assets")
    .locator("..")
    .locator('input[type="file"]')
    .setInputFiles([
      {
        name: "diagram final.png",
        mimeType: "image/png",
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
      },
      {
        name: "diagram final.png",
        mimeType: "application/octet-stream",
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 4, 5, 6]),
      },
      {
        name: "photo.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from([0xff, 0xd8, 0xff, 7, 8, 9]),
      },
      {
        name: "safe.svg",
        mimeType: "image/svg+xml",
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
        ),
      },
    ]);
  await expect(
    page.getByText("4 assets added without changing existing files."),
  ).toBeVisible();
  for (const id of ["diagram-final", "diagram-final-2", "photo", "safe"])
    await expect(page.getByText(id, { exact: true })).toBeVisible();
  await expect(
    page.locator(".asset-grid code", { hasText: "assets/diagram final.png" }),
  ).toBeVisible();
  await expect(
    page.locator(".asset-grid code", {
      hasText: "assets/diagram final-2.png",
    }),
  ).toBeVisible();
  await expect(page.getByText("valid", { exact: true })).toBeVisible();

  const diagramCard = page.locator(".asset-grid article").filter({
    has: page.getByText("diagram-final", { exact: true }),
  });
  await diagramCard
    .getByText("Replace file")
    .locator("input")
    .setInputFiles({
      name: "updated diagram.png",
      mimeType: "image/png",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 10, 11, 12]),
    });
  await expect(page.getByText(/diagram-final was replaced/)).toBeVisible();
  await expect(
    diagramCard.getByText("assets/updated diagram.png"),
  ).toBeVisible();
  await expect(page.getByText("valid", { exact: true })).toBeVisible();

  const svgCard = page.locator(".asset-grid article").filter({
    has: page.getByText("safe", { exact: true }),
  });
  page.once("dialog", (dialog) => dialog.accept());
  await svgCard.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("safe", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "content", exact: true }).click();
  await page
    .getByLabel("CommonMark content")
    .fill(
      [
        "# Asset and math",
        "",
        "![Diagram](asset:diagram-final)",
        "",
        "$4^3=64$ $x_1+x_2$ $\\frac{1}{2}$ $\\sqrt{x}$ $12\\times4$ $50\\%$",
        "",
        "$$",
        "f(x)=x^2",
        "$$",
        "",
        "Escaped \\$5 and `inline $code$`.",
        "",
        "```text",
        "$fenced$",
        "```",
        "",
        "Malformed $\\frac{1}$.",
        "",
        "*Emphasis $x+y$* and multiple $a$ then $b$.",
      ].join("\n"),
    );
  await expect(page.getByText("Saved locally")).toBeVisible();
  await expect(page.getByText("valid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "preview", exact: true }).click();
  await page.getByRole("button", { name: "Build preview" }).click();
  const iframe = page.locator('iframe[title="Theoria reader preview"]');
  const preview = page.frameLocator('iframe[title="Theoria reader preview"]');
  await expect(
    preview.getByRole("heading", { name: "Asset and math" }),
  ).toBeVisible();
  await expect(preview.getByRole("img", { name: "Diagram" })).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await expect(preview.locator(".katex")).toHaveCount(10);
  await expect(preview.locator(".katex-html").first()).toBeVisible();
  await expect(
    preview.locator(".reader-header, .site-header, .site-footer"),
  ).toHaveCount(0);
  const mathAccessibilityStyle = await preview
    .locator(".katex-mathml")
    .first()
    .evaluate((element) => ({
      position: getComputedStyle(element).position,
      overflow: getComputedStyle(element).overflow,
    }));
  expect(mathAccessibilityStyle).toEqual({
    position: "absolute",
    overflow: "hidden",
  });
  const previewPath = await iframe.evaluate(
    (element: HTMLIFrameElement) =>
      element.contentWindow?.location.pathname ?? "",
  );
  expect(previewPath).toMatch(/^\/preview\//);

  await page.getByRole("button", { name: "Exit preview" }).click();
  await expect(page).toHaveURL(draftUrl);
  await expect(page.getByLabel("CommonMark content")).toHaveValue(
    /asset:diagram-final/,
  );
  const sourceDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export source" }).click();
  const downloaded = await sourceDownload;
  const downloadedPath = await downloaded.path();
  expect(downloadedPath).toBeTruthy();

  const readerPath = previewPath.replace(/^\/preview\//, "/read/");
  await page.goto(readerPath);
  await expect(
    page.getByRole("heading", { name: "Asset and math" }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: "Diagram" })).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await expect(page.locator(".katex")).toHaveCount(10);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Asset and math" }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: "Diagram" })).toHaveAttribute(
    "src",
    /^blob:/,
  );
  await page.goto(draftUrl);
  await page.getByRole("button", { name: "content", exact: true }).click();
  await expect(page.getByLabel("CommonMark content")).toHaveValue(
    /asset:diagram-final/,
  );

  await page.goto("/studio");
  await page
    .locator('input[type="file"][accept*=".zip"]')
    .setInputFiles(downloadedPath!);
  await expect(
    page.getByText(/was imported without rewriting its source/),
  ).toBeVisible();
  await expect(page.locator(".draft-card")).toHaveCount(2);
});

test("Studio remains operable at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createCourse(page);
  await expect(page.locator(".creation-toolbar")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
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
    .setInputFiles(mcf10Fixture);
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
