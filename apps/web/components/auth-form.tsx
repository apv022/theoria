"use client";

import { Button, Field, LinkButton, Notice } from "@theoria/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authCallbackUrl } from "../lib/auth-redirect";
import { useAuth } from "./auth-provider";

type AuthMode = "login" | "signup" | "forgot" | "reset";

const title: Record<AuthMode, string> = {
  login: "Sign in",
  signup: "Create an account",
  forgot: "Reset your password",
  reset: "Choose a new password",
};

const message = (reason: unknown): string => {
  if (!(reason instanceof Error)) return "The account request failed.";
  if (/profiles_handle_reserved|profiles_handle_format/i.test(reason.message))
    return "Choose a handle with 3–30 lowercase letters, numbers, or underscores. Reserved handles are unavailable.";
  if (/duplicate|unique|profiles_handle_key/i.test(reason.message))
    return "That handle is already in use.";
  if (/refresh token|session.*missing|jwt.*expired/i.test(reason.message))
    return "Your session has expired. Sign in again.";
  return reason.message;
};

export function AuthForm({
  mode,
  next = "/settings",
  initialError,
}: {
  readonly mode: AuthMode;
  readonly next?: string;
  readonly initialError?: string | undefined;
}) {
  const { configured, identity, platform, reload } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(initialError);
  const [success, setSuccess] = useState<string>();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    void (async () => {
      if (mode === "login") {
        await platform.authentication.signIn(email, password);
        await reload();
        router.replace(next);
      } else if (mode === "signup") {
        const result = await platform.authentication.signUp({
          email,
          password,
          handle: String(data.get("handle") ?? ""),
          displayName: String(data.get("displayName") ?? ""),
          emailRedirectTo: authCallbackUrl(
            "/settings/profile",
            location.origin,
          ),
        });
        if (result.verificationRequired)
          setSuccess(
            "Check your email to verify the account, then return to sign in.",
          );
        else {
          await reload();
          router.replace("/settings/profile");
        }
      } else if (mode === "forgot") {
        await platform.authentication.requestPasswordReset(
          email,
          authCallbackUrl("/reset-password", location.origin),
        );
        setSuccess(
          "If an account exists for that address, a recovery email is on its way.",
        );
      } else {
        await platform.authentication.updatePassword(password);
        setSuccess("Password updated.");
        router.replace("/settings");
      }
    })()
      .catch((reason) => setError(message(reason)))
      .finally(() => setBusy(false));
  };

  if (!configured)
    return (
      <div className="auth-card">
        <h1>{title[mode]}</h1>
        <Notice title="Accounts are not configured">
          This deployment remains fully usable in local mode. Add the two public
          Supabase environment variables to enable accounts.
        </Notice>
        <LinkButton href="/studio">Continue to local Studio</LinkButton>
      </div>
    );

  if (mode === "reset" && !identity)
    return (
      <div className="auth-card">
        <h1>{title[mode]}</h1>
        <Notice title="Recovery session required">
          Open the newest password-recovery link. If it expired, request another
          email.
        </Notice>
        <LinkButton href="/forgot-password">Request another link</LinkButton>
      </div>
    );

  return (
    <form className="auth-card" onSubmit={submit}>
      <p className="section-label">Theoria account</p>
      <h1>{title[mode]}</h1>
      <p>
        Sign in for your public profile and publishing tools. Your local drafts,
        learning progress, and import history stay in this browser and are not
        uploaded or merged automatically.
      </p>
      {mode !== "reset" ? (
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      ) : null}
      {mode === "signup" ? (
        <>
          <Field
            label="Handle"
            name="handle"
            autoComplete="username"
            minLength={3}
            maxLength={30}
            pattern="[a-z][a-z0-9_]{2,29}"
            hint="3–30 lowercase letters, numbers, or underscores; begin with a letter."
            required
          />
          <Field
            label="Display name"
            name="displayName"
            autoComplete="name"
            minLength={1}
            maxLength={80}
            required
          />
        </>
      ) : null}
      {mode === "login" || mode === "signup" || mode === "reset" ? (
        <Field
          label={mode === "reset" ? "New password" : "Password"}
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={8}
          {...(mode === "login" ? {} : { hint: "Use at least 8 characters." })}
          required
        />
      ) : null}
      {error ? (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="form-message success-message" role="status">
          {success}
        </p>
      ) : null}
      <Button disabled={busy}>
        {busy
          ? "Working…"
          : mode === "forgot"
            ? "Send recovery email"
            : mode === "reset"
              ? "Update password"
              : title[mode]}
      </Button>
      {mode === "login" ? (
        <div className="auth-links">
          <LinkButton href="/signup" secondary>
            Create account
          </LinkButton>
          <LinkButton href="/forgot-password" secondary>
            Forgot password
          </LinkButton>
        </div>
      ) : null}
    </form>
  );
}
