import { expect, test, type Page, type Route } from "@playwright/test";

const fakeSecret = "sk-or-v1-fake-browser-secret";
const corsHeaders = {
  "access-control-allow-origin": "http://127.0.0.1:3000",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

async function jsonRoute(route: Route, value: unknown, status = 200) {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders });
    return;
  }
  await route.fulfill({
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

async function mockConnectedOpenRouter(page: Page) {
  const authorizationHeaders: string[] = [];
  let models = [
    { id: "example/beta", name: "Beta model", context_length: 8192 },
    { id: "example/alpha", name: "Alpha model", context_length: 4096 },
  ];
  await page.route("https://openrouter.ai/auth?**", async (route) => {
    const authorization = new URL(route.request().url());
    const callback = new URL(authorization.searchParams.get("callback_url")!);
    expect(authorization.searchParams.get("code_challenge_method")).toBe(
      "S256",
    );
    expect(authorization.searchParams.get("code_challenge")).toMatch(
      /^[\w-]{43}$/,
    );
    expect(callback.origin).toBe("http://127.0.0.1:3000");
    expect(callback.pathname).toBe("/settings/ai-providers");
    expect(callback.searchParams.get("state")).toBeTruthy();
    callback.searchParams.set("code", "short-lived-browser-code");
    await route.fulfill({
      contentType: "text/html",
      body: `<script>location.replace(${JSON.stringify(callback.toString())})</script>`,
    });
  });
  await page.route("https://openrouter.ai/api/v1/auth/keys", async (route) => {
    if (route.request().method() !== "OPTIONS") {
      const body = route.request().postDataJSON();
      expect(body).toMatchObject({
        code: "short-lived-browser-code",
        code_challenge_method: "S256",
      });
      expect(body.code_verifier).toMatch(/^[\w-]{43}$/);
      expect(route.request().headers().authorization).toBeUndefined();
    }
    await jsonRoute(route, { key: fakeSecret });
  });
  await page.route("https://openrouter.ai/api/v1/key", async (route) => {
    if (route.request().method() !== "OPTIONS")
      authorizationHeaders.push(route.request().headers().authorization ?? "");
    await jsonRoute(route, {
      data: {
        label: "Theoria device",
        limit: 25,
        limit_remaining: 17.25,
        limit_reset: "monthly",
      },
    });
  });
  await page.route("https://openrouter.ai/api/v1/models", async (route) => {
    if (route.request().method() !== "OPTIONS")
      authorizationHeaders.push(route.request().headers().authorization ?? "");
    await jsonRoute(route, {
      data: models,
    });
  });
  return {
    authorizationHeaders,
    removeBetaModel() {
      models = models.filter((model) => model.id !== "example/beta");
    },
  };
}

test("OpenRouter PKCE connect, model selection, persistence, and disconnect stay local", async ({
  page,
}) => {
  const consoleMessages: string[] = [];
  page.on("console", (message) => consoleMessages.push(message.text()));
  const openRouter = await mockConnectedOpenRouter(page);

  await page.goto("/settings/ai-providers");
  await expect(page.getByText("OpenRouter not connected")).toBeVisible();
  await page.getByRole("button", { name: "Connect OpenRouter" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3000/settings/ai-providers");
  await expect(page.getByText("Connected to OpenRouter")).toBeVisible();
  await expect(page.getByText("17.25 OpenRouter credits")).toBeVisible();
  expect(page.url()).not.toContain("code=");
  expect(page.url()).not.toContain("state=");

  await expect(page.getByText("Alpha model", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Change model" }).click();
  await page.getByLabel("Search models").fill("beta");
  await page.getByLabel("OpenRouter model").selectOption("example/beta");
  await expect(page.getByText("Beta model", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Connected to OpenRouter")).toBeVisible();
  await expect(page.getByText("Beta model", { exact: true })).toBeVisible();
  expect(openRouter.authorizationHeaders).toContain(`Bearer ${fakeSecret}`);
  expect(consoleMessages.join("\n")).not.toContain(fakeSecret);
  expect(await page.locator("body").innerText()).not.toContain(fakeSecret);

  openRouter.removeBetaModel();
  await page.reload();
  await expect(page.getByText("Alpha model", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "previously selected model is unavailable",
  );

  const localState = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("theoria");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const credential = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction(
        "providerCredentials",
        "readonly",
      );
      const request = transaction
        .objectStore("providerCredentials")
        .get("openrouter");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const syncRecords = await new Promise<number>((resolve, reject) => {
      const transaction = database.transaction("syncRecords", "readonly");
      const request = transaction.objectStore("syncRecords").count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return { credential, syncRecords };
  });
  expect(localState).toMatchObject({
    credential: { providerId: "openrouter", selectedModelId: "example/alpha" },
    syncRecords: 0,
  });

  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByText("OpenRouter not connected")).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const database = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open("theoria");
        request.onsuccess = () => resolve(request.result);
      });
      return new Promise<boolean>((resolve) => {
        const request = database
          .transaction("providerCredentials", "readonly")
          .objectStore("providerCredentials")
          .get("openrouter");
        request.onsuccess = () => {
          database.close();
          resolve(request.result === undefined);
        };
      });
    }),
  ).toBe(true);
});

test("invalid manual keys are rejected without leaking or retaining them", async ({
  page,
}) => {
  await page.route("https://openrouter.ai/api/v1/key", async (route) => {
    await jsonRoute(
      route,
      {
        error: {
          message: `unsafe ${fakeSecret}`,
          metadata: { error_type: "authentication" },
        },
      },
      401,
    );
  });
  await page.goto("/settings/ai-providers");
  await page.getByText("Advanced").click();
  await page.getByLabel("Paste OpenRouter API key").fill(fakeSecret);
  await page.getByRole("button", { name: "Save API key" }).click();

  await expect(
    page.locator(".provider-settings").getByRole("alert"),
  ).toContainText("invalid, expired, or revoked");
  expect(await page.locator("body").innerText()).not.toContain(fakeSecret);
  await expect(page.getByLabel("Paste OpenRouter API key")).toHaveValue("");
});

test("AI provider settings remain usable at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto("/settings/ai-providers");
  await expect(
    page.getByRole("heading", { name: "AI providers" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect OpenRouter" }),
  ).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});
