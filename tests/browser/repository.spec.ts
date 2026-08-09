import { expect, test, type Page } from "@playwright/test";

const fakeSupabase = "http://127.0.0.1:55431";

type SeedPackage = {
  readonly slug: string;
  readonly title: string;
  readonly description?: string;
  readonly creatorHandle: string;
  readonly creatorDisplayName?: string;
  readonly subjects?: readonly string[];
  readonly keywords?: readonly string[];
  readonly learningOutcomes?: readonly string[];
  readonly level?: string;
  readonly language?: string;
  readonly mcfVersion?: string;
  readonly kind?: string;
  readonly visibility?: string;
  readonly publishedAt?: string;
};

const catalog: readonly SeedPackage[] = [
  {
    slug: "calculus-foundations",
    title: "Calculus Foundations",
    description: "Limits, derivatives, and rates of change.",
    creatorHandle: "catalog_author",
    creatorDisplayName: "Catalog Author",
    subjects: ["mathematics"],
    keywords: ["derivative", "limits"],
    level: "secondary",
    language: "en",
    publishedAt: "2026-07-30T12:00:00.000Z",
    learningOutcomes: ["Reason about rates of change."],
  },
  {
    slug: "geometry-studio",
    title: "Geometry Studio",
    description: "Construct shapes and careful proofs.",
    creatorHandle: "catalog_author",
    creatorDisplayName: "Catalog Author",
    subjects: ["mathematics"],
    keywords: ["angles"],
    level: "secondary",
    language: "fr",
    mcfVersion: "1.0",
    kind: "module",
    publishedAt: "2026-07-29T12:00:00.000Z",
  },
  {
    slug: "earth-science",
    title: "Earth Science",
    description: "A planetary systems field guide.",
    creatorHandle: "science_author",
    creatorDisplayName: "Science Author",
    subjects: ["science"],
    keywords: ["planet"],
    level: "primary",
    language: "en",
    publishedAt: "2026-07-28T12:00:00.000Z",
  },
  ...Array.from({ length: 8 }, (_, index) => ({
    slug: `public-package-${index + 1}`,
    title: `Public Package ${index + 1}`,
    description: `Catalog pagination package ${index + 1}.`,
    creatorHandle: "catalog_author",
    creatorDisplayName: "Catalog Author",
    subjects: [index % 2 ? "history" : "science"],
    keywords: [`keyword-${index + 1}`],
    level: index % 2 ? "secondary" : "primary",
    language: "en",
    publishedAt: `2026-07-${String(20 - index).padStart(2, "0")}T12:00:00.000Z`,
  })),
  {
    slug: "direct-only",
    title: "Direct Only",
    description: "An unlisted direct-link package.",
    creatorHandle: "catalog_author",
    creatorDisplayName: "Catalog Author",
    subjects: ["mathematics"],
    visibility: "unlisted",
    publishedAt: "2026-07-31T12:00:00.000Z",
  },
  {
    slug: "owner-private",
    title: "Owner Private",
    description: "A private package.",
    creatorHandle: "catalog_author",
    creatorDisplayName: "Catalog Author",
    subjects: ["mathematics"],
    visibility: "private",
    publishedAt: "2026-08-01T12:00:00.000Z",
  },
];

async function reset(page: Page) {
  await page.request.post(`${fakeSupabase}/__test/reset`);
}

async function seed(page: Page, packages: readonly SeedPackage[] = catalog) {
  await page.request.post(`${fakeSupabase}/__test/seed-repository`, {
    data: { packages },
  });
}

async function signup(page: Page, handle: string) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(`${handle}@example.test`);
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Display name").fill("Repository Publisher");
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
}

async function publishValidCourse(page: Page) {
  await page.goto("/studio");
  await page.getByLabel("Package title").fill("Reader Ready Course");
  await page.getByLabel("Package kind").selectOption("course");
  await page.getByRole("button", { name: "Create package" }).click();
  await expect(page).toHaveURL(/\/studio\/[^/?#]+$/);
  const draftUrl = page.url();
  await page.getByRole("button", { name: "publish", exact: true }).click();
  await page
    .locator(".publish-panel")
    .getByRole("button", { name: "Claim local draft" })
    .click();
  await page.getByLabel("Package slug").fill("reader-ready-course");
  await page.getByLabel("Semantic version").fill("1.0.0");
  await page.getByLabel("Visibility").selectOption("public");
  await page.getByRole("button", { name: "Check slug" }).click();
  await expect(page.getByText("Slug available")).toBeVisible();
  await page.getByRole("button", { name: "Publish first version" }).click();
  await expect(
    page.getByText("Published reader-ready-course version 1.0.0"),
  ).toBeVisible();
  await page.getByRole("link", { name: "View immutable version" }).click();
  return draftUrl;
}

test.beforeEach(async ({ page }) => reset(page));

test("homepage and Explore show only real public repository data", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Recently published" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".repository-card h2")
      .filter({ hasText: "Calculus Foundations" })
      .last(),
  ).toBeVisible();
  await expect(page.getByText("Direct Only")).not.toBeVisible();

  await page.goto("/explore");
  await expect(
    page
      .getByRole("heading", { name: "11 public packages", exact: true })
      .last(),
  ).toBeVisible();
  await expect(page.getByText("Direct Only")).not.toBeVisible();
  await expect(page.getByText("Owner Private")).not.toBeVisible();
  await page.goto("/packages/direct-only");
  await expect(
    page.getByRole("heading", { name: "Direct Only" }),
  ).toBeVisible();
  await page.goto("/packages/owner-private");
  await expect(page.getByText("Package unavailable")).toBeVisible();
});

