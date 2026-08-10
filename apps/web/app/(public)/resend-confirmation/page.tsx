import type { Metadata } from "next";
import { AuthForm } from "../../../components/auth-form";

export const metadata: Metadata = { title: "Resend confirmation email" };

export default async function ResendConfirmationPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  return (
    <div className="page-wrap auth-page">
      <AuthForm
        mode="resend"
        initialError={
          query.error === "invalid_confirmation"
            ? "That confirmation link is invalid, expired, or has already been used. Request a new confirmation email below."
            : undefined
        }
      />
    </div>
  );
}
