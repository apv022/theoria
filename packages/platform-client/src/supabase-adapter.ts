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
  ProfileClient,
  ProfileUpdate,
  PublicProfile,
  SignUpRequest,
} from "./index";

type ProfileRow = {
  id: string;
  handle: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
  created_at: string;
  updated_at: string;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
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

export function createSupabasePlatformClient(
  client: SupabaseClient<SupabaseDatabase>,
): PlatformClient {
  const profiles = new SupabaseProfiles(client);
  return {
    profiles,
    authentication: new SupabaseAuthentication(client, profiles),
  };
}
