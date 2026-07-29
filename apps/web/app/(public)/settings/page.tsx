import { AccountSettings } from "../../../components/account-settings";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="page-wrap narrow-page">
      <p className="section-label">Account</p>
      <h1>Settings</h1>
      <AccountSettings />
    </div>
  );
}
