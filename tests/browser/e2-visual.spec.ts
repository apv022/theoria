import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";

const fakeSupabase = "http://127.0.0.1:55431";
const output = `${process.cwd()}/.verification/e2-screenshots`;
const widths = [390, 768, 1024, 1440] as const;
const cors = {
  "access-control-allow-origin": "http://127.0.0.1:3000",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

async function capture(page: Page, name: string) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 768 ? 900 : 1000 });
    await page.evaluate(() => {
      scrollTo(0, 0);
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    });
    await page.screenshot({
      path: `${output}/${name}-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
}

async function json(route: Route, value: unknown, status = 200) {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: cors });
    return;
  }
  await route.fulfill({
    status,
    headers: { ...cors, "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

async function signup(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill("visual_author@example.test");
  await page.getByLabel("Handle").fill("visual_author");
  await page.getByLabel("Display name").fill("Visual Author");
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
}

test("capture E2 Creation states at required breakpoints", async ({ page }) => {
  await mkdir(output, { recursive: true });
  await page.request.post(`${fakeSupabase}/__test/reset`);

  await page.goto("/studio/factory");
  await capture(page, "factory-disconnected");

  await page.route("https://openrouter.ai/api/v1/key", (route) =>
    json(route, { data: { label: "Visual test", limit_remaining: 12 } }),
  );
  await page.route("https://openrouter.ai/api/v1/models", (route) =>
    json(route, { data: [{ id: "example/model", name: "Example model" }] }),
  );
  await page.route("https://openrouter.ai/api/v1/chat/completions", (route) =>
    json(route, {
      model: "example/model",
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              title: "Coastal systems",
              description: "A review-ready generated course.",
              chapters: [
                {
                  title: "Coastal foundations",
                  lessons: [
                    {
                      title: "Waves and shores",
                      description: "Connect wave action and shoreline form.",
                      sections: [
                        {
                          title: "Reading a shoreline",
                          content:
                            "# Reading a shoreline\n\nObserve form, material, and wave energy.",
                        },
                      ],
                    },
                  ],
                },
              ],
            }),
          },
        },
      ],
      usage: { cost: 0.003 },
    }),
  );
  await page.goto("/settings/ai-providers");
  await page.getByText("Advanced").click();
  await page
    .getByLabel("Paste OpenRouter API key")
    .fill("sk-or-v1-visual-test");
  await page.getByRole("button", { name: "Save API key" }).click();
  await expect(page.getByText("Connected to OpenRouter")).toBeVisible();
  await page.goto("/studio/factory");
  await capture(page, "factory-connected");

  await page.getByLabel("Title").fill("Coastal systems");
  await page.getByLabel("Subject or topic").fill("Earth science");
  await page
    .getByLabel("Creator instructions")
    .fill("Create a concise course grounded in the supplied observations.");
  await page
    .getByLabel("Pasted text or Markdown")
    .fill("Wave energy and sediment supply influence shoreline form.");
  await page.getByRole("button", { name: "Generate course draft" }).click();
  await expect(page.getByText("Validated MCF 1.1")).toBeVisible();
  await capture(page, "factory-generated-result");

  await page.goto("/studio/batch-upload");
  await capture(page, "batch-empty");
  await page.locator('input[type="file"]').setInputFiles([
    {
      name: "minimal.mcf.zip",
      mimeType: "application/zip",
      buffer: await readFile(
        `${process.cwd()}/fixtures/local/minimal-1.1.mcf.zip`,
      ),
    },
    {
      name: "module.mcf.zip",
      mimeType: "application/zip",
      buffer: await readFile(
        `${process.cwd()}/fixtures/local/standalone-module.mcf.zip`,
      ),
    },
    {
      name: "invalid.mcf.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("not a zip"),
    },
  ]);
  await expect(
    page.getByRole("button", { name: "Publish selected (2)" }),
  ).toBeVisible();
  await capture(page, "batch-populated");

  await signup(page);
  await page.goto("/studio/batch-upload");
  await page.locator('input[type="file"]').setInputFiles([
    {
      name: "lesson.mcf.zip",
      mimeType: "application/zip",
      buffer: await readFile(
        `${process.cwd()}/fixtures/local/standalone-lesson.mcf.zip`,
      ),
    },
    {
      name: "module.mcf.zip",
      mimeType: "application/zip",
      buffer: await readFile(
        `${process.cwd()}/fixtures/local/standalone-module.mcf.zip`,
      ),
    },
  ]);
  await expect(
    page.getByRole("button", { name: "Publish selected (2)" }),
  ).toBeEnabled();
  await page.request.post(`${fakeSupabase}/__test/fail-upload`);
  await page.getByRole("button", { name: "Publish selected (2)" }).click();
  await expect(page.getByText("Failed", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Published", { exact: true })).toHaveCount(1);
  await capture(page, "batch-mixed-result");

  await page.goto("/studio");
  await capture(page, "creation-navigation");
});
