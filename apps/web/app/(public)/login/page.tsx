import { AuthForm } from "../../../components/auth-form";
import { safeNextPath } from "../../../lib/auth-redirect";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const query = await searchParams;
  const next = safeNextPath(query.next);
  const errors: Record<string, string> = {
    missing_callback_code:
      "The account link is incomplete. Open the newest link from your email or request another one.",
    expired_callback:
      "That account link is invalid or expired. Open the newest email or request another link.",
  };
  return (
    <div className="page-wrap auth-page">
      <AuthForm
        mode="login"
        next={next}
        initialError={query.error ? errors[query.error] : undefined}
      />
    </div>
  );
}
