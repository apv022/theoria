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
  | "expired";

export interface PublicProfile {
  readonly id: string;
  readonly handle: string;
  readonly displayName: string;
  readonly bio: string;
  readonly avatarPath?: string;
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
}

export interface ProfileClient {
  getByHandle(handle: string): Promise<PublicProfile | null>;
  getOwn(): Promise<PublicProfile>;
  updateOwn(update: ProfileUpdate): Promise<PublicProfile>;
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
  readonly kind?: PackageManifest["kind"];
  readonly cursor?: string;
}

export interface RepositoryResult {
  readonly packages: readonly PublishedPackage[];
  readonly nextCursor?: string;
}

export interface PublishedPackageVersion {
  readonly id: string;
  readonly packageId: string;
  readonly version: string;
  readonly mcfVersion: McfVersion;
  readonly packageKind: PackageKind;
  readonly sourceStoragePath: string;
  readonly sourceChecksum: string;
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
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly creator: PublicProfile;
  readonly versions: readonly PublishedPackageVersion[];
}

export interface RepositoryClient {
  search(query: RepositoryQuery): Promise<RepositoryResult>;
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
}

export interface PublishingRequest {
  readonly packageId?: string;
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

export interface SyncClient {
  push(): Promise<void>;
  pull(): Promise<void>;
}

export interface PlatformClient {
  readonly authentication: AuthenticationClient;
  readonly profiles: ProfileClient;
  readonly repository: RepositoryClient;
  readonly publishing: PublishingClient;
  readonly sync?: SyncClient;
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
    },
    repository: {
      async search() {
        return { packages: [] };
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
    },
    publishing: {
      async slugAvailable() {
        return deferred();
      },
      async publish() {
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
