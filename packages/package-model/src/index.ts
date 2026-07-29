export type PackageId = string & { readonly __brand: "PackageId" };
export type DraftId = string & { readonly __brand: "DraftId" };

export const packageId = (value: string): PackageId => value as PackageId;
export const draftId = (value: string): DraftId => value as DraftId;

export type PackageKind =
  | "course"
  | "module"
  | "lesson"
  | "question_bank"
  | "asset_collection";
export type McfVersion = "1.0" | "1.1";
export type PackageVisibility = "private" | "unlisted" | "public";
export type ValidationState = "unchecked" | "valid" | "invalid" | "unavailable";

export interface PackageAuthor {
  readonly name: string;
  readonly handle?: string;
}

export interface PackageManifest {
  readonly mcf: McfVersion;
  readonly kind: PackageKind;
  readonly id: PackageId;
  readonly title: string;
  readonly language: string;
  readonly version: string;
  readonly description?: string;
  readonly authors: readonly PackageAuthor[];
  readonly license?: string;
}

export interface ValidationDiagnostic {
  readonly severity: "error" | "warning" | "info";
  readonly code: string;
  readonly message: string;
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
  readonly objectId?: string;
}

export interface ValidationSummary {
  readonly state: ValidationState;
  readonly diagnostics: readonly ValidationDiagnostic[];
  readonly checkedAt?: string;
}

export interface PackageDraft {
  readonly id: DraftId;
  readonly title: string;
  readonly kind: PackageKind;
  readonly mcf: McfVersion;
  readonly updatedAt: string;
  readonly sourceFiles: readonly string[];
  readonly validation: ValidationSummary;
}

export interface LibraryEntry {
  readonly packageId: PackageId;
  readonly title: string;
  readonly packageKind: PackageKind;
  readonly mcfVersion: McfVersion;
  readonly version: string;
  readonly addedAt: string;
  readonly lastOpenedAt?: string;
  readonly origin: "imported" | "repository" | "authored";
  readonly source:
    | { readonly type: "package"; readonly packageRecordId: PackageId }
    | { readonly type: "compilation"; readonly compilationId: string };
}

export interface LearnerQuestionState {
  readonly response: unknown;
  readonly complete: boolean;
  readonly correct: boolean | null;
  readonly attempted: boolean;
  readonly checked: boolean;
  readonly earned: number | null;
  readonly attempts: number;
  readonly updatedAt: string;
}

export interface LearnerAssessmentState {
  readonly submitted: boolean;
  readonly score: number;
  readonly possible: number;
  readonly passed: boolean | null;
  readonly pendingManual: boolean;
  readonly attempts: number;
  readonly submittedAt: string;
}

export interface LearnerProgress {
  readonly schema: 1;
  readonly packageId: PackageId;
  readonly packageVersion: string;
  readonly contentId: string;
  readonly revision: number;
  readonly currentLessonId?: string;
  readonly questions: Readonly<Record<string, LearnerQuestionState>>;
  readonly activities: Readonly<Record<string, boolean>>;
  readonly assessments: Readonly<Record<string, LearnerAssessmentState>>;
  readonly lessons: Readonly<Record<string, boolean>>;
  readonly viewedActivities: Readonly<Record<string, boolean>>;
  readonly questionOrders: Readonly<Record<string, readonly string[]>>;
  readonly matchingOrders: Readonly<Record<string, readonly string[]>>;
  readonly orderingOrders: Readonly<Record<string, readonly string[]>>;
  readonly manualCompletions: Readonly<Record<string, boolean>>;
  readonly assignmentSubmissions: Readonly<
    Record<
      string,
      {
        readonly text?: string;
        readonly url?: string;
        readonly files: readonly {
          readonly name: string;
          readonly size: number;
          readonly type: string;
        }[];
        readonly submittedAt: string;
      }
    >
  >;
  readonly completedAt?: string;
  readonly startedAt: string;
  readonly lastOpenedAt: string;
  readonly updatedAt: string;
}

export interface ImportedPackage {
  readonly id: PackageId;
  readonly manifest: PackageManifest;
  readonly archive: Blob;
  readonly sourceFilename: string;
  readonly sourceChecksum: string;
  readonly archiveSize: number;
  readonly importedAt: string;
  readonly validation: ValidationSummary;
}

export interface PackageIdentity {
  readonly id: PackageId;
  readonly title: string;
  readonly version: string;
}

export interface CompilationRecord {
  readonly id: string;
  readonly sourceFilename: string;
  readonly identity: PackageIdentity;
  readonly packageKind: PackageKind;
  readonly mcfVersion: McfVersion;
  readonly sourceChecksum: string;
  readonly sourceArchive?: Blob;
  readonly compiledArtifact: Blob;
  readonly validation: ValidationSummary;
  readonly diagnostics: readonly ValidationDiagnostic[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly syncState: "local" | "queued" | "synced";
}
