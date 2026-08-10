"use client";

import { Button, LinkButton } from "@theoria/ui";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export const onboardingStorageKey = "theoria-onboarding-v1";
export const onboardingOpenEvent = "theoria-open-onboarding";

export function Onboarding() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname === "/") {
      setOpen(localStorage.getItem(onboardingStorageKey) !== "dismissed");
    }
    const reopen = () => setOpen(true);
    addEventListener(onboardingOpenEvent, reopen);
    return () => removeEventListener(onboardingOpenEvent, reopen);
  }, [pathname]);

  if (!open) return null;
  return (
    <aside className="onboarding-panel" aria-labelledby="onboarding-title">
      <div>
        <p className="section-label">Welcome to Theoria</p>
        <h2 id="onboarding-title">Learn and create locally first.</h2>
      </div>
      <ol>
        <li>
          <strong>Explore</strong>
          <span>Find portable courses and add them to Library.</span>
        </li>
        <li>
          <strong>Learn offline</strong>
          <span>Progress stays in this browser without an account.</span>
        </li>
        <li>
          <strong>Create</strong>
          <span>
            Creation Studio works locally; cloud sync is optional and requires
            consent.
          </span>
        </li>
      </ol>
      <div className="actions">
        <LinkButton href="/explore">Explore courses</LinkButton>
        <LinkButton href="/studio" secondary>
          Open Creation Studio
        </LinkButton>
        <Button
          className="button-secondary"
          onClick={() => {
            localStorage.setItem(onboardingStorageKey, "dismissed");
            setOpen(false);
          }}
        >
          Got it
        </Button>
      </div>
    </aside>
  );
}
