import { Notice, Status } from "@theoria/ui";
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
  const profile = await platform.profiles.getByHandle(handle);

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

  if (!profile)
    return (
      <div className="page-wrap narrow-page">
        <p className="section-label">Public profile</p>
        <h1>Profile not found</h1>
        <Notice title="No public profile">
          No account currently uses @{handle.toLowerCase()}.
        </Notice>
      </div>
    );

  let listing;
  let repositoryError: string | undefined;
  try {
    listing = await platform.repository.listProfilePackages(profile.handle, {
      page,
      pageSize: 6,
      sort: "newest",
    });
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
      <p className="profile-joined">
        Joined{" "}
        {new Intl.DateTimeFormat("en", {
          month: "long",
          year: "numeric",
        }).format(new Date(profile.createdAt))}
      </p>
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
