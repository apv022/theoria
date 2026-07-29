import { PlatformOperationError } from "@theoria/platform-client";
import { NextResponse, type NextRequest } from "next/server";
import { serverPlatformClient } from "../../../../lib/platform/server";

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  const packageId = request.nextUrl.searchParams.get("packageId") ?? undefined;
  if (
    !/^[a-z][a-z0-9-]{2,62}$/.test(slug) ||
    (packageId && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(packageId))
  )
    return NextResponse.json(
      { error: { code: "INVALID_SLUG", message: "Enter a valid slug." } },
      { status: 400 },
    );
  try {
    const platform = await serverPlatformClient();
    if (!(await platform.authentication.currentIdentity()))
      throw new PlatformOperationError(
        "AUTH_REQUIRED",
        "Sign in before checking a publishing slug.",
      );
    return NextResponse.json({
      available: await platform.publishing.slugAvailable(slug, packageId),
    });
  } catch (reason) {
    const message =
      reason instanceof Error ? reason.message : "Slug check failed.";
    return NextResponse.json(
      { error: { code: "SLUG_CHECK_FAILED", message, retryable: true } },
      { status: reason instanceof PlatformOperationError ? 401 : 503 },
    );
  }
}
