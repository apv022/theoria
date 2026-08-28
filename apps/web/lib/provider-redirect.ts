import { canonicalSiteOrigin } from "./auth-redirect";

export function openRouterCallbackUrl(currentOrigin: string): string {
  return new URL(
    "/settings/ai-providers",
    canonicalSiteOrigin(currentOrigin),
  ).toString();
}
