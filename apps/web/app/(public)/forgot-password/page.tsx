import { AuthForm } from "../../../components/auth-form";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <div className="page-wrap auth-page">
      <AuthForm mode="forgot" />
    </div>
  );
}
