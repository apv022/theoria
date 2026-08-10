import type { Metadata } from "next";
import Link from "next/link";
import { safeNextPath } from "../../../lib/auth-redirect";
import { ConfirmEmailForm } from "./confirm-email-form";

export const metadata: Metadata = { title: "Confirm email address" };

export default async function ConfirmEmailPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    token_hash?: string;
    type?: string;
    next?: string;
  }>;
}) {
  const query = await searchParams;
  const next = safeNextPath(query.next, "/settings/profile");
  return (
    <main className="page-wrap auth-page">
      <section className="auth-card confirmation-card">
        <p className="section-label">Theoria account</p>
        <h1>Confirm your email address</h1>
        <p>
          When you are ready, confirm this email address to finish creating
          your account. This page does not use the confirmation link until you
          press the button.
        </p>
        <ConfirmEmailForm
          tokenHash={query.token_hash ?? ""}
          type={query.type ?? ""}
          next={next}
        />
        <p className="confirmation-help">
          If the link is expired or no longer works, you can request another
          confirmation email.
        </p>
        <Link className="button button-secondary" href="/resend-confirmation">
          Resend confirmation email
        </Link>
      </section>
    </main>
  );
}
