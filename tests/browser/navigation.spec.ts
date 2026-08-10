import { expect, test } from "@playwright/test";

test("desktop public shell has one primary navigation and no duplicate mobile menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/explore");

  await expect(page.locator(".site-sidebar")).toBeVisible();
  await expect(page.locator(".site-sidebar-primary")).toHaveCount(1);
  await expect(page.locator(".site-sidebar-primary a")).toHaveCount(4);
  await expect(page.locator(".site-menu-button")).toBeHidden();
  await expect(page.locator(".platform-mobile-menu")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    1440,
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
  await expect(page.locator(".site-sidebar[data-open]")).toBeVisible();
  await expect(page.getByRole("link", { name: "Home", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.locator(".site-sidebar[data-open]")).toHaveCount(0);
  await expect(menuButton).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    390,
  );
});
