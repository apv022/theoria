const loopback = new Set(["localhost", "127.0.0.1", "::1"]);

export function safeNextPath(
  requested: string | null | undefined,
  fallback = "/settings",
): string {
  if (
    !requested?.startsWith("/") ||
    requested.startsWith("//") ||
    requested.includes("\\") ||
    [...requested].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    return fallback;
  return requested;
}

export function canonicalSiteOrigin(currentOrigin: string): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === "production")
      throw new Error(
        "Account email links are unavailable because NEXT_PUBLIC_SITE_URL is not configured.",
      );
    return new URL(currentOrigin).origin;
  }
  const url = new URL(configured);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !loopback.has(url.hostname))
  )
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must be an HTTPS origin without a path, query, or credentials.",
    );
  return url.origin;
}

export function authCallbackUrl(next: string, currentOrigin: string): string {
  const callback = new URL(
    "/auth/callback",
    canonicalSiteOrigin(currentOrigin),
  );
  callback.searchParams.set("next", safeNextPath(next));
  return callback.toString();
}
