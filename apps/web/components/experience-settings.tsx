"use client";

import { Button } from "@theoria/ui";
import { onboardingOpenEvent } from "./onboarding";
import { ThemeControl } from "./theme-control";

export function ExperienceSettings() {
  return (
    <section className="settings-card">
      <p className="section-label">This browser</p>
      <h2>Appearance and help</h2>
      <ThemeControl />
      <Button
        className="button-secondary"
        onClick={() => dispatchEvent(new Event(onboardingOpenEvent))}
      >
        Show welcome guide
      </Button>
    </section>
  );
}
