import type {
  McfVersion,
  PackageId,
  PackageKind,
  PackageManifest,
  PackageVisibility,
  ValidationSummary,
} from "@theoria/package-model";

export type AuthEvent =
  | "initial"
  | "signed-in"
  | "signed-out"
  | "token-refreshed"
  | "password-recovery"
  | "user-updated"
  | "unavailable"
  | "expired";

export interface PublicProfile {
  readonly id: string;
  readonly handle: string;
  readonly displayName: string;
  readonly bio: string;
  readonly avatarPath?: string;
  readonly location?: string;
  readonly websiteUrl?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AccountIdentity {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly profile: PublicProfile;
}

export interface AuthResult {
  readonly identity: AccountIdentity | null;
  readonly verificationRequired: boolean;
}

export interface SignUpRequest {
  readonly email: string;
  readonly password: string;
  readonly handle: string;
  readonly displayName: string;
  readonly emailRedirectTo: string;
}

export interface AuthStateChange {
  readonly event: AuthEvent;
  readonly identity: AccountIdentity | null;
}

export interface AuthenticationClient {
  readonly configured: boolean;
  currentIdentity(): Promise<AccountIdentity | null>;
  signUp(request: SignUpRequest): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AccountIdentity>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  exchangeCode(code: string): Promise<void>;
  refreshSession(): Promise<boolean>;
  subscribe(listener: (change: AuthStateChange) => void): () => void;
}

export interface ProfileUpdate {
  readonly handle: string;
  readonly displayName: string;
  readonly bio: string;
  readonly avatarPath?: string | null;
  readonly location?: string;
  readonly websiteUrl?: string;
}

export interface ProfileRepositoryActivity {
  readonly slug: string;
  readonly title: string;
  readonly version: string;
  readonly publishedAt: string;
}

export interface ProfileRepositorySummary {
  readonly publicPackageCount: number;
  readonly totalVersionCount: number;
  readonly totalStarsReceived: number;
  readonly recentActivity: readonly ProfileRepositoryActivity[];
}

export interface ProfileClient {
  getByHandle(handle: string): Promise<PublicProfile | null>;
  getOwn(): Promise<PublicProfile>;
  updateOwn(update: ProfileUpdate): Promise<PublicProfile>;
  getRepositorySummary(handle: string): Promise<ProfileRepositorySummary>;
}

export interface UserOwner {
  readonly type: "user";
  readonly userId: string;
}

export interface OrganizationOwner {
  readonly type: "organization";
  readonly organizationId: string;
}

export type PackageOwner = UserOwner | OrganizationOwner;
export type DraftOwner = UserOwner;

export interface OrganizationMembership {
  readonly organizationId: string;
  readonly userId: string;
  readonly role: "owner" | "admin" | "member";
}

export interface RepositoryQuery {
  readonly text?: string;
  readonly subject?: string;
  readonly level?: string;
  readonly language?: string;
  readonly kind?: PackageKind;
  readonly mcfVersion?: McfVersion;
  readonly sort?: RepositorySort;
  readonly page?: number;
  readonly pageSize?: number;
}

export type RepositorySort = "relevance" | "newest" | "updated" | "title";

export interface RepositoryResult {
  readonly packages: readonly PublishedPackage[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export interface RepositorySubject {
  readonly value: string;
  readonly packageCount: number;
}

export interface PublishedPackageVersion {
  readonly id: string;
  readonly packageId: string;
  readonly version: string;
  readonly mcfVersion: McfVersion;
  readonly packageKind: PackageKind;
  readonly sourceStoragePath: string;
  readonly sourceChecksum: string;
  readonly sourceSize: number;
  readonly manifestSummary: PackageManifest & Readonly<Record<string, unknown>>;
  readonly validationSummary: ValidationSummary;
  readonly releaseNotes: string;
  readonly publishedAt: string;
}

export interface PublishedPackage {
  readonly id: string;
  readonly ownerId: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly visibility: PackageVisibility;
  readonly latestVersionId?: string;
  readonly parentPackageId?: string;
  readonly parentVersionId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly creator: PublicProfile;
  readonly versions: readonly PublishedPackageVersion[];
}

export interface RepositoryFork {
  readonly slug: string;
  readonly title: string;
  readonly creatorHandle: string;
  readonly createdAt: string;
}

export interface RepositoryNetwork {
  readonly starCount: number;
  readonly forkCount: number;
  readonly viewerStarred: boolean;
  readonly parent?: {
    readonly slug: string;
    readonly title: string;
    readonly version: string;
    readonly creatorHandle: string;
  };
  readonly directForks: readonly RepositoryFork[];
}

export interface StarResult {
  readonly starred: boolean;
  readonly starCount: number;
}

export interface RepositoryClient {
  search(query: RepositoryQuery): Promise<RepositoryResult>;
  listRecent(limit?: number): Promise<readonly PublishedPackage[]>;
  listProfilePackages(
    handle: string,
    query?: Pick<RepositoryQuery, "page" | "pageSize" | "sort">,
  ): Promise<RepositoryResult>;
  listSubjects(limit?: number): Promise<readonly RepositorySubject[]>;
  get(id: PackageId): Promise<PublishedPackage | null>;
  getBySlug(slug: string): Promise<PublishedPackage | null>;
  getVersion(
    slug: string,
    version: string,
  ): Promise<{
    readonly package: PublishedPackage;
    readonly version: PublishedPackageVersion;
  } | null>;
  downloadSource(slug: string, version: string): Promise<Blob>;
  getNetwork(packageId: string): Promise<RepositoryNetwork>;
  setStar(packageId: string, starred: boolean): Promise<StarResult>;
  listStarred(page?: number, pageSize?: number): Promise<RepositoryResult>;
  listOwned(page?: number, pageSize?: number): Promise<RepositoryResult>;
}

export interface PublishingRequest {
  readonly packageId?: string;
  readonly repositoryId?: string;
  readonly parentPackageId?: string;
  readonly parentVersionId?: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly visibility: PackageVisibility;
  readonly version: string;
  readonly mcfVersion: McfVersion;
  readonly packageKind: PackageKind;
  readonly sourceChecksum: string;
  readonly manifestSummary: PackageManifest & Readonly<Record<string, unknown>>;
  readonly validationSummary: ValidationSummary;
  readonly releaseNotes: string;
  readonly archive: Blob;
}

export interface PublishingResult {
  readonly packageId: string;
  readonly versionId: string;
  readonly slug: string;
  readonly version: string;
  readonly publishedAt: string;
}

export type PublishingPhase =
  | "checking"
  | "uploading"
  | "finalizing"
  | "complete";

export interface PublishingOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (phase: PublishingPhase, percentage: number) => void;
}

export interface PublishingClient {
  slugAvailable(slug: string, packageId?: string): Promise<boolean>;
  publish(
    request: PublishingRequest,
    options?: PublishingOptions,
  ): Promise<PublishingResult>;
}

export type RemoteSyncCategory =
  | "draft"
  | "progress"
  | "library"
  | "local_package"
  | "compilation";

export type RemoteSyncArtifactStatus =
  | "available"
  | "metadata_only"
  | "unavailable";

export interface RemoteSyncRecord {
  readonly category: RemoteSyncCategory;
  readonly stableId: string;
  readonly schemaVersion: number;
  readonly revision: number;
  readonly resetGeneration: number;
  readonly sourceChecksum?: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly artifactStatus: RemoteSyncArtifactStatus;
  readonly deleted: boolean;
  readonly deviceId: string;
  readonly operationId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly cursor: number;
}

export interface RemoteSyncCounts {
  readonly drafts: number;
  readonly progress: number;
  readonly library: number;
  readonly localPackages: number;
  readonly compilations: number;
  readonly blobs: number;
  readonly storageBytes: number;
}

export interface RemoteSyncPage {
  readonly records: readonly RemoteSyncRecord[];
  readonly nextCursor: number;
  readonly hasMore: boolean;
}

export type SyncBlobKind =
  | "draft"
  | "local_package"
  | "source"
  | "compiled"
  | "record_binary";

export interface SyncBlobReference {
  readonly checksum: string;
  readonly kind: SyncBlobKind;
  readonly byteSize: number;
  readonly contentType: string;
  readonly available: boolean;
  readonly storagePath?: string;
}

export interface SyncClient {
  registerDevice(
    deviceId: string,
    deviceName: string,
    enabled: boolean,
  ): Promise<void>;
  counts(): Promise<RemoteSyncCounts>;
  list(cursor: number, limit?: number): Promise<RemoteSyncPage>;
  apply(
    record: Omit<
      RemoteSyncRecord,
      "revision" | "createdAt" | "updatedAt" | "cursor"
    >,
    expectedRevision: number,
  ): Promise<RemoteSyncRecord>;
  uploadBlob(
    reference: Omit<SyncBlobReference, "available">,
    blob: Blob,
    options?: {
      readonly signal?: AbortSignal;
      readonly onProgress?: (percentage: number) => void;
    },
  ): Promise<SyncBlobReference>;
  downloadBlob(reference: SyncBlobReference): Promise<Blob>;
}

export interface PlatformClient {
  readonly authentication: AuthenticationClient;
  readonly profiles: ProfileClient;
  readonly repository: RepositoryClient;
  readonly publishing: PublishingClient;
  readonly sync: SyncClient;
}

const unavailable = (): Error =>
  new Error(
    "Accounts are unavailable until the public Supabase environment variables are configured.",
  );

export function createUnavailablePlatformClient(): PlatformClient {
  const deferred = (): never => {
    throw unavailable();
  };
  return {
    authentication: {
      configured: false,
      async currentIdentity() {
        return null;
      },
      async signUp() {
        throw unavailable();
      },
      async signIn() {
        throw unavailable();
      },
      async signOut() {},
      async requestPasswordReset() {
        throw unavailable();
      },
      async updatePassword() {
        throw unavailable();
      },
      async exchangeCode() {
        throw unavailable();
      },
      async refreshSession() {
        return false;
      },
      subscribe() {
        return () => undefined;
      },
    },
    profiles: {
      async getByHandle() {
        return null;
      },
      async getOwn() {
        throw unavailable();
      },
      async updateOwn() {
        throw unavailable();
      },
      async getRepositorySummary() {
        return {
          publicPackageCount: 0,
          totalVersionCount: 0,
          totalStarsReceived: 0,
          recentActivity: [],
        };
      },
    },
    repository: {
      async search() {
        return {
          packages: [],
          total: 0,
          page: 1,
          pageSize: 12,
          totalPages: 0,
        };
      },
      async listRecent() {
        return [];
      },
      async listProfilePackages() {
        return {
          packages: [],
          total: 0,
          page: 1,
          pageSize: 12,
          totalPages: 0,
        };
      },
      async listSubjects() {
        return [];
      },
      async get() {
        return null;
      },
      async getBySlug() {
        return null;
      },
      async getVersion() {
        return null;
      },
      async downloadSource() {
        return deferred();
      },
      async getNetwork() {
        return {
          starCount: 0,
          forkCount: 0,
          viewerStarred: false,
          directForks: [],
        };
      },
      async setStar() {
        return deferred();
      },
      async listStarred() {
        return deferred();
      },
      async listOwned() {
        return deferred();
      },
    },
    publishing: {
      async slugAvailable() {
        return deferred();
      },
      async publish() {
        return deferred();
      },
    },
    sync: {
      async registerDevice() {
        return deferred();
      },
      async counts() {
        return deferred();
      },
      async list() {
        return deferred();
      },
      async apply() {
        return deferred();
      },
      async uploadBlob() {
        return deferred();
      },
      async downloadBlob() {
        return deferred();
      },
    },
  };
}

export {
  createSupabasePlatformClient,
  type SupabaseDatabase,
} from "./supabase-adapter";
export { PlatformOperationError } from "./errors";
export { createHttpPublishingClient } from "./http-publishing";
