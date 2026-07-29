"use client";

import {
  createHttpPublishingClient,
  createSupabasePlatformClient,
  createUnavailablePlatformClient,
  type PlatformClient,
  type SupabaseDatabase,
} from "@theoria/platform-client";
import { createBrowserClient } from "@supabase/ssr";

let singleton: PlatformClient | undefined;

export function browserPlatformClient(): PlatformClient {
  if (singleton) return singleton;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    singleton = createUnavailablePlatformClient();
    return singleton;
  }
  const client = createSupabasePlatformClient(
    createBrowserClient<SupabaseDatabase>(url, key),
  );
  singleton = { ...client, publishing: createHttpPublishingClient() };
  return singleton;
}
