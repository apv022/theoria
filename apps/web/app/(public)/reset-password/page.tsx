import { AuthForm } from "../../../components/auth-form";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <div className="page-wrap auth-page">
      <AuthForm mode="reset" />
    </div>
  );
}
