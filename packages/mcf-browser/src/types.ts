import type {
  McfVersion,
  PackageKind,
  PackageManifest,
  ValidationDiagnostic,
  ValidationSummary,
} from "@theoria/package-model";
import type { McfPackage } from "mcf-npm/model";

export type ReaderPackage = McfPackage;

export type BrowserEngineState =
  | { readonly status: "uninitialized" }
  | { readonly status: "initializing" }
  | {
      readonly status: "ready";
      readonly supportedVersions: readonly McfVersion[];
    }
  | { readonly status: "unsupported"; readonly reason: string }
  | { readonly status: "fatal"; readonly message: string };

export type EngineOperation = "inspect" | "validate" | "compile";

export interface EngineProgress {
  readonly requestId: string;
  readonly operation: EngineOperation;
  readonly phase:
    | "importing"
    | "extracting"
    | "validating"
    | "compiling"
    | "packaging"
    | "persisting";
  readonly completed: number;
  readonly total?: number;
  readonly message: string;
}

export interface SerializedFile {
  readonly path: string;
  readonly bytes: ArrayBuffer;
}

export type PackageInput =
  | {
      readonly type: "archive";
      readonly name: string;
      readonly bytes: ArrayBuffer;
    }
  | {
      readonly type: "directory";
      readonly name: string;
      readonly files: readonly SerializedFile[];
    };

export type EngineRequest =
  | {
      readonly type: "request";
      readonly requestId: string;
      readonly operation: EngineOperation;
      readonly input: PackageInput;
    }
  | { readonly type: "cancel"; readonly requestId: string };

export interface PackageSummary {
  readonly manifest: PackageManifest;
  readonly lessonCount: number;
  readonly activityCount: number;
  readonly questionCount: number;
  readonly sourceChecksum: string;
  readonly sourceSize: number;
}

export type EngineResult =
  | {
      readonly requestId: string;
      readonly status: "ok";
      readonly operation: EngineOperation;
      readonly summary: PackageSummary;
      readonly readerPackage: ReaderPackage;
      readonly sourceFiles: readonly SerializedFile[];
      readonly validation: ValidationSummary;
      readonly diagnostics: readonly ValidationDiagnostic[];
      readonly sourceArchive: ArrayBuffer;
      readonly compiledArtifact?: ArrayBuffer;
    }
  | {
      readonly requestId: string;
      readonly status: "unsupported";
      readonly operation: EngineOperation;
      readonly reason: string;
      readonly diagnostics: readonly ValidationDiagnostic[];
    }
  | {
      readonly requestId: string;
      readonly status: "cancelled";
      readonly operation: EngineOperation;
    }
  | {
      readonly requestId: string;
      readonly status: "error";
      readonly operation: EngineOperation;
      readonly diagnostics: readonly ValidationDiagnostic[];
      readonly fatal?: string;
    };

export type WorkerMessage =
  | { readonly type: "ready" }
  | { readonly type: "progress"; readonly progress: EngineProgress }
  | { readonly type: "result"; readonly result: EngineResult };

export interface BrowserMcfEngine {
  readonly state: BrowserEngineState;
  initialize(): Promise<BrowserEngineState>;
  execute(
    request: Extract<EngineRequest, { readonly type: "request" }>,
    onProgress?: (progress: EngineProgress) => void,
  ): Promise<EngineResult>;
  cancel(requestId: string): void;
  dispose(): void;
}

export const isLearnerRenderable = (
  kind: PackageKind,
): kind is "course" | "module" | "lesson" =>
  kind === "course" || kind === "module" || kind === "lesson";
