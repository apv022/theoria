import { Notice } from "@theoria/ui";
import type { Metadata } from "next";
import { RepositoryPackageCard } from "../../../components/repository-package-card";
import { serverPlatformClient } from "../../../lib/platform/server";

export const metadata: Metadata = { title: "Starred courses" };
export const dynamic = "force-dynamic";

export default async function StarredCoursesPage() {
  const platform = await serverPlatformClient();
  const identity = await platform.authentication.currentIdentity();

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

  const listing = await platform.repository.listStarred(1, 24);
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
