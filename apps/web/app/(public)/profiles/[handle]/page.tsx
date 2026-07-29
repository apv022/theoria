import { Notice, Status } from "@theoria/ui";
import type { Metadata } from "next";
import { serverPlatformClient } from "../../../../lib/platform/server";

interface Props {
  readonly params: Promise<{ handle: string }>;
}

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: Props) {
  const { handle } = await params;
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

  return (
    <div className="page-wrap narrow-page">
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
      <Notice title="No published packages yet">
        Publishing is intentionally deferred. Local drafts and learner activity
        are never displayed on public profiles.
      </Notice>
    </div>
  );
}
