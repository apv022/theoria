import { Notice, Status } from "@theoria/ui";
import Link from "next/link";
import type { Metadata } from "next";
import { RepositoryPagination } from "../../../components/repository-pagination";
import { serverPlatformClient } from "../../../lib/platform/server";

export const metadata: Metadata = { title: "My repositories" };
export const dynamic = "force-dynamic";

export default async function OwnedRepositoriesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ page?: string | string[] }>;
}) {
  const rawPage = (await searchParams).page;
  const page = Math.max(
    1,
    Number.parseInt(
      Array.isArray(rawPage) ? (rawPage[0] ?? "1") : (rawPage ?? "1"),
      10,
    ) || 1,
  );
  const platform = await serverPlatformClient();
  let identity;
  try {
    identity = await platform.authentication.currentIdentity();
  } catch {
    return (
      <div className="page-wrap narrow-page">
        <h1>My repositories</h1>
        <Notice title="Account service unavailable">
          Your repositories could not be checked. Local Creation Studio,
          Library, and Reader remain available. Reload this page to retry.
        </Notice>
      </div>
    );
  }
  if (!identity)
    return (
      <div className="page-wrap narrow-page">
        <h1>My repositories</h1>
        <Notice title="Sign in to see your repositories">
          Private and unlisted work is visible only to its owner.
          <span className="actions">
            <Link href="/login?next=/repositories">Sign in</Link>
            <Link href="/studio">Open local Creation Studio</Link>
          </span>
        </Notice>
      </div>
    );

  let listing;
  try {
    listing = await platform.repository.listOwned(page, 12);
  } catch {
    return (
      <div className="page-wrap narrow-page">
        <p className="section-label">Private account</p>
        <h1>My repositories</h1>
        <Notice title="Repository service unavailable">
          Owned repositories could not be loaded. Nothing was removed. Local
          Creation Studio, Library, and Reader remain available; reload to
          retry.
        </Notice>
      </div>
    );
  }

  return (
    <div className="page-wrap profile-page">
      <p className="section-label">Private account</p>
      <h1>My repositories</h1>
      <p>
        All repositories owned by @{identity.profile.handle}, including private
        and unlisted releases. This page is not public profile content.
      </p>
      <section id="repository-results" tabIndex={-1}>
        {listing.packages.length ? (
          <div className="owned-repository-list">
            {listing.packages.map((repository) => (
              <article className="owned-repository" key={repository.id}>
                <div>
                  <div className="repository-card-status">
                    <Status>{repository.visibility}</Status>
                    <Status>{repository.versions.length} versions</Status>
                  </div>
                  <h2>
                    <Link href={`/packages/${repository.slug}`}>
                      {repository.title}
                    </Link>
                  </h2>
                  <p>
                    {repository.description || "No description was provided."}
                  </p>
                  <ol className="owned-version-list">
                    {repository.versions.map((version) => (
                      <li key={version.id}>
                        <Link
                          href={`/packages/${repository.slug}/versions/${version.version}`}
                        >
                          Version {version.version}
                        </Link>{" "}
                        <time dateTime={version.publishedAt}>
                          {new Intl.DateTimeFormat("en", {
                            dateStyle: "medium",
                          }).format(new Date(version.publishedAt))}
                        </time>
                      </li>
                    ))}
                  </ol>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Notice title="No published repositories">
            Publish from Creation Studio when you are ready. Local drafts remain
            local.
          </Notice>
        )}
        <RepositoryPagination
          pathname="/repositories"
          query={{}}
          page={listing.page}
          totalPages={listing.totalPages}
        />
      </section>
    </div>
  );
}
