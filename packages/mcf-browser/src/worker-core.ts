import {
  packageId,
  type PackageManifest,
  type ValidationDiagnostic,
  type ValidationSummary,
} from "@theoria/package-model";
import type { Diagnostic } from "mcf-npm/model";
import { validatePackage } from "mcf-npm/package";
import {
  ArchiveSecurityError,
  createDeterministicArchive,
  extractSafeArchive,
  normalizeDirectoryFiles,
} from "./archive";
import { compileLearnerPackage, countPackage } from "./compiler";
import type {
  EngineProgress,
  EngineResult,
  PackageInput,
  ReaderPackage,
} from "./types";
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

const stringList = (value: unknown): readonly string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;

const packageLevel = (value: unknown): PackageManifest["level"] | undefined => {
  if (typeof value === "string") return { identifier: value };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  const label = typeof record.label === "string" ? record.label : undefined;
  const identifier =
    typeof record.identifier === "string" ? record.identifier : undefined;
  return label || identifier
    ? { ...(label ? { label } : {}), ...(identifier ? { identifier } : {}) }
    : undefined;
};

const learningOutcomes = (
  value: unknown,
): PackageManifest["learningOutcomes"] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const outcomes = value.flatMap((item) => {
    if (typeof item === "string") return [{ statement: item }];
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.statement !== "string") return [];
    return [
      {
        ...(typeof record.id === "string" ? { id: record.id } : {}),
        statement: record.statement,
      },
    ];
  });
  return outcomes.length ? outcomes : undefined;
};

export const supportedMcfVersion = "1.1" as const;
export const mcf10DeprecationMessage =
  "MCF 1.0 is no longer supported. Theoria currently supports MCF 1.1.";

const declaredMcfVersion = (
  files: readonly VirtualFile[],
): string | undefined => {
  const manifest = files.find((file) => file.path === "manifest.yaml");
  if (!manifest) return undefined;
  const source = new TextDecoder().decode(manifest.bytes);
  const match = /^\s*mcf\s*:\s*(?:["']([^"']+)["']|([^\s#]+))/m.exec(source);
  return (match?.[1] ?? match?.[2])?.trim();
};

export const unsupportedMcfVersionReason = (
  version: string,
): string | undefined =>
  version === supportedMcfVersion
    ? undefined
    : version === "1.0"
      ? mcf10DeprecationMessage
      : `MCF ${version} is not supported. Theoria currently supports MCF ${supportedMcfVersion}.`;

const unsupportedVersionResult = (
  requestId: string,
  operation: "inspect" | "validate" | "compile",
  inputName: string,
  version: string,
): EngineResult => {
  const reason =
    unsupportedMcfVersionReason(version) ?? "Unsupported MCF version.";
  return {
    requestId,
    operation,
    status: "unsupported",
    reason,
    diagnostics: [
      {
        code: "MCF_VERSION_UNSUPPORTED",
        severity: "error",
        file: inputName,
        message: reason,
      },
    ],
  };
};

export function packageManifestFromMcf(value: ReaderPackage): PackageManifest {
  const raw = value as unknown as Record<string, unknown>;
  const subjects = stringList(value.subjects);
  const keywords = stringList(value.keywords);
  const level = packageLevel(value.level);
  const outcomes = learningOutcomes(value.learning_outcomes);
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
    ...(typeof raw.cover === "string" ? { cover: raw.cover } : {}),
    authors: (value.authors ?? []).map((name) => ({ name })),
    ...(value.license === undefined ? {} : { license: value.license }),
    ...(subjects ? { subjects } : {}),
    ...(keywords ? { keywords } : {}),
    ...(level ? { level } : {}),
    ...(outcomes ? { learningOutcomes: outcomes } : {}),
    ...(typeof value.estimated_duration === "string"
      ? { estimatedDuration: value.estimated_duration }
      : {}),
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
    const declaredVersion = declaredMcfVersion(files);
    if (declaredVersion && declaredVersion !== supportedMcfVersion) {
      return unsupportedVersionResult(
        requestId,
        operation,
        input.name,
        declaredVersion,
      );
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
      manifest: packageManifestFromMcf(result.package as ReaderPackage),
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
      readerPackage: result.package as ReaderPackage,
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
