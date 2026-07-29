import {
  packageId,
  type PackageManifest,
  type ValidationDiagnostic,
  type ValidationSummary,
} from "@theoria/package-model";
import type { Diagnostic, McfPackage } from "mcf-npm/model";
import { validatePackage } from "mcf-npm/package";
import {
  ArchiveSecurityError,
  createDeterministicArchive,
  extractSafeArchive,
  normalizeDirectoryFiles,
} from "./archive";
import { compileLearnerPackage, countPackage } from "./compiler";
import type { EngineProgress, EngineResult, PackageInput } from "./types";
import { isLearnerRenderable } from "./types";
import { clearVirtualFiles, mountVirtualFiles, type VirtualFile } from "./vfs";

const buffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

const checksum = async (bytes: Uint8Array): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const convertDiagnostic = (value: Diagnostic): ValidationDiagnostic => ({
  code: value.code,
  severity: value.severity,
  message: value.message,
  file: value.file,
  ...(value.location?.line === undefined ? {} : { line: value.location.line }),
  ...(value.location?.column === undefined
    ? {}
    : { column: value.location.column }),
  ...(value.object_id === undefined ? {} : { objectId: value.object_id }),
});

function manifestOf(value: McfPackage): PackageManifest {
  return {
    mcf: value.mcf,
    kind: value.kind,
    id: packageId(value.id),
    title: value.title,
    language: value.language,
    version: value.version ?? "0.0.0",
    ...(value.description === undefined
      ? {}
      : { description: value.description }),
    authors: (value.authors ?? []).map((name) => ({ name })),
    ...(value.license === undefined ? {} : { license: value.license }),
  };
}

const progress = (
  callback: (value: EngineProgress) => void,
  requestId: string,
  operation: "inspect" | "validate" | "compile",
  phase: EngineProgress["phase"],
  completed: number,
  message: string,
): void =>
  callback({ requestId, operation, phase, completed, total: 100, message });

export async function executeEngineRequest(
  requestId: string,
  operation: "inspect" | "validate" | "compile",
  input: PackageInput,
  onProgress: (value: EngineProgress) => void,
  isCancelled: () => boolean = () => false,
): Promise<EngineResult> {
  try {
    progress(
      onProgress,
      requestId,
      operation,
      "importing",
      5,
      "Reading package source",
    );
    let files: readonly VirtualFile[];
    let sourceArchive: Uint8Array;
    if (input.type === "archive") {
      sourceArchive = new Uint8Array(input.bytes);
      progress(
        onProgress,
        requestId,
        operation,
        "extracting",
        15,
        "Checking archive security limits",
      );
      files = extractSafeArchive(sourceArchive);
    } else {
      files = normalizeDirectoryFiles(input.files);
      sourceArchive = createDeterministicArchive(files);
    }
    if (isCancelled()) return { requestId, operation, status: "cancelled" };
    mountVirtualFiles(files);
    progress(
      onProgress,
      requestId,
      operation,
      "validating",
      35,
      "Validating declared MCF version",
    );
    const result = await validatePackage("/package");
    const diagnostics = result.diagnostics.map(convertDiagnostic);
    const validation: ValidationSummary = {
      state: result.valid ? "valid" : "invalid",
      diagnostics,
      checkedAt: new Date().toISOString(),
    };
    if (!result.valid || !result.package) {
      return { requestId, operation, status: "error", diagnostics };
    }
    if (isCancelled()) return { requestId, operation, status: "cancelled" };
    const counts = countPackage(result.package);
    const summary = {
      manifest: manifestOf(result.package),
      lessonCount: counts.lessons,
      activityCount: counts.activities,
      questionCount: counts.questions,
      sourceChecksum: await checksum(sourceArchive),
      sourceSize: sourceArchive.byteLength,
    };
    let compiledArtifact: ArrayBuffer | undefined;
    if (operation === "compile") {
      if (!isLearnerRenderable(result.package.kind)) {
        return {
          requestId,
          operation,
          status: "unsupported",
          reason: `${result.package.kind} packages validate in the browser but are not learner-renderable.`,
          diagnostics,
        };
      }
      progress(
        onProgress,
        requestId,
        operation,
        "compiling",
        70,
        "Rendering learner package",
      );
      const artifact = compileLearnerPackage(result.package, files);
      compiledArtifact = buffer(artifact);
      progress(
        onProgress,
        requestId,
        operation,
        "packaging",
        95,
        "Creating deterministic compiled ZIP",
      );
    }
    progress(onProgress, requestId, operation, "packaging", 100, "Complete");
    return {
      requestId,
      operation,
      status: "ok",
      summary,
      readerPackage: result.package,
      sourceFiles: files.map((file) => ({
        path: file.path,
        bytes: buffer(file.bytes),
      })),
      validation,
      diagnostics,
      sourceArchive: buffer(sourceArchive),
      ...(compiledArtifact === undefined ? {} : { compiledArtifact }),
    };
  } catch (error) {
    const diagnostic: ValidationDiagnostic = {
      code:
        error instanceof ArchiveSecurityError
          ? error.code
          : "MCF_BROWSER_FATAL",
      severity: "error",
      file: input.name,
      message:
        error instanceof Error
          ? error.message
          : "Unknown browser engine failure.",
    };
    return {
      requestId,
      operation,
      status: "error",
      diagnostics: [diagnostic],
      ...(error instanceof ArchiveSecurityError
        ? {}
        : { fatal: diagnostic.message }),
    };
  } finally {
    clearVirtualFiles();
  }
}
