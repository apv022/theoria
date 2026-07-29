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
  RepositoryResult,
  SignUpRequest,
} from "./index";
import { PlatformOperationError } from "./errors";

type ProfileRow = {
  id: string;
  handle: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
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
  manifest_summary: Record<string, unknown>;
  validation_summary: Record<string, unknown>;
  release_notes: string;
  published_at: string;
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
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          handle?: string;
          display_name?: string;
          bio?: string;
          avatar_path?: string | null;
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
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          slug?: string;
          title?: string;
          description?: string;
          visibility?: "public" | "unlisted" | "private";
          latest_version_id?: string | null;
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
          manifest_summary: Record<string, unknown>;
          validation_summary: Record<string, unknown>;
          release_notes?: string;
          published_at?: string;
        };
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
        };
        Returns: {
          package_id: string;
          version_id: string;
          slug: string;
          version: string;
          published_at: string;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const profileFields =
  "id, handle, display_name, bio, avatar_path, created_at, updated_at";

const profileFromRow = (row: ProfileRow): PublicProfile => ({
  id: row.id,
  handle: row.handle,
  displayName: row.display_name,
  bio: row.bio,
  ...(row.avatar_path ? { avatarPath: row.avatar_path } : {}),
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
      })
      .eq("id", userData.user.id)
      .select(profileFields)
      .single();
    if (error) throw error;
    return profileFromRow(data);
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
          .catch(() =>
            listener({
              event:
                event === "SIGNED_OUT" ? "signed-out" : ("expired" as const),
              identity: null,
            }),
          );
      },
    );
    return () => subscription.unsubscribe();
  }
}

const packageFields =
  "id, owner_id, slug, title, description, visibility, latest_version_id, created_at, updated_at";
const versionFields =
  "id, package_id, version, mcf_version, package_kind, source_storage_path, source_checksum, manifest_summary, validation_summary, release_notes, published_at";

const versionFromRow = (row: PackageVersionRow): PublishedPackageVersion =>
  ({
    id: row.id,
    packageId: row.package_id,
    version: row.version,
    mcfVersion: row.mcf_version,
    packageKind: row.package_kind,
    sourceStoragePath: row.source_storage_path,
    sourceChecksum: row.source_checksum,
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

  async search(): Promise<RepositoryResult> {
    return { packages: [] };
  }

  async get(id: Parameters<RepositoryClient["get"]>[0]) {
    return this.getPackage("id", id);
  }

  async getBySlug(slug: string) {
    return this.getPackage("slug", slug.trim().toLowerCase());
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
    if (error) throw error;
    return data;
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
    if (request.packageId) {
      const { data: available, error: availabilityError } =
        await this.client.rpc("package_version_available", {
          candidate_package_id: request.packageId,
          candidate_version: request.version,
        });
      if (availabilityError) throw availabilityError;
      if (!available)
        throw new PlatformOperationError(
          "VERSION_CONFLICT",
          "That package version already exists or is not owned by this account.",
        );
    }
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
    const packageId = request.packageId ?? crypto.randomUUID();
    const storagePath = `packages/${authData.user.id}/${packageId}/${request.version}/${request.sourceChecksum}.mcf.zip`;
    options.onProgress?.("uploading", 35);
    const { error: uploadError } = await this.client.storage
      .from("package-sources")
      .upload(storagePath, request.archive, {
        cacheControl: "31536000",
        contentType: "application/zip",
        upsert: false,
      });
    if (uploadError)
      throw new PlatformOperationError(
        "UPLOAD_FAILED",
        uploadError.message,
        true,
      );

    if (options.signal?.aborted) {
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
    });
    if (error || !data[0]) {
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

export function createSupabasePlatformClient(
  client: SupabaseClient<SupabaseDatabase>,
): PlatformClient {
  const profiles = new SupabaseProfiles(client);
  return {
    profiles,
    authentication: new SupabaseAuthentication(client, profiles),
    repository: new SupabaseRepository(client, profiles),
    publishing: new SupabasePublishing(client),
  };
}
