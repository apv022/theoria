import {
  PlatformOperationError,
  type PublishingRequest,
} from "@theoria/platform-client";
import { NextResponse, type NextRequest } from "next/server";
import { serverPlatformClient } from "../../../lib/platform/server";

const semver =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kinds = new Set([
  "course",
  "module",
  "lesson",
  "question_bank",
  "asset_collection",
]);

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseMetadata = (value: string): Omit<PublishingRequest, "archive"> => {
  const parsed: unknown = JSON.parse(value);
  if (!record(parsed))
    throw new Error("Publishing metadata must be an object.");
  if (
    (parsed.packageId !== undefined &&
      (typeof parsed.packageId !== "string" || !uuid.test(parsed.packageId))) ||
    (parsed.repositoryId !== undefined &&
      (typeof parsed.repositoryId !== "string" ||
        !uuid.test(parsed.repositoryId))) ||
    (parsed.parentPackageId !== undefined &&
      (typeof parsed.parentPackageId !== "string" ||
        !uuid.test(parsed.parentPackageId))) ||
    (parsed.parentVersionId !== undefined &&
      (typeof parsed.parentVersionId !== "string" ||
        !uuid.test(parsed.parentVersionId))) ||
    Boolean(parsed.parentPackageId) !== Boolean(parsed.parentVersionId) ||
    typeof parsed.slug !== "string" ||
    !/^[a-z][a-z0-9-]{2,62}$/.test(parsed.slug) ||
    typeof parsed.title !== "string" ||
    parsed.title.trim().length < 1 ||
    parsed.title.length > 200 ||
    typeof parsed.description !== "string" ||
    parsed.description.length > 4000 ||
    !["public", "unlisted", "private"].includes(String(parsed.visibility)) ||
    typeof parsed.version !== "string" ||
    !semver.test(parsed.version) ||
    !["1.0", "1.1"].includes(String(parsed.mcfVersion)) ||
    !kinds.has(String(parsed.packageKind)) ||
    typeof parsed.sourceChecksum !== "string" ||
    !/^[0-9a-f]{64}$/.test(parsed.sourceChecksum) ||
    !record(parsed.manifestSummary) ||
    !record(parsed.validationSummary) ||
    parsed.validationSummary.state !== "valid" ||
    !Array.isArray(parsed.validationSummary.diagnostics) ||
    typeof parsed.releaseNotes !== "string" ||
    parsed.releaseNotes.length > 10_000
  )
    throw new Error("Publishing metadata is invalid or incomplete.");
  return parsed as unknown as Omit<PublishingRequest, "archive">;
};

const failure = (reason: unknown) => {
  const operation =
    reason instanceof PlatformOperationError ? reason : undefined;
  const message =
    reason instanceof Error ? reason.message : "Package publishing failed.";
  const code = operation?.code ?? "PUBLISHING_FAILED";
  const status =
    code === "AUTH_REQUIRED"
      ? 401
      : ["CHECKSUM_MISMATCH", "VALIDATION_REQUIRED"].includes(code)
        ? 422
        : ["VERSION_CONFLICT"].includes(code)
          ? 409
          : operation?.retryable
            ? 503
            : 400;
  return NextResponse.json(
    {
      error: {
        code,
        message,
        retryable: operation?.retryable ?? false,
      },
    },
    { status },
  );
};

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost: string | undefined;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = undefined;
    }
    if (!originHost || originHost !== request.headers.get("host"))
      return NextResponse.json(
        {
          error: {
            code: "ORIGIN_REJECTED",
            message: "Invalid request origin.",
          },
        },
        { status: 403 },
      );
  }
  try {
    const form = await request.formData();
    const archive = form.get("archive");
    const metadata = form.get("metadata");
    if (!(archive instanceof Blob) || typeof metadata !== "string")
      throw new Error("Source archive and publishing metadata are required.");
    if (
      archive.size === 0 ||
      archive.size > 52_428_800 ||
      !["application/zip", "application/x-zip-compressed"].includes(
        archive.type,
      )
    )
      throw new PlatformOperationError(
        "ARCHIVE_REJECTED",
        "Upload a non-empty ZIP source archive no larger than 50 MiB.",
      );
    const platform = await serverPlatformClient();
    if (!(await platform.authentication.currentIdentity()))
      throw new PlatformOperationError(
        "AUTH_REQUIRED",
        "Sign in before publishing.",
      );
    const result = await platform.publishing.publish(
      { ...parseMetadata(metadata), archive },
      { signal: request.signal },
    );
    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (reason) {
    return failure(reason);
  }
}
