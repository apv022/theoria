import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const fakeSupabase = "http://127.0.0.1:55431";

async function reset(page: Page) {
  await page.request.post(`${fakeSupabase}/__test/reset`);
}

async function signup(page: Page, handle = "sync_creator") {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`${handle}@example.test`);
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Display name").fill("Sync Creator");
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
}

async function login(page: Page, handle = "sync_creator") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(`${handle}@example.test`);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/settings$/);
}

async function createClaimedDraft(page: Page): Promise<string> {
  await page.goto("/studio");
  await page.getByLabel("Package title").fill("Private Sync Draft");
  await page.getByRole("button", { name: "Create package" }).click();
  await expect(page).toHaveURL(/\/studio\/[^/?#]+$/);
  const url = page.url();
  await page.getByRole("button", { name: "publish", exact: true }).click();
  await page
    .locator(".publish-panel")
    .getByRole("button", { name: "Claim local draft" })
    .click();
  await expect(page.getByText("Owned by @sync_creator")).toBeVisible();
  return url;
}

async function syncState(page: Page) {
  return page.request
    .get(`${fakeSupabase}/__test/sync-state`)
    .then((response) => response.json());
}

async function localOutbox(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("theoria", 5);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<unknown[]>((resolve, reject) => {
      const request = database
        .transaction("syncOutbox")
        .objectStore("syncOutbox")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

async function localSyncDebug(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("theoria", 5);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const values = (name: "syncOutbox" | "syncSettings") =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = database.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    return {
      settings: await values("syncSettings"),
      outbox: await values("syncOutbox"),
    };
  });
}

async function newSignedInDevice(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page);
  return { context, page };
}

test.beforeEach(async ({ page }) => reset(page));

test("first-device onboarding performs no upload before explicit consent", async ({
  page,
}) => {
  await signup(page);
  const draftUrl = await createClaimedDraft(page);
  await page.goto("/settings/sync");
  await expect(
    page.getByRole("heading", { name: "Choose what happens first" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row", { name: /Local drafts 1 0/ }),
  ).toBeVisible();
  expect((await syncState(page)).records).toHaveLength(0);

  await page.getByRole("button", { name: "Upload local data" }).click();
  await expect(page.getByText(/Sync complete:/)).toBeVisible();
  const remote = await syncState(page);
  expect(remote.records, JSON.stringify(await localOutbox(page))).toHaveLength(
    1,
  );
  await expect(page.getByText("Enabled", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "Disable sync on this device" })
    .click();
  await expect(page.getByText(/Local data was not deleted/)).toBeVisible();
  await page.goto(draftUrl);
  await expect(
    page.getByText("Private Sync Draft", { exact: true }),
  ).toBeVisible();
});

test("a second device downloads private remote-only data", async ({
  page,
  browser,
}) => {
  await signup(page);
  const draftUrl = await createClaimedDraft(page);
  await page.goto("/settings/sync");
  await page.getByRole("button", { name: "Upload local data" }).click();
  await expect(page.getByText(/Sync complete:/)).toBeVisible();

  const second = await newSignedInDevice(browser);
  await second.page.goto("/settings/sync");
  await expect(
    second.page.getByRole("row", { name: /Local drafts 0 1/ }),
  ).toBeVisible();
  await second.page
    .getByRole("button", { name: "Download cloud data" })
    .click();
  await expect(second.page.getByText(/1 downloaded/)).toBeVisible();
  await second.page.goto(new URL(draftUrl).pathname);
  await expect(
    second.page.getByText("Private Sync Draft", { exact: true }),
  ).toBeVisible();
  await second.context.close();
});

test("offline edits queue durably and resume after reconnect", async ({
  page,
  context,
}) => {
  await signup(page);
  const draftUrl = await createClaimedDraft(page);
  await page.goto("/settings/sync");
  await page.getByRole("button", { name: "Upload local data" }).click();
  await expect(page.getByText(/Sync complete:/)).toBeVisible();

  await page.goto(draftUrl);
  await context.setOffline(true);
  await page.getByRole("button", { name: "metadata", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Offline Draft Edit");
  await expect(page.getByText("Saved locally")).toBeVisible();
  await expect(page.getByText("Waiting to sync")).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event("online")));
  await expect(
    page.getByText("Synced"),
    JSON.stringify(await localSyncDebug(page)),
  ).toBeVisible({ timeout: 30_000 });
});

test("two-device draft conflicts preserve a labelled copy", async ({
  page,
  browser,
}) => {
  await signup(page);
  const draftUrl = await createClaimedDraft(page);
  await page.goto("/settings/sync");
  await page.getByRole("button", { name: "Upload local data" }).click();
  await expect(page.getByText(/Sync complete:/)).toBeVisible();
  await page.getByRole("button", { name: "Pause sync" }).click();

  const second = await newSignedInDevice(browser);
  await second.page.goto("/settings/sync");
  await second.page
    .getByRole("button", { name: "Download cloud data" })
    .click();
  await expect(second.page.getByText(/1 downloaded/)).toBeVisible();
  await second.page.getByRole("button", { name: "Pause sync" }).click();

  await second.page.goto(new URL(draftUrl).pathname);
  await second.page
    .getByRole("button", { name: "metadata", exact: true })
    .click();
  await second.page
    .getByLabel("Title", { exact: true })
    .fill("Second Device Edit");
  await expect(second.page.getByText("Saved locally")).toBeVisible();

  await page.goto(draftUrl);
  await page.getByRole("button", { name: "metadata", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("First Device Edit");
  await expect(page.getByText("Saved locally")).toBeVisible();
  await page.goto("/settings/sync");
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText(/Sync complete:/)).toBeVisible();

  await second.page.goto("/settings/sync");
  await second.page.getByRole("button", { name: "Sync now" }).click();
  await expect(
    second.page.getByRole("heading", { name: "1 needs review" }),
  ).toBeVisible();
  await second.page
    .getByRole("link", { name: "Inspect conflict copy" })
    .click();
  await expect(second.page.getByText(/conflict copy/i).first()).toBeVisible();
  await second.context.close();
});
