import { AccountSettings } from "../../../components/account-settings";
import { ExperienceSettings } from "../../../components/experience-settings";
import { LinkButton } from "@theoria/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="page-wrap narrow-page">
      <p className="section-label">Account</p>
      <h1>Settings</h1>
      <ExperienceSettings />
      <section className="settings-card">
        <p className="section-label">Creation</p>
        <h2>AI providers</h2>
        <p>
          Connect a provider you control for creator tools that require external
          compute. Theoria does not charge for provider usage.
        </p>
        <LinkButton href="/settings/ai-providers">
          Manage AI providers
        </LinkButton>
      </section>
      <AccountSettings />
    </div>
  );
}
