import { expect, test, type Page } from "@playwright/test";

const fixtureRoot = `${process.cwd()}/fixtures/local`;
const small = `${fixtureRoot}/minimal-1.1.mcf.zip`;

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
    .setInputFiles(`${fixtureRoot}/standalone-module.mcf.zip`);
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
      path: `${fixtureRoot}/standalone-module.mcf.zip`,
      title: "Field Observation: Evidence and Sequence",
      lesson: "Observe before inferring",
    },
    {
      path: `${fixtureRoot}/standalone-lesson.mcf.zip`,
      title: "Reading Map Scale",
      lesson: "Reading map scale",
    },
    {
      path: `${fixtureRoot}/feature-showcase.mcf.zip`,
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
  await expect(page.getByRole("group", { name: /root/i })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Move item .* down/ }).first(),
  ).toBeVisible();
});

test("Reader renders authored rich content across question controls without weakening behavior", async ({
  page,
}) => {
  await page.goto("/library");
  await page
    .locator('input[type="file"]')
    .setInputFiles(`${fixtureRoot}/feature-showcase.mcf.zip`);
  const card = page
    .locator(".library-card")
    .filter({ hasText: "MCF 1.1 Feature Showcase" });
  await card.getByRole("link", { name: "Start learning" }).click();

  const questions = page.locator(".reader-question");
  await expect(questions).toHaveCount(10);
  const multipleChoice = questions.nth(0);
  await expect(multipleChoice.locator(".katex")).toHaveCount(3);
  await expect(multipleChoice).not.toContainText("$\\frac");
  await expect(multipleChoice).not.toContainText("$\\sqrt");
  expect(
    await page.evaluate(
      () => (window as Window & { readerUnsafe?: boolean }).readerUnsafe,
    ),
  ).toBeUndefined();
  await expect(page.locator(".reader-rich script")).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "MCF source can feed a local reader" }),
  ).toHaveAttribute("src", /^blob:/);

  await multipleChoice.locator('input[type="radio"]').first().check();
  await multipleChoice.getByRole("button", { name: "Check answer" }).click();
  await expect(
    multipleChoice.locator(".reader-option-feedback .katex"),
  ).toBeVisible();
  await expect(multipleChoice.getByText(/Correct:/)).toBeVisible();
  await multipleChoice.getByRole("button", { name: "Show hint" }).click();
  await expect(
    multipleChoice.locator(".reader-feedback .katex").first(),
  ).toBeVisible();
  await expect(
    multipleChoice.locator(".reader-explanation .katex"),
  ).toBeVisible();

  const multipleSelect = questions.nth(1);
  await multipleSelect.locator('input[type="checkbox"]').nth(0).check();
  await multipleSelect.locator('input[type="checkbox"]').nth(1).check();
  await multipleSelect.getByRole("button", { name: "Check answer" }).click();
  await expect(
    multipleSelect.locator(".reader-option-feedback strong"),
  ).toBeVisible();

  const matching = questions.nth(6);
  await expect(matching.getByRole("group")).toHaveCount(2);
  await expect(matching.locator("legend .katex")).toHaveCount(2);
  await matching
    .getByRole("group")
    .nth(0)
    .locator('input[type="radio"]')
    .first()
    .check();
  await expect(
    matching.getByRole("group").nth(0).locator('input[type="radio"]:checked'),
  ).toHaveCount(1);

  const ordering = questions.nth(7);
  const before = await ordering
    .locator(".ordering-control li")
    .allTextContents();
  await ordering.getByRole("button", { name: "Move item 1 down" }).click();
  const after = await ordering
    .locator(".ordering-control li")
    .allTextContents();
  expect(after).not.toEqual(before);
  await expect(ordering.locator(".ordering-control .katex")).toBeVisible();

  await expect(page.locator(".reader-rubric .katex").first()).toBeVisible();
  await page.reload();
  await expect(
    multipleChoice.locator('input[type="radio"]').first(),
  ).toBeChecked();
});
