import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";

const canonicalLearningFixtures = [
  "/home/apv/examplecourses/archives/standalone-module.mcf.zip",
  "/home/apv/examplecourses/archives/standalone-lesson.mcf.zip",
  "/home/apv/examplecourses/archives/feature-showcase.mcf.zip",
].every(existsSync);

test.beforeEach((fixtures, testInfo) => {
  void fixtures;
  if (!canonicalLearningFixtures && testInfo.title.includes("standalone")) {
    testInfo.skip();
  }
});

const small = "/home/apv/theoria/fixtures/local/minimal-1.1.mcf.zip";

async function importSmall(page: Page) {
  await page.goto("/library");
  await page.locator('input[type="file"]').setInputFiles(small);
  await expect(
    page.getByRole("heading", { name: "Minimal MCF Course" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Start learning" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("This is the smallest useful MCF 1.1 course."),
  ).toBeVisible();
}

test("source import validates into the library and resumes exact progress", async ({
  page,
}) => {
  await importSmall(page);
  await page.getByRole("button", { name: "Mark notes complete" }).click();
  await expect(page.getByText("Lesson complete")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Lesson complete")).toBeVisible();
  await page.getByRole("link", { name: "Exit reader" }).click();
  await expect(
    page.getByText("Complete", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue learning" }),
  ).toBeVisible();
});

test("compiler output can be referenced by the library and opened in the reader", async ({
  page,
}) => {
  await page.goto("/compile");
  await expect(page.getByText(/Worker ready · MCF 1.0 \+ 1.1/)).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles(small);
  await page.getByRole("button", { name: "Compile package" }).click();
  await expect(
    page.getByRole("heading", { name: "Package ready" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add to library" }).click();
  await page.goto("/library");
  await page.getByRole("link", { name: "Start learning" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome", exact: true }),
  ).toBeVisible();
});

test("reader controls remain usable at a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await importSmall(page);
  await expect(page.locator(".reader-course-nav")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Mark notes complete" }).click();
  await expect(page.getByText("Lesson complete")).toBeVisible();
});

test("opened package reloads and persists while offline", async ({
  page,
  context,
}) => {
  await importSmall(page);
  await page.getByRole("button", { name: "Mark notes complete" }).click();
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          {
            once: true,
          },
        );
        registration.active?.postMessage({
          type: "CACHE_URLS",
          urls: [location.pathname],
        });
      });
    }
  });
  await page.reload();
  await page.waitForTimeout(500);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Welcome", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Lesson complete")).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("cached multi-lesson package navigates between lessons offline", async ({
  page,
  context,
}) => {
  await page.goto("/library");
  await page
    .locator('input[type="file"]')
    .setInputFiles(
      "/home/apv/examplecourses/archives/standalone-module.mcf.zip",
    );
  await page.getByRole("link", { name: "Start learning" }).click();
  const next = page.getByRole("link", {
    name: "Sequence evidence and reasoning",
    exact: true,
  });
  const target = await next.getAttribute("href");
  expect(target).toBeTruthy();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(async (url) => Boolean(await caches.match(url!)), target),
    )
    .toBe(true);
  await context.setOffline(true);
  try {
    await next.click();
    await expect(
      page.getByRole("heading", {
        name: "Sequence evidence and reasoning",
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test("opens standalone module, standalone lesson, and all-question feature fixtures", async ({
  page,
}) => {
  const fixtures = [
    {
      path: "/home/apv/examplecourses/archives/standalone-module.mcf.zip",
      title: "Field Observation: Evidence and Sequence",
      lesson: "Observe before inferring",
    },
    {
      path: "/home/apv/examplecourses/archives/standalone-lesson.mcf.zip",
      title: "Reading Map Scale",
      lesson: "Reading map scale",
    },
    {
      path: "/home/apv/examplecourses/archives/feature-showcase.mcf.zip",
      title: "MCF 1.1 Feature Showcase",
      lesson: "Core features",
    },
  ] as const;

  for (const fixture of fixtures) {
    await page.goto("/library");
    await page.locator('input[type="file"]').setInputFiles(fixture.path);
    const card = page
      .locator(".library-card")
      .filter({ hasText: fixture.title });
    await expect(card).toBeVisible();
    await card.getByRole("link", { name: "Start learning" }).click();
    await expect(
      page.getByRole("heading", { name: fixture.lesson, exact: true }),
    ).toBeVisible();
  }

  await expect(
    page.getByRole("heading", { name: "Question types", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".reader-question")).toHaveCount(10);
  await expect(page.getByLabel("Essay response")).toBeVisible();
  await expect(page.getByLabel(/Match/).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Move .* down/ }).first(),
  ).toBeVisible();
});