test("search, filters, stable sorting, and pagination use shareable URLs", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/explore");
  await page
    .getByLabel("Search courses and learning resources")
    .fill("calculus");
  await expect(page).toHaveURL(/\/explore$/);
  await expect(
    page
      .getByRole("heading", { name: "11 public packages", exact: true })
      .last(),
  ).toBeVisible();
  await page.getByLabel("Search courses and learning resources").press("Enter");
  await expect(page).toHaveURL(/q=calculus/);
  await expect(
    page.getByRole("heading", { name: "Calculus Foundations" }),
  ).toBeVisible();
  await page
    .getByLabel("Search courses and learning resources")
    .fill("planetary");
  await expect(page).toHaveURL(/q=calculus/);
  await expect(
    page.getByRole("heading", { name: "Calculus Foundations" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/q=planetary/);
  await expect(
    page.getByRole("heading", { name: "Earth Science" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/q=calculus/);
  await expect(
    page.getByLabel("Search courses and learning resources"),
  ).toHaveValue("calculus");
  await page.goForward();
  await expect(page).toHaveURL(/q=planetary/);
  await expect(
    page.getByLabel("Search courses and learning resources"),
  ).toHaveValue("planetary");
  await page
    .getByLabel("Search courses and learning resources")
    .fill("derivative");
  await page.getByLabel("Search courses and learning resources").press("Enter");
  await page
    .getByLabel("Search courses and learning resources")
    .fill("planetary");
  await page.getByLabel("Search courses and learning resources").press("Enter");
  await expect(page).toHaveURL(/q=planetary/);
  await expect(
    page.getByRole("heading", { name: "Earth Science" }),
  ).toBeVisible();

  await page.goto("/explore?q=planetary");
  await expect(
    page.getByRole("heading", { name: "Earth Science" }),
  ).toBeVisible();
  await page.goto("/explore?q=derivative");
  await expect(
    page
      .locator(".repository-card h2")
      .filter({ hasText: "Calculus Foundations" })
      .last(),
  ).toBeVisible();
  await page.goto("/explore?q=catalog_author");
  await expect(
    page
      .getByRole("heading", { name: "10 public packages", exact: true })
      .last(),
  ).toBeVisible();

  await page.goto(
    "/explore?subject=mathematics&level=secondary&language=en&kind=course&mcf=1.1&sort=title",
  );
  await expect(
    page.getByRole("heading", { name: "1 public package", exact: true }).last(),
  ).toBeVisible();
  await expect(
    page
      .locator(".repository-card h2")
      .filter({ hasText: "Calculus Foundations" })
      .last(),
  ).toBeVisible();

  await page.goto("/explore?sort=title");
  const titles = await page.locator(".repository-card h2").allTextContents();
  expect(titles.slice(0, 3)).toEqual([
    "Calculus Foundations",
    "Earth Science",
    "Geometry Studio",
  ]);
  await expect(
    page.getByRole("navigation", { name: "Result pages" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Next" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await expect(page.locator("#repository-results")).toBeFocused();
});

test("creator listings are public-only and paginated", async ({ page }) => {
  await seed(page);
  await page.goto("/profiles/catalog_author");
  await expect(
    page.getByRole("heading", { name: "Catalog Author" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "10 public packages",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Direct Only")).not.toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Result pages" }),
  ).toBeVisible();
});

test("repository and profile layouts fit every required viewport", async ({
  page,
}) => {
  await seed(page);
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of [
      "/packages/calculus-foundations",
      "/profiles/catalog_author",
    ]) {
      await page.goto(route);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `${route} at ${viewport.width}px`).toBeLessThanOrEqual(
        1,
      );
    }
  }
});

test("empty, offline, and repository-error states remain truthful", async ({
  page,
  context,
}) => {
  await page.goto("/explore");
  await expect(
    page.getByRole("heading", { name: "No public packages match." }),
  ).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText(/You are offline/)).toBeVisible();
  await context.setOffline(false);
  await page.request.post(`${fakeSupabase}/__test/fail-repository`);
  await page.goto("/explore");
  await expect(
    page
      .getByRole("heading", { name: "Repository unavailable", exact: true })
      .last(),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Repository unavailable" }).last(),
  ).toContainText("Test repository unavailable");
});

test("primary repository failures are bounded and lineage failures degrade locally", async ({
  page,
}) => {
  await seed(page, [catalog[0]!]);
  await page.request.post(`${fakeSupabase}/__test/fail-network`);
  await page.goto("/packages/calculus-foundations");
  await expect(
    page.getByRole("heading", { name: "Calculus Foundations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Lineage unavailable" }),
  ).toBeVisible();
  const counts = await page.request
    .get(`${fakeSupabase}/__test/request-counts`)
    .then((response) => response.json());
  expect(counts["/rest/v1/rpc/repository_package_network"]).toBe(1);

  await page.request.post(`${fakeSupabase}/__test/fail-repository`);
  await page.goto("/packages/calculus-foundations");
  await expect(
    page.getByRole("heading", { name: "Repository unavailable" }),
  ).toBeVisible();
  await expect(page.getByText(/Local Library, Reader, Studio/)).toBeVisible();
});

test("profile service failures do not masquerade as missing profiles", async ({
  page,
}) => {
  await seed(page, [catalog[0]!]);
  await page.request.post(`${fakeSupabase}/__test/fail-profile`);
  await page.goto("/profiles/catalog_author");
  await expect(
    page.getByRole("heading", { name: "Profile service unavailable" }),
  ).toBeVisible();
  await expect(page.getByText("No public profile")).not.toBeVisible();
});

test("repository source is validated before Add to Library and opens in Reader", async ({
  page,
}) => {
  await signup(page, "reader_publisher");
  const draftUrl = await publishValidCourse(page);
  await page.getByRole("button", { name: "Add to local library" }).click();
  await expect(page.getByText(/was added to this browser/)).toBeVisible();
  await page.getByRole("link", { name: "Open in Reader" }).click();
  await expect(page.locator(".reader-lesson > header > h1")).toHaveText(
    "Welcome",
  );
  await page.goto("/packages/reader-ready-course/versions/1.0.0");
  await expect(
    page.getByRole("link", { name: /Open in Reader|Continue in Reader/ }),
  ).toBeVisible();

  await page.goto(draftUrl);
  await page.getByRole("button", { name: "metadata", exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Reader Ready Course Revised");
  await expect(page.getByText("Saved locally")).toBeVisible();
  await page.getByRole("button", { name: "publish", exact: true }).click();
  await page.getByLabel("Semantic version").fill("1.0.1");
  await page.getByLabel("Visibility").selectOption("public");
  await page
    .getByRole("button", { name: "Publish new immutable version" })
    .click();
  await expect(
    page.getByText("Published reader-ready-course version 1.0.1"),
  ).toBeVisible();
  await page.getByRole("link", { name: "View immutable version" }).click();
  await expect(
    page.getByRole("heading", { name: "Another version is already local" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add this version separately" })
    .click();
  await expect(page.getByText(/was added to this browser/)).toBeVisible();
  const localState = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("theoria", 5);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const values = async (storeName: "library" | "progress") =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = database
          .transaction(storeName)
          .objectStore(storeName)
          .getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    return {
      library: await values("library"),
      progress: await values("progress"),
    };
  });
  expect(localState.library).toHaveLength(2);
  expect(localState.progress).toHaveLength(1);
});

test("invalid repository source never enters the local library", async ({
  page,
}) => {
  await seed(page, [
    {
      slug: "invalid-source",
      title: "Invalid Source",
      description: "Metadata with corrupt source bytes.",
      creatorHandle: "catalog_author",
      creatorDisplayName: "Catalog Author",
      subjects: ["testing"],
    },
  ]);
  await page.goto("/packages/invalid-source/versions/1.0.0");
  await page.getByRole("button", { name: "Add to local library" }).click();
  await expect(page.locator(".form-message.error-message")).toContainText(
    /archive|zip|central directory|package/i,
  );
  await expect(
    page.getByRole("link", { name: /Open in Reader|Continue in Reader/ }),
  ).not.toBeVisible();
});

test("stars and publishes a local fork with permanent release lineage", async ({
  page,
}) => {
  await signup(page, "network_author");
  await publishValidCourse(page);

  await page.getByRole("button", { name: /Star Reader Ready Course/ }).click();
  await expect(
    page.getByRole("button", { name: /Remove star.*1 stars/ }),
  ).toBeVisible();
  await page.goto("/stars");
  await expect(
    page.getByRole("heading", { name: "Reader Ready Course" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Stars do not change your local Library/),
  ).toBeVisible();

  await page.goto("/packages/reader-ready-course");
  await page.getByRole("button", { name: /Fork into Studio/ }).click();
  await expect(page).toHaveURL(/\/studio\/[^/?#]+$/);
  await page.getByRole("button", { name: "publish", exact: true }).click();
  await page
    .locator(".publish-panel")
    .getByRole("button", { name: "Claim local draft" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Fork lineage will be permanent" }),
  ).toBeVisible();
  await page.getByLabel("Package slug").fill("reader-ready-course-fork");
  await page.getByLabel("Semantic version").fill("1.0.0");
  await page.getByLabel("Visibility").selectOption("public");
  await page.getByRole("button", { name: "Check slug" }).click();
  await page.getByRole("button", { name: "Publish first version" }).click();
  await expect(
    page.getByText("Published reader-ready-course-fork version 1.0.0"),
  ).toBeVisible();
  await page.goto("/packages/reader-ready-course-fork");
  await expect(page.getByText(/Forked from/)).toBeVisible();
  await expect(page.getByText(/version 1\.0\.0/)).toBeVisible();
});
