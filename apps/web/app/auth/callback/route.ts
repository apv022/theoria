import { NextResponse, type NextRequest } from "next/server";
import { serverPlatformClient } from "../../../lib/platform/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const requested = request.nextUrl.searchParams.get("next");
  const next = requested?.startsWith("/") ? requested : "/settings";
  if (!code)
    return NextResponse.redirect(
      new URL("/login?error=missing_callback_code", request.url),
    );
  try {
    const platform = await serverPlatformClient();
    await platform.authentication.exchangeCode(code);
    return NextResponse.redirect(new URL(next, request.url));
  } catch {
    return NextResponse.redirect(
      new URL("/login?error=expired_callback", request.url),
    );
  }
}
