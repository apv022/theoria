import type { McfVersion, PackageKind } from "@theoria/package-model";
import type {
  RepositoryQuery,
  RepositoryResult,
  RepositorySort,
  RepositorySubject,
} from "@theoria/platform-client";
import { Notice } from "@theoria/ui";
import type { Metadata } from "next";
import { ExploreControls } from "../../../components/explore-controls";
import { RepositoryPackageCard } from "../../../components/repository-package-card";
import { RepositoryPagination } from "../../../components/repository-pagination";
import { serverPlatformClient } from "../../../lib/platform/server";

export const metadata: Metadata = { title: "Explore" };
export const dynamic = "force-dynamic";

type SearchValues = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined): string | undefined => {
  const result = Array.isArray(value) ? value[0] : value;
  return result?.trim() || undefined;
};

const kinds = new Set<PackageKind>([
  "course",
  "module",
  "lesson",
  "question_bank",
  "asset_collection",
]);
const versions = new Set<McfVersion>(["1.0", "1.1"]);
const sorts = new Set<RepositorySort>([
  "relevance",
  "newest",
  "updated",
  "title",
]);

const queryValues = (
  values: SearchValues,
): {
  readonly display: Readonly<Record<string, string | undefined>>;
  readonly repository: RepositoryQuery;
} => {
  const q = one(values.q)?.slice(0, 160);
  const subject = one(values.subject)?.slice(0, 80).toLowerCase();
  const level = one(values.level)?.slice(0, 80).toLowerCase();
  const language = one(values.language)?.slice(0, 40).toLowerCase();
  const rawKind = one(values.kind) as PackageKind | undefined;
  const kind = rawKind && kinds.has(rawKind) ? rawKind : undefined;
  const rawMcf = one(values.mcf) as McfVersion | undefined;
  const mcfVersion = rawMcf && versions.has(rawMcf) ? rawMcf : undefined;
  const rawSort = one(values.sort) as RepositorySort | undefined;
  const sort =
    rawSort && sorts.has(rawSort) ? rawSort : q ? "relevance" : "newest";
  const page = Math.max(1, Number.parseInt(one(values.page) ?? "1", 10) || 1);
  return {
    display: {
      q,
      subject,
      level,
      language,
      kind,
      mcf: mcfVersion,
      sort,
      ...(page > 1 ? { page: String(page) } : {}),
    },
    repository: {
      ...(q ? { text: q } : {}),
      ...(subject ? { subject } : {}),
      ...(level ? { level } : {}),
      ...(language ? { language } : {}),
      ...(kind ? { kind } : {}),
      ...(mcfVersion ? { mcfVersion } : {}),
      sort,
      page,
      pageSize: 9,
    },
  };
};

export default async function ExplorePage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchValues>;
}) {
  const parsed = queryValues(await searchParams);
  const platform = await serverPlatformClient();
  let result: RepositoryResult = {
    packages: [],
    total: 0,
    page: parsed.repository.page ?? 1,
    pageSize: 9,
    totalPages: 0,
  };
  let subjects: readonly RepositorySubject[] = [];
  let error: string | undefined;
  try {
    [result, subjects] = await Promise.all([
      platform.repository.search(parsed.repository),
      platform.repository.listSubjects(16),
    ]);
  } catch (reason) {
    error =
      reason instanceof Error
        ? reason.message
        : "The public repository could not be loaded.";
  }

  return (
    <div className="page-wrap repository-page">
      <header className="page-heading split-heading">
        <div>
          <p className="section-label">Public repository</p>
          <h1>Explore courses and learning resources</h1>
        </div>
        <p>
          Search published learning materials. Unlisted work remains available
          only by direct link, and private work never appears here.
        </p>
      </header>
      <ExploreControls query={parsed.display} subjects={subjects} />
      {error ? (
        <Notice title="Repository unavailable">
          {error} Local Library, Reader, Studio, and compiler workflows remain
          available offline.
        </Notice>
      ) : (
        <section
          id="repository-results"
          className="repository-results"
          tabIndex={-1}
          aria-labelledby="repository-results-heading"
        >
          <header>
            <div>
              <p className="section-label">Search results</p>
              <h2 id="repository-results-heading">
                {result.total === 1
                  ? "1 public package"
                  : `${result.total} public packages`}
              </h2>
            </div>
            {result.totalPages ? (
              <p>
                Page {result.page} of {result.totalPages}
              </p>
            ) : null}
          </header>
          <p className="sr-only" role="status" aria-live="polite">
            {result.total} repository results
          </p>
          {result.packages.length ? (
            <div className="repository-grid">
              {result.packages.map((packageValue) => (
                <RepositoryPackageCard
                  key={packageValue.id}
                  packageValue={packageValue}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-mark" aria-hidden="true">
                ◇
              </span>
              <h2>No public packages match.</h2>
              <p>Try a broader query or clear one of the filters.</p>
              <a className="button button-secondary" href="/explore">
                Clear filters
              </a>
            </div>
          )}
          <RepositoryPagination
            pathname="/explore"
            query={parsed.display}
            page={result.page}
            totalPages={result.totalPages}
          />
        </section>
      )}
    </div>
  );
}
