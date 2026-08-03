"use client";

import { Button } from "@theoria/ui";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "./auth-provider";

export function AccountNavigation({
  showSearch = true,
}: {
  readonly showSearch?: boolean;
}) {
  const { configured, identity, loading, platform } = useAuth();
  const [busy, setBusy] = useState(false);

  if (loading)
    return (
      <nav className="utility-nav" aria-label="Account">
        <span aria-live="polite">Checking account…</span>
      </nav>
    );
  if (!identity)
    return (
      <nav className="utility-nav" aria-label="Account">
        {showSearch ? <Link href="/explore#search">Search</Link> : null}
        <Link href="/login">Sign in</Link>
        {!configured ? (
          <span className="account-local-label">Local mode</span>
        ) : null}
      </nav>
    );

  return (
    <nav className="utility-nav account-navigation" aria-label="Account">
      {showSearch ? <Link href="/explore#search">Search</Link> : null}
      <details>
        <summary>
          {identity.profile.displayName || `@${identity.profile.handle}`}
        </summary>
        <div className="account-menu">
          <Link href={`/profiles/${identity.profile.handle}`}>Profile</Link>
          <Link href="/stars">Starred courses</Link>
          <Link href="/settings">Settings</Link>
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void platform.authentication
                .signOut()
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </details>
    </nav>
  );
}
