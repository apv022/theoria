import { ProfileSettings } from "../../../../components/profile-settings";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Edit profile" };

export default function ProfileSettingsPage() {
  return (
    <div className="page-wrap narrow-page">
      <p className="section-label">Account</p>
      <h1>Edit public profile</h1>
      <ProfileSettings />
    </div>
  );
}
