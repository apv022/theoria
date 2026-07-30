import type { Metadata } from "next";
import { SyncSettings } from "../../../../components/sync-settings";

export const metadata: Metadata = { title: "Synchronization" };

export default function SynchronizationSettingsPage() {
  return (
    <div className="page-wrap narrow-page">
      <p className="section-label">Account</p>
      <h1>Synchronization</h1>
      <SyncSettings />
    </div>
  );
}
