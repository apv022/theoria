import { AuthForm } from "../../../components/auth-form";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ next?: string }>;
}) {
  const requested = (await searchParams).next;
  const next = requested?.startsWith("/") ? requested : "/settings";
  return (
    <div className="page-wrap auth-page">
      <AuthForm mode="login" next={next} />
    </div>
  );
}
