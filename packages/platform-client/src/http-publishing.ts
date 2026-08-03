import type {
  PublishingClient,
  PublishingOptions,
  PublishingRequest,
  PublishingResult,
} from "./index";
import { PlatformOperationError } from "./errors";

interface ErrorResponse {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly retryable?: boolean;
  };
}

const responseError = async (response: Response) => {
  const value = (await response.json().catch(() => ({}))) as ErrorResponse;
  return new PlatformOperationError(
    value.error?.code ?? "PUBLISHING_FAILED",
    value.error?.message ?? `Publishing failed with status ${response.status}.`,
    value.error?.retryable ?? response.status >= 500,
  );
};

export function createHttpPublishingClient(
  fetcher: typeof fetch = fetch,
): PublishingClient {
  return {
    async slugAvailable(slug, packageId) {
      const query = new URLSearchParams({ slug });
      if (packageId) query.set("packageId", packageId);
      const response = await fetcher(`/api/publishing/slug?${query}`);
      if (!response.ok) throw await responseError(response);
      const value = (await response.json()) as { readonly available: boolean };
      return value.available;
    },

    async publish(
      request: PublishingRequest,
      options: PublishingOptions = {},
    ): Promise<PublishingResult> {
      options.onProgress?.("checking", 10);
      const form = new FormData();
      form.set("archive", request.archive, `${request.slug}.mcf.zip`);
      form.set(
        "metadata",
        JSON.stringify({
          ...(request.packageId ? { packageId: request.packageId } : {}),
          ...(request.repositoryId
            ? { repositoryId: request.repositoryId }
            : {}),
          ...(request.parentPackageId
            ? { parentPackageId: request.parentPackageId }
            : {}),
          ...(request.parentVersionId
            ? { parentVersionId: request.parentVersionId }
            : {}),
          slug: request.slug,
          title: request.title,
          description: request.description,
          visibility: request.visibility,
          version: request.version,
          mcfVersion: request.mcfVersion,
          packageKind: request.packageKind,
          sourceChecksum: request.sourceChecksum,
          manifestSummary: request.manifestSummary,
          validationSummary: request.validationSummary,
          releaseNotes: request.releaseNotes,
        }),
      );
      options.onProgress?.("uploading", 30);
      const response = await fetcher("/api/publishing", {
        method: "POST",
        body: form,
        ...(options.signal ? { signal: options.signal } : {}),
      });
      options.onProgress?.("finalizing", 85);
      if (!response.ok) throw await responseError(response);
      const value = (await response.json()) as PublishingResult;
      options.onProgress?.("complete", 100);
      return value;
    },
  };
}
