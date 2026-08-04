"use client";

import { Button, Field, LinkButton, Notice } from "@theoria/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "./auth-provider";

export function ProfileSettings() {
  const { configured, identity, loading, platform, reload } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (loading) return <p aria-live="polite">Loading profile…</p>;
  if (!configured)
    return (
      <Notice title="Accounts are not configured">
        Profile editing is unavailable, but all local tools remain usable.
      </Notice>
    );
  if (!identity)
    return (
      <>
        <Notice title="Sign in required">
          Profile settings are account-managed. Local Studio and Reader routes
          remain public.
        </Notice>
        <LinkButton href="/login?next=/settings/profile">Sign in</LinkButton>
      </>
    );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const data = new FormData(event.currentTarget);
    void platform.profiles
      .updateOwn({
        handle: String(data.get("handle") ?? ""),
        displayName: String(data.get("displayName") ?? ""),
        bio: String(data.get("bio") ?? ""),
        avatarPath: String(data.get("avatarPath") ?? "") || null,
        location: String(data.get("location") ?? ""),
        websiteUrl: String(data.get("websiteUrl") ?? ""),
      })
      .then(async (profile) => {
        await reload();
        router.replace(`/profiles/${profile.handle}`);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Profile update failed.",
        ),
      )
      .finally(() => setBusy(false));
  };

  return (
    <form className="settings-card profile-form" onSubmit={submit}>
      <Field
        label="Handle"
        name="handle"
        defaultValue={identity.profile.handle}
        minLength={3}
        maxLength={30}
        pattern="[a-z][a-z0-9_]{2,29}"
        hint="Public, unique, lowercase, and independent from your email."
        required
      />
      <Field
        label="Display name"
        name="displayName"
        defaultValue={identity.profile.displayName}
        minLength={1}
        maxLength={80}
        required
      />
      <label className="field">
        <span>Bio</span>
        <textarea
          name="bio"
          rows={6}
          maxLength={500}
          defaultValue={identity.profile.bio}
        />
        <small>Up to 500 characters. This appears publicly.</small>
      </label>
      <Field
        label="Location"
        name="location"
        defaultValue={identity.profile.location ?? ""}
        maxLength={100}
        hint="Optional public location."
      />
      <Field
        label="Website"
        name="websiteUrl"
        type="url"
        defaultValue={identity.profile.websiteUrl ?? ""}
        maxLength={500}
        hint="Optional public https:// or http:// URL."
      />
      <Field
        label="Avatar path"
        name="avatarPath"
        defaultValue={identity.profile.avatarPath ?? ""}
        maxLength={512}
        hint="Optional configured avatar URL or storage path."
      />
      {error ? (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      ) : null}
      <div className="actions">
        <Button disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button>
        <LinkButton href="/settings" secondary>
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
