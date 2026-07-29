import {
  createSupabasePlatformClient,
  createUnavailablePlatformClient,
  type PlatformClient,
  type SupabaseDatabase,
} from "@theoria/platform-client";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function serverPlatformClient(): Promise<PlatformClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return createUnavailablePlatformClient();
  const cookieStore = await cookies();
  return createSupabasePlatformClient(
    createServerClient<SupabaseDatabase>(url, key, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (values) => {
          try {
            for (const { name, value, options } of values)
              cookieStore.set(name, value, options);
          } catch {
            // Server Components cannot write cookies. The request proxy owns refresh writes.
          }
        },
      },
    }),
  );
}
