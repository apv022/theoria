import type { Metadata } from "next";
import { AIProviderSettings } from "../../../../components/ai-provider-settings";

export const metadata: Metadata = { title: "AI providers" };

export default function AIProviderSettingsPage() {
  return (
    <div className="page-wrap narrow-page">
      <p className="section-label">Creation settings</p>
      <h1>AI providers</h1>
      <AIProviderSettings />
    </div>
  );
}
