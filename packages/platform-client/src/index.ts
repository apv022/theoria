import type {
  PackageId,
  PackageManifest,
  PackageVisibility,
} from "@theoria/package-model";

export interface AccountIdentity {
  readonly id: string;
  readonly handle: string;
  readonly displayName: string;
}

export interface AuthenticationClient {
  currentIdentity(): Promise<AccountIdentity | null>;
  signOut(): Promise<void>;
}

export interface RepositoryQuery {
  readonly text?: string;
  readonly kind?: PackageManifest["kind"];
  readonly cursor?: string;
}

export interface RepositoryResult {
  readonly packages: readonly PackageManifest[];
  readonly nextCursor?: string;
}

export interface RepositoryClient {
  search(query: RepositoryQuery): Promise<RepositoryResult>;
  get(id: PackageId): Promise<PackageManifest | null>;
}

export interface PublishingRequest {
  readonly packageId: PackageId;
  readonly visibility: PackageVisibility;
  readonly archive: Blob;
}

export interface PublishingClient {
  publish(request: PublishingRequest): Promise<{ readonly releaseId: string }>;
}

export interface SyncClient {
  push(): Promise<void>;
  pull(): Promise<void>;
}

export interface PlatformClient {
  readonly authentication: AuthenticationClient;
  readonly repository: RepositoryClient;
  readonly publishing: PublishingClient;
  readonly sync: SyncClient;
}
