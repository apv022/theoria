import { AuthForm } from "../../../components/auth-form";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <div className="page-wrap auth-page">
      <AuthForm mode="signup" />
    </div>
  );
}
