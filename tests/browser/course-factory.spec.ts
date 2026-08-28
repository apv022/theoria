import { expect, test, type Page, type Route } from "@playwright/test";

const fakeSupabase = "http://127.0.0.1:55431";
const fakeSecret = "sk-or-v1-factory-browser-secret";
const cors = {
  "access-control-allow-origin": "http://127.0.0.1:3000",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

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

async function connectProvider(page: Page) {
  await page.route("https://openrouter.ai/api/v1/key", (route) =>
    json(route, { data: { label: "Factory tests", limit_remaining: 8 } }),
  );
  await page.route("https://openrouter.ai/api/v1/models", (route) =>
    json(route, {
      data: [
        { id: "example/large", name: "Large model" },
        { id: "example/small", name: "Small model" },
      ],
    }),
  );
  await page.goto("/settings/ai-providers");
  await page.getByText("Advanced").click();
  await page.getByLabel("Paste OpenRouter API key").fill(fakeSecret);
  await page.getByRole("button", { name: "Save API key" }).click();
  await expect(page.getByText("Connected to OpenRouter")).toBeVisible();
}

async function fillBrief(page: Page) {
  await page.getByLabel("Title").fill("Climate foundations");
  await page.getByLabel("Subject or topic").fill("Earth science");
  await page
    .getByLabel("Description")
    .fill("A grounded introduction to weather and climate.");
  await page.getByLabel("Intended learner or level").fill("Beginner");
  await page
    .getByLabel("Creator instructions")
    .fill("Build one short chapter with a focused explanatory lesson.");
  await page
    .getByLabel("Pasted text or Markdown")
    .fill("Climate describes long-term weather patterns.");
}

const candidate = {
  title: "Climate foundations",
  description: "A grounded introduction.",
  chapters: [
    {
      title: "Foundations",
      lessons: [
        {
          title: "Weather and climate",
          description: "Compare weather and climate.",
          sections: [
            {
              title: "Patterns over time",
              content:
                "# Patterns over time\n\nClimate describes weather patterns observed across long periods.",
            },
          ],
        },
      ],
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.request.post(`${fakeSupabase}/__test/reset`);
});

test("Factory requires a provider while Studio and Batch Upload remain available", async ({
  page,
}) => {
  await page.goto("/studio/factory");
  await expect(page.getByText("OpenRouter · not connected")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Connect OpenRouter" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate course draft" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "Studio", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Creation Studio" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Batch Upload" }).click();
  await expect(
    page.getByRole("heading", { name: "Batch Upload" }),
  ).toBeVisible();
});

test("structured provider output validates as MCF 1.1 and opens in Studio without publishing", async ({
  page,
}) => {
  await connectProvider(page);
  let generationBody: Record<string, unknown> | undefined;
  await page.route(
    "https://openrouter.ai/api/v1/chat/completions",
    async (route) => {
      if (route.request().method() !== "OPTIONS")
        generationBody = route.request().postDataJSON();
      await json(route, {
        model: "example/small",
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(candidate) },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 200,
          total_tokens: 300,
          cost: 0.004,
        },
      });
    },
  );
  await page.goto("/studio/factory");
  await page.getByLabel("Model").selectOption("example/small");
  await fillBrief(page);
  await page.getByRole("button", { name: "Generate course draft" }).click();

  await expect(page.getByText("Validated MCF 1.1")).toBeVisible();
  await expect(
    page.getByText("AI-generated draft — review before publishing."),
  ).toBeVisible();
  await expect(
    page.getByText("Provider-reported cost: 0.004 OpenRouter credits"),
  ).toBeVisible();
  expect(generationBody?.model).toBe("example/small");
  expect(JSON.stringify(generationBody)).not.toContain(fakeSecret);
  const counts = await page.request
    .get(`${fakeSupabase}/__test/request-counts`)
    .then((response) => response.json());
  expect(counts["/rest/v1/rpc/publish_package_version"] ?? 0).toBe(0);

  await page.getByRole("link", { name: "Open in Studio" }).click();
  await expect(page).toHaveURL(/\/studio\/[a-z0-9-]+/);
  await expect(
    page.getByText("Climate foundations", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Saved locally")).toBeVisible();
});

test("revoked provider failure preserves the creator brief and supports recovery", async ({
  page,
}) => {
  await connectProvider(page);
  await page.route("https://openrouter.ai/api/v1/chat/completions", (route) =>
    json(
      route,
      {
        error: {
          message: `unsafe ${fakeSecret}`,
          metadata: { error_type: "authentication" },
        },
      },
      401,
    ),
  );
  await page.goto("/studio/factory");
  await fillBrief(page);
  await page.getByRole("button", { name: "Generate course draft" }).click();
  await expect(
    page.locator(".factory-run-panel").getByRole("alert"),
  ).toContainText("rejected this credential");
  await expect(
    page.getByRole("link", { name: "Connect OpenRouter" }),
  ).toBeVisible();
  await expect(page.getByLabel("Creator instructions")).toHaveValue(
    "Build one short chapter with a focused explanatory lesson.",
  );
  expect(await page.locator("body").innerText()).not.toContain(fakeSecret);
  await page.reload();
  await expect(page.getByLabel("Title")).toHaveValue("Climate foundations");
});

test("Factory remains usable at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/studio/factory");
  await expect(
    page.getByRole("heading", { name: "Course Factory" }),
  ).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});
