import { extractSafeArchive } from "@theoria/mcf-browser";
import { NextResponse } from "next/server";
import { serverPlatformClient } from "../../../../../../../lib/platform/server";

const types: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ slug: string; version: string }> },
) {
  try {
    const { slug, version } = await params;
    const platform = await serverPlatformClient();
    const release = await platform.repository.getVersion(slug, version);
    const cover = release?.version.manifestSummary.cover;
    if (!release || typeof cover !== "string")
      return new NextResponse(null, { status: 404 });
    const source = await platform.repository.downloadSource(slug, version);
    const file = extractSafeArchive(
      new Uint8Array(await source.arrayBuffer()),
    ).find((entry) => entry.path === cover);
    if (!file) return new NextResponse(null, { status: 404 });
    const extension = cover.slice(cover.lastIndexOf(".")).toLowerCase();
    const contentType = types[extension];
    if (!contentType) return new NextResponse(null, { status: 415 });
    return new NextResponse(file.bytes, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": contentType,
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
