import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const browserSource = path.resolve(root, "../../packages/mcf-browser/src");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@theoria/ai-provider",
    "@theoria/authoring",
    "@theoria/mcf-browser",
    "@theoria/local-store",
    "@theoria/package-model",
    "@theoria/platform-client",
    "@theoria/reader",
    "@theoria/ui",
    "mcf-npm",
  ],
  webpack(config, { webpack }) {
    const replacements = new Map([
      ["node:fs/promises", path.join(browserSource, "shims/fs-promises.ts")],
      ["node:path", path.join(browserSource, "shims/path.ts")],
      ["node:crypto", path.join(browserSource, "shims/crypto.ts")],
    ]);
    for (const [request, replacement] of replacements) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          new RegExp(`^${request.replace("/", "\\/")}$`),
          replacement,
        ),
      );
    }
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /package-reader\.js$/,
        (resource: { context?: string; request: string }) => {
          if (resource.context?.includes("mcf-npm")) {
            resource.request = path.join(
              browserSource,
              "shims/package-reader.ts",
            );
          }
        },
      ),
    );
    return config;
  },
};

export default nextConfig;
