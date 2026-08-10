import { expect, test } from "@playwright/test";

const sizes = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
] as const;

test("homepage is a compact dashboard with predictable navigation", async ({
  page,
}) => {
  await page.goto("/");
  const header = page.locator(".app-header");
  await expect(header).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Discover, learn, and create portable courses.",
    }),
  ).toBeVisible();
  const quickActions = page.getByRole("navigation", { name: "Quick actions" });
  await expect(
    quickActions.getByRole("link", { name: "Open Library" }),
  ).toBeVisible();
  await expect(
    quickActions.getByRole("link", { name: "Create a course" }),
  ).toBeVisible();
  const metrics = await page.evaluate(() => ({
    header: document.querySelector(".app-header")?.getBoundingClientRect()
      .height,
    heading: Number.parseFloat(
      getComputedStyle(document.querySelector(".dashboard-intro h1")!).fontSize,
    ),
    horizontalOverflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  }));
  expect(metrics.header).toBeLessThanOrEqual(72);
  expect(metrics.heading).toBeLessThanOrEqual(52);
  expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1);

  await page
    .getByRole("link", { name: "Explore", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/explore/);
  await expect(
    page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Explore" }),
  ).toHaveAttribute("aria-current", "page");
});

test("theme selection persists across reloads", async ({ page }) => {
  await page.goto("/");
  const theme = page.locator(".platform-utilities").getByLabel(/Theme/);
  await theme.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    )
    .toBe("rgb(16, 20, 17)");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(theme).toHaveAttribute("aria-label", /switch to light mode/);

  await page.emulateMedia({ colorScheme: "dark" });
  await theme.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("saved dark theme is applied by the initial document", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("theoria-theme", "dark"));
  await page.goto("/library", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute(
    "data-theme-preference",
    "dark",
  );
});

test("onboarding is dismissible, shown once, and reopenable from Help", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Learn and create locally first." }),
  ).toBeVisible();
  const onboarding = page.locator(".onboarding-panel");
  await expect(onboarding.getByText(/without an account/)).toBeVisible();
  await expect(onboarding.getByText(/requires consent/)).toBeVisible();
  await page.getByRole("button", { name: "Got it" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Learn and create locally first." }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Help" }).click();
  await expect(
    page.getByRole("heading", { name: "Learn and create locally first." }),
  ).toBeVisible();
});

test("manifest, metadata, and permanent SVG mark are wired together", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await expect(
    page.locator('.app-header .brand img[src*="theoria-mark.svg"]'),
  ).toBeVisible();
  const manifest = await page.evaluate(async () =>
    fetch("/manifest.webmanifest").then((response) => response.json()),
  );
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
    expect.arrayContaining(["any", "192x192", "512x512"]),
  );
});

test("visited Library app shell reopens offline without touching local data", async ({
  page,
  context,
}) => {
  await page.goto("/library");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Your library" }),
    ).toBeVisible();
    await expect(page.getByText("Your shelf is ready.")).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("global surfaces fit all required mobile viewports", async ({ page }) => {
  for (const size of sizes) {
    await page.setViewportSize(size);
    for (const route of [
      "/",
      "/explore",
      "/library",
      "/studio",
      "/studio?tool=compiler",
    ]) {
      await page.goto(route);
      await expect(page.locator(".app-header")).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `${route} at ${size.width}px`).toBeLessThanOrEqual(1);
      await expect(page.locator(".app-menu-button:visible")).toBeVisible();
    }
    await page.locator(".app-menu-button:visible").click();
    await expect(page.locator(".app-sidebar[data-open]")).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Primary navigation" })
        .getByRole("link"),
    ).toHaveCount(4);
    await page.keyboard.press("Escape");
  }
});

test("mobile navigation dismisses predictably and restores focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/explore");
  const trigger = page.locator(".app-menu-button");
  await trigger.click();
  await expect(page.locator(".app-sidebar[data-open]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".app-sidebar[data-open]")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("link", { name: "Learn" })
    .click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.locator(".app-sidebar[data-open]")).toHaveCount(0);
});
