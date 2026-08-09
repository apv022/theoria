"use client";

import { Button, Field, LinkButton, Notice, Status } from "@theoria/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "./auth-provider";

export function AccountSettings() {
  const { configured, event, identity, loading, platform } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  if (loading) return <p aria-live="polite">Loading account…</p>;
  if (!configured)
    return (
      <Notice title="Local mode">
        Accounts are not configured. Compiler, Library, Reader, and Studio
        remain available, and all browser-local records are unchanged.
      </Notice>
    );
  if (!identity)
    return (
      <>
        <Notice
          title={
            event === "expired"
              ? "Session expired"
              : event === "unavailable"
                ? "Account service unavailable"
                : "Signed out"
          }
        >
          {event === "unavailable"
            ? "Your session could not be checked. Reload to retry; local learning and creation data remains available."
            : "Sign in to manage account data. Your local learning and creation data remains available without an account."}
        </Notice>
        {event !== "unavailable" ? (
          <LinkButton href="/login?next=/settings">Sign in</LinkButton>
        ) : null}
      </>
    );

  const changePassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    void platform.authentication
      .updatePassword(password)
      .then(() => {
        event.currentTarget.reset();
        setMessage("Password updated.");
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Password update failed.",
        ),
      )
      .finally(() => setBusy(false));
  };

  return (
    <>
      <section className="settings-card">
        <div className="settings-heading">
          <div>
            <p className="section-label">Private account</p>
            <h2>{identity.email}</h2>
          </div>
          <Status tone={identity.emailVerified ? "positive" : "warning"}>
            {identity.emailVerified ? "Email verified" : "Verification pending"}
          </Status>
        </div>
        <p>
          Signed in as @{identity.profile.handle}. Your email is shown only on
          this private settings screen.
        </p>
        <LinkButton href="/settings/profile">Edit public profile</LinkButton>
        <LinkButton href="/settings/sync">Manage synchronization</LinkButton>
      </section>
      <form className="settings-card" onSubmit={changePassword}>
        <h2>Change password</h2>
        <Field
          label="New password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          hint="Use at least 8 characters."
          required
        />
        {error ? (
          <p role="alert" className="form-message error-message">
            {error}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="form-message success-message">
            {message}
          </p>
        ) : null}
        <Button disabled={busy}>
          {busy ? "Updating…" : "Update password"}
        </Button>
      </form>
      <section className="settings-card">
        <h2>Session</h2>
        <Button
          className="button-secondary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void platform.authentication
              .signOut()
              .then(() => router.replace("/"))
              .finally(() => setBusy(false));
          }}
        >
          Sign out
        </Button>
      </section>
      <Notice title="Synchronization requires consent">
        Signing in does not upload existing drafts, packages, progress, or
        compilations. Enable synchronization explicitly for each browser under
        synchronization settings.
      </Notice>
    </>
  );
}
