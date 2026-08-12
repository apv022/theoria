import { expect, test } from "@playwright/test";

test("desktop routes share one canonical application shell", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of [
    "/",
    "/explore",
    "/library",
    "/studio",
    "/studio?tool=compiler",
  ]) {
    await page.goto(route);
    await expect(page.locator(".app-shell")).toHaveCount(1);
    await expect(page.locator(".app-sidebar")).toBeVisible();
    await expect(page.locator(".app-sidebar-primary")).toHaveCount(1);
    await expect(page.locator(".app-sidebar-primary a")).toHaveCount(4);
    await expect(page.locator(".app-menu-button")).toBeHidden();
    await expect(
      page.locator(
        ".site-header, .reader-header, .studio-header, .compiler-header",
      ),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      route,
    ).toBeLessThanOrEqual(1440);
    await page.evaluate(() =>
      scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect(page.locator(".app-header")).toBeVisible();
  }
});

test("desktop sidebar collapse persists across navigation and reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/explore");
  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-sidebar-collapsed",
    "true",
  );
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-sidebar-collapsed",
    "true",
  );
  await page.getByRole("button", { name: "Expand navigation" }).click();
  await expect(page.locator(".app-shell")).not.toHaveAttribute(
    "data-sidebar-collapsed",
    "true",
  );
});

test("mobile public shell uses one drawer with Escape and focus recovery", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/explore");

  const menuButton = page.getByRole("button", { name: "Menu" });
  await expect(menuButton).toBeVisible();
  await menuButton.click();
  await expect(page.locator(".app-sidebar[data-open]")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Home", exact: true }),
  ).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.locator(".app-sidebar[data-open]")).toHaveCount(0);
  await expect(menuButton).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("appearance control moves into the mobile drawer without duplication", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/explore");
  await expect(page.locator(".desktop-theme-control")).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  const mobileTheme = page.locator(".mobile-theme-control").getByLabel("Theme");
  await expect(mobileTheme).toBeVisible();
  await mobileTheme.selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator(".mobile-theme-control")).toBeHidden();
  await expect(page.locator(".desktop-theme-control")).toBeVisible();
});
