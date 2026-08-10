"use server";

import { safeNextPath } from "../../../lib/auth-redirect";
import { serverPlatformClient } from "../../../lib/platform/server";

const fallback = "/settings/profile";

const resendPath = "/resend-confirmation?error=invalid_confirmation";

export async function confirmEmail(
  _previous: string | null,
  formData: FormData,
): Promise<string> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""), fallback);

  if (!tokenHash || type !== "email") return resendPath;

  try {
    const platform = await serverPlatformClient();
    await platform.authentication.verifySignup(tokenHash);
  } catch {
    return resendPath;
  }

  return next;
}
