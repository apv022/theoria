import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
  User,
} from "@supabase/supabase-js";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createSupabasePlatformClient,
  type SupabaseDatabase,
} from "../src/index.js";

type Row = SupabaseDatabase["public"]["Tables"]["profiles"]["Row"];
type AuthListener = (event: AuthChangeEvent, session: Session | null) => void;

const firstUser = {
  id: "10000000-0000-0000-0000-000000000001",
  email: "creator@example.test",
  email_confirmed_at: "2026-07-29T00:00:00.000Z",
} as User;

class FakeQuery {
  private id?: string;
  private handle?: string;
  private updateValue?: Partial<Row>;

  constructor(private readonly profiles: Map<string, Row>) {}

  select() {
    return this;
  }

  eq(field: string, value: string) {
    if (field === "id") this.id = value;
    if (field === "handle") this.handle = value;
    return this;
  }

  update(value: Partial<Row>) {
    this.updateValue = value;
    return this;
  }

  private row(): Row | undefined {
    if (this.id) return this.profiles.get(this.id);
    return [...this.profiles.values()].find(
      (profile) => profile.handle === this.handle,
    );
  }

  async maybeSingle() {
    return { data: this.row() ?? null, error: null };
  }

  async single() {
    const current = this.row();
    if (!current) return { data: null, error: new Error("Profile not found.") };
    const next = this.updateValue
      ? { ...current, ...this.updateValue }
      : current;
    this.profiles.set(next.id, next);
    return { data: next, error: null };
  }
}

class FakeSupabase {
  user: User | null = null;
  expired = false;
  resetEmail?: string;
  password?: string;
  listener?: AuthListener;
  readonly profiles = new Map<string, Row>();

  readonly auth = {
    getUser: async () =>
      this.expired
        ? {
            data: { user: null },
            error: Object.assign(new Error("JWT expired"), { status: 401 }),
          }
        : { data: { user: this.user }, error: null },
    signUp: async ({
      email,
      options,
    }: {
      email: string;
      password: string;
      options: {
        data: { handle: string; display_name: string };
        emailRedirectTo: string;
      };
    }) => {
      this.user = { ...firstUser, email };
      this.profiles.set(firstUser.id, {
        id: firstUser.id,
        handle: options.data.handle,
        display_name: options.data.display_name,
        bio: "",
        avatar_path: null,
        created_at: "2026-07-29T00:00:00.000Z",
        updated_at: "2026-07-29T00:00:00.000Z",
      });
      return {
        data: {
          user: this.user,
          session: { user: this.user } as Session,
        },
        error: null,
      };
    },
    signInWithPassword: async ({ email }: { email: string }) => {
      this.user = { ...firstUser, email };
      return { data: { user: this.user }, error: null };
    },
    signOut: async () => {
      this.user = null;
      this.listener?.("SIGNED_OUT", null);
      return { error: null };
    },
    resetPasswordForEmail: async (email: string) => {
      this.resetEmail = email;
      return { error: null };
    },
    updateUser: async ({ password }: { password: string }) => {
      this.password = password;
      return { data: { user: this.user }, error: null };
    },
    exchangeCodeForSession: async () => ({ data: {}, error: null }),
    getClaims: async () => ({
      data: this.user ? { claims: { sub: this.user.id } } : null,
      error: null,
    }),
    onAuthStateChange: (listener: AuthListener) => {
      this.listener = listener;
      return {
        data: { subscription: { unsubscribe: () => undefined } },
      };
    },
  };

  from() {
    return new FakeQuery(this.profiles);
  }
}

const client = (fake: FakeSupabase) =>
  createSupabasePlatformClient(
    fake as unknown as SupabaseClient<SupabaseDatabase>,
  );

test("signup, session restoration, profile editing, and public reads use the adapter", async () => {
  const fake = new FakeSupabase();
  const platform = client(fake);
  const signup = await platform.authentication.signUp({
    email: " creator@example.test ",
    password: "correct horse battery staple",
    handle: " Creator_One ",
    displayName: " Creator One ",
    emailRedirectTo: "http://127.0.0.1:3000/auth/callback",
  });
  assert.equal(signup.identity?.profile.handle, "creator_one");
  assert.equal(signup.verificationRequired, false);
  assert.equal(
    (await platform.authentication.currentIdentity())?.email,
    "creator@example.test",
  );
  const updated = await platform.profiles.updateOwn({
    handle: "creator_new",
    displayName: "Creator New",
    bio: "A public bio",
  });
  assert.equal(updated.bio, "A public bio");
  assert.equal(
    (await platform.profiles.getByHandle("CREATOR_NEW"))?.displayName,
    "Creator New",
  );
});

test("login, recovery, password change, logout, and expired sessions are explicit", async () => {
  const fake = new FakeSupabase();
  fake.profiles.set(firstUser.id, {
    id: firstUser.id,
    handle: "creator_one",
    display_name: "Creator One",
    bio: "",
    avatar_path: null,
    created_at: "2026-07-29T00:00:00.000Z",
    updated_at: "2026-07-29T00:00:00.000Z",
  });
  const platform = client(fake);
  const identity = await platform.authentication.signIn(
    "creator@example.test",
    "password",
  );
  assert.equal(identity.profile.handle, "creator_one");
  await platform.authentication.requestPasswordReset(
    " creator@example.test ",
    "http://127.0.0.1:3000/reset-password",
  );
  assert.equal(fake.resetEmail, "creator@example.test");
  await platform.authentication.updatePassword("new secure password");
  assert.equal(fake.password, "new secure password");

  const events: string[] = [];
  const unsubscribe = platform.authentication.subscribe((change) =>
    events.push(change.event),
  );
  await platform.authentication.signOut();
  unsubscribe();
  assert.deepEqual(events, ["signed-out"]);
  assert.equal(await platform.authentication.currentIdentity(), null);

  fake.expired = true;
  assert.equal(await platform.authentication.currentIdentity(), null);
});
