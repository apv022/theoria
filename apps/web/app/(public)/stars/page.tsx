import { Notice } from "@theoria/ui";
import type { Metadata } from "next";
import { RepositoryPackageCard } from "../../../components/repository-package-card";
import { serverPlatformClient } from "../../../lib/platform/server";

export const metadata: Metadata = { title: "Starred courses" };
export const dynamic = "force-dynamic";

export default async function StarredCoursesPage() {
  const platform = await serverPlatformClient();
  let identity;
  try {
    identity = await platform.authentication.currentIdentity();
  } catch {
    return (
      <div className="page-wrap narrow-page">
        <h1>Starred courses</h1>
        <Notice title="Account service unavailable">
          Your account and stars could not be checked. Local Library, Reader,
          and Studio remain available; reload to retry.
        </Notice>
      </div>
    );
  }

  if (!identity)
    return (
      <div className="page-wrap narrow-page">
        <p className="section-label">Social bookmarks</p>
        <h1>Starred courses</h1>
        <Notice title="Sign in to see your stars">
          Stars stay separate from your browser Library and never enroll you in
          a course.
        </Notice>
      </div>
    );

  let listing;
  try {
    listing = await platform.repository.listStarred(1, 24);
  } catch {
    return (
      <div className="page-wrap narrow-page">
        <h1>Starred courses</h1>
        <Notice title="Stars unavailable">
          Your saved stars could not be loaded. Nothing was removed; reload to
          retry.
        </Notice>
      </div>
    );
  }
  return (
    <div className="page-wrap profile-page">
      <p className="section-label">Social bookmarks</p>
      <h1>Starred courses</h1>
      <p>
        {listing.total} {listing.total === 1 ? "course" : "courses"}. Stars do
        not change your local Library or learning progress.
      </p>
      {listing.packages.length ? (
        <div className="repository-grid">
          {listing.packages.map((packageValue) => (
            <RepositoryPackageCard
              key={packageValue.id}
              packageValue={packageValue}
            />
          ))}
        </div>
      ) : (
        <Notice title="No starred courses">
          Star an accessible repository to keep it here.
        </Notice>
      )}
    </div>
  );
}
