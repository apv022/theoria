import { Notice, Status } from "@theoria/ui";
import Link from "next/link";
import type { Metadata } from "next";
import { RepositoryPackageCard } from "../../../../components/repository-package-card";
import { RepositoryPagination } from "../../../../components/repository-pagination";
import { serverPlatformClient } from "../../../../lib/platform/server";

interface Props {
  readonly params: Promise<{ handle: string }>;
  readonly searchParams: Promise<{ page?: string | string[] }>;
}

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage({ params, searchParams }: Props) {
  const { handle } = await params;
  const rawPage = (await searchParams).page;
  const page = Math.max(
    1,
    Number.parseInt(
      Array.isArray(rawPage) ? (rawPage[0] ?? "1") : (rawPage ?? "1"),
      10,
    ) || 1,
  );
  const platform = await serverPlatformClient();

  if (!platform.authentication.configured)
    return (
      <div className="page-wrap narrow-page">
        <p className="section-label">Public profile</p>
        <h1>@{handle.toLowerCase()}</h1>
        <Notice title="Accounts are not configured">
          This deployment is running locally without a profile service. No
          placeholder identity or package activity is shown.
        </Notice>
      </div>
    );

  let profile;
  try {
    profile = await platform.profiles.getByHandle(handle);
  } catch {
    return (
      <div className="page-wrap narrow-page">
        <p className="section-label">Public profile</p>
        <h1>@{handle.toLowerCase()}</h1>
        <Notice title="Profile service unavailable">
          This profile could not be loaded. Browse local Library, Reader, and
          Studio normally, or reload this page to retry.
        </Notice>
      </div>
    );
  }

  if (!profile)
    return (
      <div className="page-wrap narrow-page">
        <p className="section-label">Public profile</p>
        <h1>Profile not found</h1>
        <Notice title="No public profile">
          No account currently uses @{handle.toLowerCase()}. Check the spelling,
          browse public courses, or create locally in Studio.
          <span className="actions">
            <Link href="/explore">Explore courses</Link>
            <Link href="/studio">Open Studio</Link>
          </span>
        </Notice>
      </div>
    );

  let listing;
  let summary;
  let repositoryError: string | undefined;
  try {
    [listing, summary] = await Promise.all([
      platform.repository.listProfilePackages(profile.handle, {
        page,
        pageSize: 6,
        sort: "newest",
      }),
      platform.profiles.getRepositorySummary(profile.handle),
    ]);
  } catch (reason) {
    repositoryError =
      reason instanceof Error
        ? reason.message
        : "Published packages could not be loaded.";
  }

  return (
    <div className="page-wrap profile-page">
      <p className="section-label">Public profile</p>
      <div className="profile-heading">
        {profile.avatarPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="avatar profile-avatar"
            src={profile.avatarPath}
            alt={`${profile.displayName} avatar`}
          />
        ) : (
          <div className="avatar" aria-hidden="true">
            {profile.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <Status tone="positive">Public profile</Status>
          <h1>{profile.displayName}</h1>
          <p>@{profile.handle}</p>
        </div>
      </div>
      {profile.bio ? <p className="profile-bio">{profile.bio}</p> : null}
      {profile.location || profile.websiteUrl ? (
        <p className="profile-contact">
          {profile.location ? <span>{profile.location}</span> : null}
          {profile.websiteUrl ? (
            <a href={profile.websiteUrl} rel="me noopener noreferrer">
              {new URL(profile.websiteUrl).hostname}
            </a>
          ) : null}
        </p>
      ) : null}
      <p className="profile-joined">
        Joined{" "}
        {new Intl.DateTimeFormat("en", {
          month: "long",
          year: "numeric",
        }).format(new Date(profile.createdAt))}
      </p>
      <dl className="profile-repository-summary" aria-label="Publishing totals">
        <div>
          <dt>Courses</dt>
          <dd>{summary?.publicPackageCount ?? listing?.total ?? 0}</dd>
        </div>
        <div>
          <dt>Versions</dt>
          <dd>{summary?.totalVersionCount ?? 0}</dd>
        </div>
        <div>
          <dt>Stars received</dt>
          <dd>{summary?.totalStarsReceived ?? 0}</dd>
        </div>
      </dl>
      {summary?.recentActivity.length ? (
        <section className="profile-activity">
          <p className="section-label">Recent publishing activity</p>
          <ol>
            {summary.recentActivity.map((activity) => (
              <li key={`${activity.slug}-${activity.version}`}>
                Published{" "}
                <Link
                  href={`/packages/${activity.slug}/versions/${activity.version}`}
                >
                  {activity.title} {activity.version}
                </Link>{" "}
                <time dateTime={activity.publishedAt}>
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                  }).format(new Date(activity.publishedAt))}
                </time>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <section
        id="repository-results"
        className="profile-packages"
        tabIndex={-1}
      >
        <header>
          <p className="section-label">Public work</p>
          <h2>
            {listing?.total === 1
              ? "1 public package"
              : `${listing?.total ?? 0} public packages`}
          </h2>
          <p>
            Newest publications by @{profile.handle}. Unlisted, private, and
            local-only work is not included.
          </p>
        </header>
        {repositoryError ? (
          <Notice title="Repository unavailable">{repositoryError}</Notice>
        ) : listing?.packages.length ? (
          <>
            <div className="repository-grid">
              {listing.packages.map((packageValue) => (
                <RepositoryPackageCard
                  key={packageValue.id}
                  packageValue={packageValue}
                />
              ))}
            </div>
            <RepositoryPagination
              pathname={`/profiles/${profile.handle}`}
              query={{}}
              page={listing.page}
              totalPages={listing.totalPages}
            />
          </>
        ) : (
          <Notice title="No public packages yet">
            This profile has no public releases. Local drafts and learner
            activity are never displayed.
          </Notice>
        )}
      </section>
    </div>
  );
}
