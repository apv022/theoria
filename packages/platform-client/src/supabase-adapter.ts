import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
  User,
} from "@supabase/supabase-js";
import type {
  AccountIdentity,
  AuthenticationClient,
  AuthEvent,
  AuthResult,
  AuthStateChange,
  PlatformClient,
  ProfileRepositorySummary,
  PublishedPackage,
  PublishedPackageVersion,
  ProfileClient,
  ProfileUpdate,
  PublicProfile,
  PublishingClient,
  PublishingOptions,
  PublishingRequest,
  PublishingResult,
  RepositoryClient,
  RepositoryNetwork,
  RepositoryQuery,
  RepositoryResult,
  RepositorySubject,
  RemoteSyncCounts,
  RemoteSyncPage,
  RemoteSyncRecord,
  SignUpRequest,
  SyncBlobReference,
  SyncClient,
} from "./index";
import { PlatformOperationError } from "./errors";

type ProfileRow = {
  id: string;
  handle: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
  location: string;
  website_url: string;
  created_at: string;
  updated_at: string;
};

type PackageRow = {
  id: string;
  owner_id: string;
  slug: string;
  title: string;
  description: string;
  visibility: "public" | "unlisted" | "private";
  latest_version_id: string | null;
  parent_package_id: string | null;
  parent_version_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type PackageVersionRow = {
  id: string;
  package_id: string;
  version: string;
  mcf_version: "1.0" | "1.1";
  package_kind:
    | "course"
    | "module"
    | "lesson"
    | "question_bank"
    | "asset_collection";
  source_storage_path: string;
  source_checksum: string;
  source_size: number;
  manifest_summary: Record<string, unknown>;
  validation_summary: Record<string, unknown>;
  release_notes: string;
  published_at: string;
};

type RepositoryPackageRow = {
  package_id: string;
  owner_id: string;
  slug: string;
  title: string;
  description: string;
  visibility: "public";
  latest_version_id: string;
  package_created_at: string;
  package_updated_at: string;
  profile_id: string;
  creator_handle: string;
  creator_display_name: string;
  creator_bio: string;
  creator_avatar_path: string | null;
  creator_created_at: string;
  creator_updated_at: string;
  version_id: string;
  version: string;
  mcf_version: PackageVersionRow["mcf_version"];
  package_kind: PackageVersionRow["package_kind"];
  source_storage_path: string;
  source_checksum: string;
  manifest_summary: Record<string, unknown>;
  validation_summary: Record<string, unknown>;
  release_notes: string;
  published_at: string;
  total_count: number;
};

type SyncRecordRow = {
  owner_id: string;
  category: RemoteSyncRecord["category"];
  stable_id: string;
  schema_version: number;
  revision: number;
  reset_generation: number;
  source_checksum: string | null;
  payload: Record<string, unknown>;
  artifact_status: RemoteSyncRecord["artifactStatus"];
  deleted: boolean;
  updated_by_device_id: string;
  last_operation_id: string;
  created_at: string;
  updated_at: string;
  sync_cursor: number;
};

type SyncBlobRow = {
  owner_id: string;
  checksum: string;
  blob_kind: SyncBlobReference["kind"];
  storage_path: string;
  byte_size: number;
  content_type: string;
  created_at: string;
};

type SyncDeviceRow = {
  owner_id: string;
  device_id: string;
  device_name: string;
  enabled: boolean;
  created_at: string;
  last_seen_at: string;
};

export type SupabaseDatabase = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: {
          id: string;
          handle: string;
          display_name?: string;
          bio?: string;
          avatar_path?: string | null;
          location?: string;
          website_url?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          handle?: string;
          display_name?: string;
          bio?: string;
          avatar_path?: string | null;
          location?: string;
          website_url?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      packages: {
        Row: PackageRow;
        Insert: {
          id?: string;
          owner_id: string;
          slug: string;
          title: string;
          description?: string;
          visibility?: "public" | "unlisted" | "private";
          latest_version_id?: string | null;
          parent_package_id?: string | null;
          parent_version_id?: string | null;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          slug?: string;
          title?: string;
          description?: string;
          visibility?: "public" | "unlisted" | "private";
          latest_version_id?: string | null;
          deleted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      package_versions: {
        Row: PackageVersionRow;
        Insert: {
          id?: string;
          package_id: string;
          version: string;
          mcf_version: "1.0" | "1.1";
          package_kind: PackageVersionRow["package_kind"];
          source_storage_path: string;
          source_checksum: string;
          source_size?: number;
          manifest_summary: Record<string, unknown>;
          validation_summary: Record<string, unknown>;
          release_notes?: string;
          published_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      sync_devices: {
        Row: SyncDeviceRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sync_records: {
        Row: SyncRecordRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sync_blobs: {
        Row: SyncBlobRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      package_slug_available: {
        Args: {
          candidate: string;
          existing_package_id?: string | null;
        };
        Returns: boolean;
      };
      package_version_available: {
        Args: {
          candidate_package_id: string;
          candidate_version: string;
        };
        Returns: boolean;
      };
      repository_packages: {
        Args: {
          requested_query: string;
          requested_subject: string;
          requested_level: string;
          requested_language: string;
          requested_kind: string;
          requested_mcf_version: string;
          requested_sort: string;
          requested_profile_handle: string;
          requested_limit: number;
          requested_offset: number;
        };
        Returns: RepositoryPackageRow[];
      };
      repository_subjects: {
        Args: {
          requested_limit: number;
        };
        Returns: {
          subject: string;
          package_count: number;
        }[];
      };
      repository_package_network: {
        Args: { requested_package_id: string };
        Returns: {
          star_count: number;
          fork_count: number;
          viewer_starred: boolean;
          parent_slug: string | null;
          parent_title: string | null;
          parent_version: string | null;
          parent_creator_handle: string | null;
          direct_forks: unknown;
        }[];
      };
      repository_starred_package_ids: {
        Args: { requested_limit: number; requested_offset: number };
        Returns: {
          package_id: string;
          starred_at: string;
          total_count: number;
        }[];
      };
      set_package_star: {
        Args: { requested_package_id: string; requested_starred: boolean };
        Returns: { starred: boolean; star_count: number }[];
      };
      soft_delete_package: {
        Args: { requested_package_id: string };
        Returns: { package_id: string; deleted_at: string }[];
      };
      profile_repository_summary: {
        Args: { requested_handle: string };
        Returns: {
          public_package_count: number;
          total_version_count: number;
          total_stars_received: number;
          recent_activity: unknown;
        }[];
      };
      publish_package_version: {
        Args: {
          requested_package_id: string;
          requested_slug: string;
          requested_title: string;
          requested_description: string;
          requested_visibility: "public" | "unlisted" | "private";
          requested_version: string;
          requested_mcf_version: "1.0" | "1.1";
          requested_package_kind: PackageVersionRow["package_kind"];
          requested_source_storage_path: string;
          requested_source_checksum: string;
          requested_manifest_summary: Record<string, unknown>;
          requested_validation_summary: Record<string, unknown>;
          requested_release_notes: string;
          requested_source_size: number;
          requested_parent_package_id: string | null;
          requested_parent_version_id: string | null;
        };
        Returns: {
          package_id: string;
          version_id: string;
          slug: string;
          version: string;
          published_at: string;
        }[];
      };
      sync_register_device: {
        Args: {
          requested_device_id: string;
          requested_device_name: string;
          requested_enabled: boolean;
        };
        Returns: SyncDeviceRow;
      };
      sync_apply_record: {
        Args: {
          requested_category: RemoteSyncRecord["category"];
          requested_stable_id: string;
          requested_expected_revision: number;
          requested_schema_version: number;
          requested_reset_generation: number;
          requested_source_checksum: string | null;
          requested_payload: Record<string, unknown>;
          requested_artifact_status: RemoteSyncRecord["artifactStatus"];
          requested_deleted: boolean;
          requested_device_id: string;
          requested_operation_id: string;
        };
        Returns: SyncRecordRow;
      };
      sync_register_blob: {
        Args: {
          requested_checksum: string;
          requested_blob_kind: SyncBlobReference["kind"];
          requested_storage_path: string;
          requested_byte_size: number;
          requested_content_type: string;
        };
        Returns: SyncBlobRow;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const profileFields =
  "id, handle, display_name, bio, avatar_path, location, website_url, created_at, updated_at";

const profileFromRow = (row: ProfileRow): PublicProfile => ({
  id: row.id,
  handle: row.handle,
  displayName: row.display_name,
  bio: row.bio,
  ...(row.avatar_path ? { avatarPath: row.avatar_path } : {}),
  ...(row.location ? { location: row.location } : {}),
  ...(row.website_url ? { websiteUrl: row.website_url } : {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const eventName = (event: AuthChangeEvent): AuthEvent => {
  const names: Partial<Record<AuthChangeEvent, AuthEvent>> = {
    INITIAL_SESSION: "initial",
    SIGNED_IN: "signed-in",
    SIGNED_OUT: "signed-out",
    TOKEN_REFRESHED: "token-refreshed",
    PASSWORD_RECOVERY: "password-recovery",
    USER_UPDATED: "user-updated",
  };
  return names[event] ?? "initial";
};

class SupabaseProfiles implements ProfileClient {
  constructor(private readonly client: SupabaseClient<SupabaseDatabase>) {}

  async getByHandle(handle: string): Promise<PublicProfile | null> {
    const { data, error } = await this.client
      .from("profiles")
      .select(profileFields)
      .eq("handle", handle.trim().toLowerCase())
      .maybeSingle();
    if (error) throw error;
    return data ? profileFromRow(data) : null;
  }

  async getById(id: string): Promise<PublicProfile | null> {
    const { data, error } = await this.client
      .from("profiles")
      .select(profileFields)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? profileFromRow(data) : null;
  }

  async getOwn(): Promise<PublicProfile> {
    const { data: userData, error: userError } =
      await this.client.auth.getUser();
    if (userError || !userData.user)
      throw userError ?? new Error("Authentication is required.");
    const { data, error } = await this.client
      .from("profiles")
      .select(profileFields)
      .eq("id", userData.user.id)
      .single();
    if (error) throw error;
    return profileFromRow(data);
  }

  async updateOwn(update: ProfileUpdate): Promise<PublicProfile> {
    const { data: userData, error: userError } =
      await this.client.auth.getUser();
    if (userError || !userData.user)
      throw userError ?? new Error("Authentication is required.");
    const { data, error } = await this.client
      .from("profiles")
      .update({
        handle: update.handle.trim().toLowerCase(),
        display_name: update.displayName.trim(),
        bio: update.bio.trim(),
        avatar_path: update.avatarPath?.trim() || null,
        location: update.location?.trim() ?? "",
        website_url: update.websiteUrl?.trim() ?? "",
      })
      .eq("id", userData.user.id)
      .select(profileFields)
      .single();
    if (error) throw error;
    return profileFromRow(data);
  }

  async getRepositorySummary(
    handle: string,
  ): Promise<ProfileRepositorySummary> {
    const { data, error } = await this.client.rpc(
      "profile_repository_summary",
      { requested_handle: handle.trim().toLowerCase() },
    );
    if (error) throw error;
    const row = data[0];
    if (!row)
      return {
        publicPackageCount: 0,
        totalVersionCount: 0,
        totalStarsReceived: 0,
        recentActivity: [],
      };
    const recentActivity = Array.isArray(row.recent_activity)
      ? row.recent_activity.filter(
          (item): item is ProfileRepositorySummary["recentActivity"][number] =>
            Boolean(
              item &&
                typeof item === "object" &&
                typeof (item as { slug?: unknown }).slug === "string" &&
                typeof (item as { title?: unknown }).title === "string" &&
                typeof (item as { version?: unknown }).version === "string" &&
                typeof (item as { publishedAt?: unknown }).publishedAt ===
                  "string",
            ),
        )
      : [];
    return {
      publicPackageCount: Number(row.public_package_count),
      totalVersionCount: Number(row.total_version_count),
      totalStarsReceived: Number(row.total_stars_received),
      recentActivity,
    };
  }
}

class SupabaseAuthentication implements AuthenticationClient {
  readonly configured = true;

  constructor(
    private readonly client: SupabaseClient<SupabaseDatabase>,
    private readonly profiles: SupabaseProfiles,
  ) {}

  private async identity(user: User | null): Promise<AccountIdentity | null> {
    if (!user?.email) return null;
    const profile = await this.profiles.getOwn();
    return {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.email_confirmed_at),
      profile,
    };
  }

  async currentIdentity(): Promise<AccountIdentity | null> {
    const { data, error } = await this.client.auth.getUser();
    if (error) {
      if (
        /session|refresh token|jwt/i.test(error.message) ||
        error.status === 401
      ) {
        await this.client.auth.signOut({ scope: "local" });
        return null;
      }
      throw error;
    }
    return this.identity(data.user);
  }

  async signUp(request: SignUpRequest): Promise<AuthResult> {
    const { data, error } = await this.client.auth.signUp({
      email: request.email.trim(),
      password: request.password,
      options: {
        emailRedirectTo: request.emailRedirectTo,
        data: {
          handle: request.handle.trim().toLowerCase(),
          display_name: request.displayName.trim(),
        },
      },
    });
    if (error) throw error;
    return {
      identity: data.session ? await this.identity(data.user) : null,
      verificationRequired: !data.session,
    };
  }

  async signIn(email: string, password: string): Promise<AccountIdentity> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    const identity = await this.identity(data.user);
    if (!identity) throw new Error("The authenticated account is unavailable.");
    return identity;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  async verifySignup(tokenHash: string): Promise<void> {
    const { error } = await this.client.auth.verifyOtp({
      token_hash: tokenHash,
      type: "email",
    });
    if (error) throw error;
  }

  async resendSignupConfirmation(
    email: string,
    redirectTo: string,
  ): Promise<void> {
    const { error } = await this.client.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo },
    );
    if (error) throw error;
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw error;
  }

  async exchangeCode(code: string): Promise<void> {
    const { error } = await this.client.auth.exchangeCodeForSession(code);
    if (error) throw error;
  }

  async refreshSession(): Promise<boolean> {
    const { data, error } = await this.client.auth.getClaims();
    if (error) return false;
    return Boolean(data?.claims.sub);
  }

  subscribe(listener: (change: AuthStateChange) => void): () => void {
    const {
      data: { subscription },
    } = this.client.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        void this.identity(session?.user ?? null)
          .then((identity) => listener({ event: eventName(event), identity }))
          .catch(() => {
            // Profile hydration is a network read. A transient offline failure
            // must not turn a still-present local Auth session into a logout.
            if (!session)
              listener({
                event:
                  event === "SIGNED_OUT" ? "signed-out" : ("expired" as const),
                identity: null,
              });
          });
      },
    );
    return () => subscription.unsubscribe();
  }
}

const packageFields =
  "id, owner_id, slug, title, description, visibility, latest_version_id, parent_package_id, parent_version_id, deleted_at, created_at, updated_at";
const versionFields =
  "id, package_id, version, mcf_version, package_kind, source_storage_path, source_checksum, source_size, manifest_summary, validation_summary, release_notes, published_at";

const versionFromRow = (row: PackageVersionRow): PublishedPackageVersion =>
  ({
    id: row.id,
    packageId: row.package_id,
    version: row.version,
    mcfVersion: row.mcf_version,
    packageKind: row.package_kind,
    sourceStoragePath: row.source_storage_path,
    sourceChecksum: row.source_checksum,
    sourceSize: Number(row.source_size),
    manifestSummary: row.manifest_summary,
    validationSummary: row.validation_summary,
    releaseNotes: row.release_notes,
    publishedAt: row.published_at,
  }) as unknown as PublishedPackageVersion;

class SupabaseRepository implements RepositoryClient {
  constructor(
    private readonly client: SupabaseClient<SupabaseDatabase>,
    private readonly profiles: SupabaseProfiles,
  ) {}

  async search(query: RepositoryQuery): Promise<RepositoryResult> {
    return this.list(query);
  }

  async listRecent(limit = 6): Promise<readonly PublishedPackage[]> {
    return (
      await this.list({
        sort: "newest",
        page: 1,
        pageSize: Math.min(12, Math.max(1, Math.trunc(limit))),
      })
    ).packages;
  }

  async listProfilePackages(
    handle: string,
    query: Pick<RepositoryQuery, "page" | "pageSize" | "sort"> = {},
  ): Promise<RepositoryResult> {
    return this.list(query, handle.trim().toLowerCase());
  }

  async listSubjects(limit = 8): Promise<readonly RepositorySubject[]> {
    const { data, error } = await this.client.rpc("repository_subjects", {
      requested_limit: Math.min(24, Math.max(1, Math.trunc(limit))),
    });
    if (error)
      throw new PlatformOperationError(
        "REPOSITORY_UNAVAILABLE",
        error.message,
        true,
      );
    return data.map((item) => ({
      value: item.subject,
      packageCount: Number(item.package_count),
    }));
  }

  private async list(
    query: RepositoryQuery,
    profileHandle = "",
  ): Promise<RepositoryResult> {
    const page = Math.max(1, Math.trunc(query.page ?? 1));
    const pageSize = Math.min(
      24,
      Math.max(1, Math.trunc(query.pageSize ?? 12)),
    );
    const sort = query.sort ?? (query.text ? "relevance" : "newest");
    const { data, error } = await this.client.rpc("repository_packages", {
      requested_query: query.text?.trim() ?? "",
      requested_subject: query.subject?.trim().toLowerCase() ?? "",
      requested_level: query.level?.trim().toLowerCase() ?? "",
      requested_language: query.language?.trim().toLowerCase() ?? "",
      requested_kind: query.kind ?? "",
      requested_mcf_version: query.mcfVersion ?? "",
      requested_sort: sort,
      requested_profile_handle: profileHandle,
      requested_limit: pageSize,
      requested_offset: (page - 1) * pageSize,
    });
    if (error)
      throw new PlatformOperationError(
        "REPOSITORY_UNAVAILABLE",
        error.message,
        true,
      );
    const total = Number(data[0]?.total_count ?? 0);
    return {
      packages: data.map((row) => this.packageFromRepositoryRow(row)),
      total,
      page,
      pageSize,
      totalPages: total ? Math.ceil(total / pageSize) : 0,
    };
  }

  private packageFromRepositoryRow(
    row: RepositoryPackageRow,
  ): PublishedPackage {
    const creator = profileFromRow({
      id: row.profile_id,
      handle: row.creator_handle,
      display_name: row.creator_display_name,
      bio: row.creator_bio,
      avatar_path: row.creator_avatar_path,
      location: "",
      website_url: "",
      created_at: row.creator_created_at,
      updated_at: row.creator_updated_at,
    });
    const version = versionFromRow({
      id: row.version_id,
      package_id: row.package_id,
      version: row.version,
      mcf_version: row.mcf_version,
      package_kind: row.package_kind,
      source_storage_path: row.source_storage_path,
      source_checksum: row.source_checksum,
      source_size: 0,
      manifest_summary: row.manifest_summary,
      validation_summary: row.validation_summary,
      release_notes: row.release_notes,
      published_at: row.published_at,
    });
    return {
      id: row.package_id,
      ownerId: row.owner_id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      visibility: row.visibility,
      latestVersionId: row.latest_version_id,
      createdAt: row.package_created_at,
      updatedAt: row.package_updated_at,
      creator,
      versions: [version],
    };
  }

  async get(id: Parameters<RepositoryClient["get"]>[0]) {
    try {
      return await this.getPackage("id", id);
    } catch (reason) {
      throw this.operationError(reason);
    }
  }

  async getBySlug(slug: string) {
    try {
      return await this.getPackage("slug", slug.trim().toLowerCase());
    } catch (reason) {
      throw this.operationError(reason);
    }
  }

  private operationError(reason: unknown): PlatformOperationError {
    if (reason instanceof PlatformOperationError) return reason;
    return new PlatformOperationError(
      "REPOSITORY_UNAVAILABLE",
      reason instanceof Error
        ? reason.message
        : "The repository operation failed.",
      true,
    );
  }

  private async getPackage(field: "id" | "slug", value: string) {
    const { data, error } = await this.client
      .from("packages")
      .select(packageFields)
      .eq(field, value)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const [creator, versionsResult] = await Promise.all([
      this.profiles.getById(data.owner_id),
      this.client
        .from("package_versions")
        .select(versionFields)
        .eq("package_id", data.id)
        .order("published_at", { ascending: false }),
    ]);
    if (versionsResult.error) throw versionsResult.error;
    if (!creator) throw new Error("Package creator profile is unavailable.");
    return {
      id: data.id,
      ownerId: data.owner_id,
      slug: data.slug,
      title: data.title,
      description: data.description,
      visibility: data.visibility,
      ...(data.latest_version_id
        ? { latestVersionId: data.latest_version_id }
        : {}),
      ...(data.parent_package_id
        ? { parentPackageId: data.parent_package_id }
        : {}),
      ...(data.parent_version_id
        ? { parentVersionId: data.parent_version_id }
        : {}),
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      creator,
      versions: versionsResult.data.map(versionFromRow),
    } satisfies PublishedPackage;
  }

  async getVersion(slug: string, version: string) {
    const packageValue = await this.getBySlug(slug);
    if (!packageValue) return null;
    const release = packageValue.versions.find(
      (candidate) => candidate.version === version,
    );
    return release ? { package: packageValue, version: release } : null;
  }

  async downloadSource(slug: string, version: string): Promise<Blob> {
    const release = await this.getVersion(slug, version);
    if (!release)
      throw new PlatformOperationError(
        "NOT_FOUND",
        "The package version is unavailable.",
      );
    const { data, error } = await this.client.storage
      .from("package-sources")
      .download(release.version.sourceStoragePath);
    if (error)
      throw new PlatformOperationError(
        "SOURCE_UNAVAILABLE",
        error.message,
        true,
      );
    return data;
  }

  async getNetwork(packageId: string): Promise<RepositoryNetwork> {
    const { data, error } = await this.client.rpc(
      "repository_package_network",
      { requested_package_id: packageId },
    );
    if (error) throw this.operationError(error);
    const row = data[0];
    if (!row)
      return {
        starCount: 0,
        forkCount: 0,
        viewerStarred: false,
        directForks: [],
      };
    const directForks = Array.isArray(row.direct_forks)
      ? row.direct_forks.filter(
          (item): item is RepositoryNetwork["directForks"][number] =>
            Boolean(
              item &&
                typeof item === "object" &&
                typeof (item as { slug?: unknown }).slug === "string" &&
                typeof (item as { title?: unknown }).title === "string" &&
                typeof (item as { creatorHandle?: unknown }).creatorHandle ===
                  "string" &&
                typeof (item as { createdAt?: unknown }).createdAt === "string",
            ),
        )
      : [];
    return {
      starCount: Number(row.star_count),
      forkCount: Number(row.fork_count),
      viewerStarred: row.viewer_starred,
      ...(row.parent_slug &&
      row.parent_title &&
      row.parent_version &&
      row.parent_creator_handle
        ? {
            parent: {
              slug: row.parent_slug,
              title: row.parent_title,
              version: row.parent_version,
              creatorHandle: row.parent_creator_handle,
            },
          }
        : {}),
      directForks,
    };
  }

  async setStar(packageId: string, starred: boolean) {
    const { data, error } = await this.client.rpc("set_package_star", {
      requested_package_id: packageId,
      requested_starred: starred,
    });
    if (error || !data[0])
      throw new PlatformOperationError(
        "STAR_FAILED",
        error?.message ?? "The star could not be updated.",
        true,
      );
    return {
      starred: data[0].starred,
      starCount: Number(data[0].star_count),
    };
  }

  async softDeleteRepository(packageId: string): Promise<void> {
    const { error } = await this.client.rpc("soft_delete_package", {
      requested_package_id: packageId,
    });
    if (error)
      throw new PlatformOperationError(
        "REPOSITORY_DELETE_FAILED",
        error.message,
        true,
      );
  }

  async listStarred(page = 1, pageSize = 12): Promise<RepositoryResult> {
    const normalizedPage = Math.max(1, Math.trunc(page));
    const normalizedPageSize = Math.min(24, Math.max(1, Math.trunc(pageSize)));
    const { data, error } = await this.client.rpc(
      "repository_starred_package_ids",
      {
        requested_limit: normalizedPageSize,
        requested_offset: (normalizedPage - 1) * normalizedPageSize,
      },
    );
    if (error)
      throw new PlatformOperationError(
        "STARRED_UNAVAILABLE",
        error.message,
        true,
      );
    const values = await Promise.all(
      data.map((row) => this.getPackage("id", row.package_id)),
    );
    const packages: PublishedPackage[] = [];
    for (const value of values) if (value) packages.push(value);
    const total = Number(data[0]?.total_count ?? 0);
    return {
      packages,
      total,
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalPages: total ? Math.ceil(total / normalizedPageSize) : 0,
    };
  }

  async listOwned(page = 1, pageSize = 12): Promise<RepositoryResult> {
    const { data: authData, error: authError } =
      await this.client.auth.getUser();
    if (authError || !authData.user)
      throw new PlatformOperationError(
        "AUTH_REQUIRED",
        "Sign in to list owned repositories.",
      );
    const normalizedPage = Math.max(1, Math.floor(page));
    const normalizedPageSize = Math.min(24, Math.max(1, Math.floor(pageSize)));
    const start = (normalizedPage - 1) * normalizedPageSize;
    const { data, error, count } = await this.client
      .from("packages")
      .select("id", { count: "exact" })
      .eq("owner_id", authData.user.id)
      .order("updated_at", { ascending: false })
      .range(start, start + normalizedPageSize - 1);
    if (error) throw this.operationError(error);
    const values = await Promise.all(
      data.map((row) => this.getPackage("id", row.id)),
    );
    const packages: PublishedPackage[] = [];
    for (const value of values) if (value) packages.push(value);
    const total = count ?? packages.length;
    return {
      packages,
      total,
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalPages: total ? Math.ceil(total / normalizedPageSize) : 0,
    };
  }
}

const sha256 = async (archive: Blob): Promise<string> => {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", await archive.arrayBuffer()),
  );
  return [...digest]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

class SupabasePublishing implements PublishingClient {
  constructor(private readonly client: SupabaseClient<SupabaseDatabase>) {}

  async slugAvailable(slug: string, packageId?: string): Promise<boolean> {
    const { data, error } = await this.client.rpc("package_slug_available", {
      candidate: slug,
      existing_package_id: packageId ?? null,
    });
    if (error) throw error;
    return data;
  }

  async publish(
    request: PublishingRequest,
    options: PublishingOptions = {},
  ): Promise<PublishingResult> {
    options.onProgress?.("checking", 10);
    if (options.signal?.aborted)
      throw new DOMException("Publishing was cancelled.", "AbortError");
    if (
      request.validationSummary.state !== "valid" ||
      request.validationSummary.diagnostics.some(
        (diagnostic) => diagnostic.severity === "error",
      )
    )
      throw new PlatformOperationError(
        "VALIDATION_REQUIRED",
        "A successful real browser validation is required before publishing.",
      );
    if (request.archive.size > 52_428_800)
      throw new PlatformOperationError(
        "ARCHIVE_TOO_LARGE",
        "Source archives may not exceed 50 MiB.",
      );
    const actualChecksum = await sha256(request.archive);
    if (actualChecksum !== request.sourceChecksum)
      throw new PlatformOperationError(
        "CHECKSUM_MISMATCH",
        "The uploaded source does not match the validated archive checksum.",
      );

    const { data: authData, error: authError } =
      await this.client.auth.getUser();
    if (authError || !authData.user)
      throw new PlatformOperationError(
        "AUTH_REQUIRED",
        "Sign in before publishing.",
      );
    const packageId =
      request.packageId ?? request.repositoryId ?? crypto.randomUUID();
    const storagePath = `packages/${authData.user.id}/${packageId}/${request.version}/${request.sourceChecksum}.mcf.zip`;
    options.onProgress?.("uploading", 35);
    const { error: uploadError } = await this.client.storage
      .from("package-sources")
      .upload(storagePath, request.archive, {
        cacheControl: "31536000",
        contentType: "application/zip",
        upsert: false,
      });
    const alreadyUploaded =
      uploadError && /already exists|duplicate|409/i.test(uploadError.message);
    if (uploadError && !alreadyUploaded)
      throw new PlatformOperationError(
        "UPLOAD_FAILED",
        uploadError.message,
        true,
      );

    if (options.signal?.aborted) {
      if (!alreadyUploaded)
        await this.client.storage.from("package-sources").remove([storagePath]);
      throw new DOMException("Publishing was cancelled.", "AbortError");
    }
    options.onProgress?.("finalizing", 80);
    const { data, error } = await this.client.rpc("publish_package_version", {
      requested_package_id: packageId,
      requested_slug: request.slug,
      requested_title: request.title,
      requested_description: request.description,
      requested_visibility: request.visibility,
      requested_version: request.version,
      requested_mcf_version: request.mcfVersion,
      requested_package_kind: request.packageKind,
      requested_source_storage_path: storagePath,
      requested_source_checksum: request.sourceChecksum,
      requested_manifest_summary: request.manifestSummary,
      requested_validation_summary:
        request.validationSummary as unknown as Record<string, unknown>,
      requested_release_notes: request.releaseNotes,
      requested_source_size: request.archive.size,
      requested_parent_package_id: request.parentPackageId ?? null,
      requested_parent_version_id: request.parentVersionId ?? null,
    });
    if (error || !data[0]) {
      if (!alreadyUploaded)
        await this.client.storage.from("package-sources").remove([storagePath]);
      const duplicate = /duplicate|already exists|23505/i.test(
        error?.message ?? "",
      );
      throw new PlatformOperationError(
        duplicate ? "VERSION_CONFLICT" : "FINALIZATION_FAILED",
        error?.message ?? "Package publication could not be finalized.",
        !duplicate,
      );
    }
    const result = data[0];
    options.onProgress?.("complete", 100);
    return {
      packageId: result.package_id,
      versionId: result.version_id,
      slug: result.slug,
      version: result.version,
      publishedAt: result.published_at,
    };
  }
}

const syncRecordFromRow = (row: SyncRecordRow): RemoteSyncRecord => ({
  category: row.category,
  stableId: row.stable_id,
  schemaVersion: row.schema_version,
  revision: row.revision,
  resetGeneration: row.reset_generation,
  ...(row.source_checksum ? { sourceChecksum: row.source_checksum } : {}),
  payload: row.payload,
  artifactStatus: row.artifact_status,
  deleted: row.deleted,
  deviceId: row.updated_by_device_id,
  operationId: row.last_operation_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  cursor: Number(row.sync_cursor),
});

class SupabaseSync implements SyncClient {
  constructor(private readonly client: SupabaseClient<SupabaseDatabase>) {}

  async registerDevice(
    deviceId: string,
    deviceName: string,
    enabled: boolean,
  ): Promise<void> {
    const { error } = await this.client.rpc("sync_register_device", {
      requested_device_id: deviceId,
      requested_device_name: deviceName,
      requested_enabled: enabled,
    });
    if (error) throw error;
  }

  async counts(): Promise<RemoteSyncCounts> {
    const categories = [
      ["draft", "drafts"],
      ["progress", "progress"],
      ["library", "library"],
      ["local_package", "localPackages"],
      ["compilation", "compilations"],
    ] as const;
    const results = await Promise.all(
      categories.map(async ([category]) => {
        const { count, error } = await this.client
          .from("sync_records")
          .select("stable_id", { count: "exact", head: true })
          .eq("category", category)
          .eq("deleted", false);
        if (error) throw error;
        return count ?? 0;
      }),
    );
    const { data: blobs, error: blobError } = await this.client
      .from("sync_blobs")
      .select("byte_size");
    if (blobError) throw blobError;
    return {
      drafts: results[0] ?? 0,
      progress: results[1] ?? 0,
      library: results[2] ?? 0,
      localPackages: results[3] ?? 0,
      compilations: results[4] ?? 0,
      blobs: blobs.length,
      storageBytes: blobs.reduce(
        (total, blob) => total + Number(blob.byte_size),
        0,
      ),
    };
  }

  async list(cursor: number, limit = 100): Promise<RemoteSyncPage> {
    const bounded = Math.min(200, Math.max(1, Math.trunc(limit)));
    const { data, error } = await this.client
      .from("sync_records")
      .select(
        "owner_id, category, stable_id, schema_version, revision, reset_generation, source_checksum, payload, artifact_status, deleted, updated_by_device_id, last_operation_id, created_at, updated_at, sync_cursor",
      )
      .gt("sync_cursor", Math.max(0, Math.trunc(cursor)))
      .order("sync_cursor", { ascending: true })
      .limit(bounded + 1);
    if (error) throw error;
    const hasMore = data.length > bounded;
    const rows = hasMore ? data.slice(0, bounded) : data;
    return {
      records: rows.map(syncRecordFromRow),
      nextCursor: Number(rows.at(-1)?.sync_cursor ?? cursor),
      hasMore,
    };
  }

  async apply(
    record: Omit<
      RemoteSyncRecord,
      "revision" | "createdAt" | "updatedAt" | "cursor"
    >,
    expectedRevision: number,
  ): Promise<RemoteSyncRecord> {
    const { data, error } = await this.client.rpc("sync_apply_record", {
      requested_category: record.category,
      requested_stable_id: record.stableId,
      requested_expected_revision: expectedRevision,
      requested_schema_version: record.schemaVersion,
      requested_reset_generation: record.resetGeneration,
      requested_source_checksum: record.sourceChecksum ?? null,
      requested_payload: record.payload as Record<string, unknown>,
      requested_artifact_status: record.artifactStatus,
      requested_deleted: record.deleted,
      requested_device_id: record.deviceId,
      requested_operation_id: record.operationId,
    });
    if (error) {
      if (/revision conflict|40001/i.test(error.message))
        throw new PlatformOperationError(
          "SYNC_CONFLICT",
          "The cloud record changed on another device.",
          true,
        );
      throw error;
    }
    return syncRecordFromRow(data);
  }

  async uploadBlob(
    reference: Omit<SyncBlobReference, "available">,
    blob: Blob,
    options: {
      readonly signal?: AbortSignal;
      readonly onProgress?: (percentage: number) => void;
    } = {},
  ): Promise<SyncBlobReference> {
    if (options.signal?.aborted)
      throw new DOMException("Synchronization cancelled.", "AbortError");
    const { data: authData, error: authError } =
      await this.client.auth.getUser();
    if (authError || !authData.user)
      throw new PlatformOperationError(
        "AUTH_REQUIRED",
        "Sign in to synchronize private data.",
      );
    const path = `users/${authData.user.id}/${reference.kind}/${reference.checksum}`;
    const { data: existing, error: existingError } = await this.client
      .from("sync_blobs")
      .select("storage_path")
      .eq("checksum", reference.checksum)
      .maybeSingle();
    if (existingError) throw existingError;
    let storagePath = existing?.storage_path ?? path;
    if (!existing) {
      options.onProgress?.(10);
      const { error: uploadError } = await this.client.storage
        .from("account-sync")
        .upload(path, blob, {
          contentType: reference.contentType,
          cacheControl: "31536000",
          upsert: false,
        });
      if (uploadError && !/already exists|duplicate/i.test(uploadError.message))
        throw uploadError;
      if (options.signal?.aborted)
        throw new DOMException("Synchronization cancelled.", "AbortError");
      const { data: registered, error: registerError } = await this.client.rpc(
        "sync_register_blob",
        {
          requested_checksum: reference.checksum,
          requested_blob_kind: reference.kind,
          requested_storage_path: path,
          requested_byte_size: reference.byteSize,
          requested_content_type: reference.contentType,
        },
      );
      if (registerError) throw registerError;
      storagePath = registered.storage_path;
    }
    options.onProgress?.(100);
    return {
      ...reference,
      available: true,
      storagePath,
    };
  }

  async downloadBlob(reference: SyncBlobReference): Promise<Blob> {
    if (!reference.available)
      throw new PlatformOperationError(
        "SYNC_ARTIFACT_UNAVAILABLE",
        "This synchronized record has metadata only.",
      );
    const { data: authData, error: authError } =
      await this.client.auth.getUser();
    if (authError || !authData.user)
      throw new PlatformOperationError(
        "AUTH_REQUIRED",
        "Sign in to restore private data.",
      );
    const path =
      reference.storagePath ??
      `users/${authData.user.id}/${reference.kind}/${reference.checksum}`;
    const { data, error } = await this.client.storage
      .from("account-sync")
      .download(path);
    if (error) throw error;
    return data;
  }
}

export function createSupabasePlatformClient(
  client: SupabaseClient<SupabaseDatabase>,
): PlatformClient {
  const profiles = new SupabaseProfiles(client);
  return {
    profiles,
    authentication: new SupabaseAuthentication(client, profiles),
    repository: new SupabaseRepository(client, profiles),
    publishing: new SupabasePublishing(client),
    sync: new SupabaseSync(client),
  };
}
