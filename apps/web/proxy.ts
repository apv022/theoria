import type { NextRequest } from "next/server";
import { refreshSupabaseSession } from "./lib/platform/proxy";

export function proxy(request: NextRequest) {
  return refreshSupabaseSession(request);
}

export const config = {
  matcher: [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/settings/:path*",
    "/profiles/:path*",
    "/auth/:path*",
  ],
};
