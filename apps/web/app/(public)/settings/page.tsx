import { Button, Field, Notice } from "@theoria/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="page-wrap narrow-page">
      <p className="section-label">Account</p>
      <h1>Settings</h1>
      <section className="settings-card">
        <h2>Profile</h2>
        <Field
          label="Display name"
          placeholder="Authentication is not connected"
          disabled
        />
        <Field label="Handle" placeholder="No account yet" disabled />
        <Button disabled>Save settings</Button>
      </section>
      <Notice title="Account services are deferred">
        Authentication, profile updates, cloud storage, permissions, and
        synchronization belong to the future platform client and have no fake
        implementation here.
      </Notice>
    </div>
  );
}
