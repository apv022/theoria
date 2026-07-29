import { NextResponse, type NextRequest } from "next/server";
import { serverPlatformClient } from "../../../../../../../lib/platform/server";

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    readonly params: Promise<{ slug: string; version: string }>;
  },
) {
  try {
    const { slug, version } = await params;
    const platform = await serverPlatformClient();
    const source = await platform.repository.downloadSource(slug, version);
    return new NextResponse(source, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${slug}-${version}.mcf.zip"`,
        "Content-Type": "application/zip",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "SOURCE_UNAVAILABLE",
          message: "This source archive is unavailable or unauthorized.",
        },
      },
      { status: 404 },
    );
  }
}
