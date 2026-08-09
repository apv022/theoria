"use client";

import { LinkButton, Notice } from "@theoria/ui";
import { useEffect } from "react";

export default function PublicError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error("Public route failed", error);
  }, [error]);
  return (
    <div className="page-wrap narrow-page">
      <h1>This page is temporarily unavailable</h1>
      <Notice title="Nothing local was changed">
        The remote page failed to load. Your local packages, drafts, and
        progress remain in this browser.
      </Notice>
      <div className="actions">
        <button className="button" type="button" onClick={reset}>
          Try again
        </button>
        <LinkButton href="/library" secondary>
          Open Library
        </LinkButton>
        <LinkButton href="/studio" secondary>
          Open Studio
        </LinkButton>
      </div>
    </div>
  );
}
