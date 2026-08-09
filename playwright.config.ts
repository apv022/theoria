import { defineConfig } from "@playwright/test";

const authEnvironment =
  "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55431 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000";
const serverCommand = `${authEnvironment} node scripts/test-web-server.mjs`;

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      process.env.PLAYWRIGHT_PREBUILT === "1"
        ? serverCommand
        : `${authEnvironment} corepack pnpm --filter @theoria/web build && ${serverCommand}`,
    port: 3000,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
