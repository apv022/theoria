import { Notice, Status } from "@theoria/ui";
import type { Metadata } from "next";

interface Props {
  readonly params: Promise<{ handle: string }>;
}

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({ params }: Props) {
  const { handle } = await params;
  return (
    <div className="page-wrap narrow-page">
      <p className="section-label">Public profile</p>
      <div className="profile-heading">
        <div className="avatar" aria-hidden="true">
          {handle.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <Status>Preview</Status>
          <h1>@{handle}</h1>
        </div>
      </div>
      <Notice title="Profiles are not connected">
        Identity, published packages, follows, and activity require the future
        platform service. This route currently establishes only the public
        profile boundary.
      </Notice>
    </div>
  );
}
