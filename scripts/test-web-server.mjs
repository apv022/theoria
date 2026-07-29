import { spawn } from "node:child_process";
import { createServer } from "node:http";

const profiles = new Map();
const users = new Map();
const tokens = new Map();
let expired = false;

const json = (response, status, value, extra = {}) => {
  response.writeHead(status, {
    "access-control-allow-origin": "http://127.0.0.1:3000",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info, x-supabase-api-version, prefer, accept-profile, content-profile",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-expose-headers": "content-range",
    "content-type": "application/json",
    ...extra,
  });
  response.end(JSON.stringify(value));
};

const body = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
    : {};
};

const encoded = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const session = (user) => {
  const accessToken = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    role: "authenticated",
    sub: user.id,
  })}.test-signature`;
  tokens.set(accessToken, user.id);
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `refresh-${user.id}`,
    user,
  };
};

const authUser = (request) => {
  const token = request.headers.authorization?.replace(/^Bearer /, "");
  const id = token ? tokens.get(token) : undefined;
  return id ? users.get(id) : undefined;
};

const profileForQuery = (url) => {
  const id = url.searchParams.get("id")?.replace(/^eq\./, "");
  const handle = url.searchParams.get("handle")?.replace(/^eq\./, "");
  if (id) return profiles.get(id);
  return [...profiles.values()].find((profile) => profile.handle === handle);
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:55431");
  if (request.method === "OPTIONS") return json(response, 200, {});
  if (url.pathname === "/__test/reset") {
    profiles.clear();
    users.clear();
    tokens.clear();
    expired = false;
    return json(response, 200, {});
  }
  if (url.pathname === "/__test/expire") {
    expired = true;
    return json(response, 200, {});
  }
  if (url.pathname === "/auth/v1/.well-known/jwks.json")
    return json(response, 200, { keys: [] });
  if (url.pathname === "/auth/v1/signup" && request.method === "POST") {
    const value = await body(request);
    const handle = String(value.data?.handle ?? "")
      .trim()
      .toLowerCase();
    if (
      !/^[a-z][a-z0-9_]{2,29}$/.test(handle) ||
      ["admin", "auth", "root", "settings", "studio", "theoria"].includes(
        handle,
      )
    )
      return json(response, 422, {
        code: "profiles_handle_format",
        msg: "profiles_handle_format",
      });
    if ([...profiles.values()].some((profile) => profile.handle === handle))
      return json(response, 422, {
        code: "profiles_handle_key",
        msg: "profiles_handle_key duplicate",
      });
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const user = {
      id,
      aud: "authenticated",
      role: "authenticated",
      email: value.email,
      email_confirmed_at: now,
      phone: "",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: value.data ?? {},
      identities: [],
      created_at: now,
      updated_at: now,
      is_anonymous: false,
    };
    const profile = {
      id,
      handle,
      display_name: String(value.data?.display_name ?? handle).trim(),
      bio: "",
      avatar_path: null,
      created_at: now,
      updated_at: now,
    };
    users.set(id, user);
    profiles.set(id, profile);
    return json(response, 200, session(user));
  }
  if (
    url.pathname === "/auth/v1/token" &&
    request.method === "POST" &&
    url.searchParams.get("grant_type") === "password"
  ) {
    const value = await body(request);
    const user = [...users.values()].find(
      (candidate) => candidate.email === value.email,
    );
    if (!user)
      return json(response, 400, {
        code: "invalid_credentials",
        msg: "Invalid login credentials",
      });
    expired = false;
    return json(response, 200, session(user));
  }
  if (url.pathname === "/auth/v1/user" && request.method === "GET") {
    const user = expired ? undefined : authUser(request);
    return user
      ? json(response, 200, user)
      : json(response, 401, {
          code: "bad_jwt",
          msg: "JWT expired",
        });
  }
  if (url.pathname === "/auth/v1/user" && request.method === "PUT") {
    const user = authUser(request);
    if (!user)
      return json(response, 401, { code: "bad_jwt", msg: "JWT expired" });
    user.updated_at = new Date().toISOString();
    return json(response, 200, user);
  }
  if (url.pathname === "/auth/v1/logout") return json(response, 200, {});
  if (url.pathname === "/auth/v1/recover") return json(response, 200, {});
  if (
    url.pathname === "/auth/v1/token" &&
    url.searchParams.get("grant_type") === "refresh_token"
  ) {
    const user = [...users.values()][0];
    return user
      ? json(response, 200, session(user))
      : json(response, 401, { msg: "Invalid refresh token" });
  }
  if (url.pathname === "/rest/v1/profiles" && request.method === "GET") {
    const profile = profileForQuery(url);
    const wantsObject = request.headers.accept?.includes(
      "application/vnd.pgrst.object",
    );
    return json(
      response,
      200,
      wantsObject ? (profile ?? null) : profile ? [profile] : [],
      { "content-range": profile ? "0-0/1" : "*/0" },
    );
  }
  if (url.pathname === "/rest/v1/profiles" && request.method === "PATCH") {
    const user = authUser(request);
    if (!user)
      return json(response, 401, { code: "42501", message: "RLS rejected" });
    const value = await body(request);
    const current = profiles.get(user.id);
    const next = {
      ...current,
      ...value,
      updated_at: new Date().toISOString(),
    };
    profiles.set(user.id, next);
    return json(response, 200, next);
  }
  return json(response, 404, { message: `Unhandled ${url.pathname}` });
});

server.listen(55431, "127.0.0.1");

const child = spawn("corepack", ["pnpm", "--filter", "@theoria/web", "start"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

const close = (signal) => {
  child.kill(signal);
  server.close();
};
process.on("SIGINT", () => close("SIGINT"));
process.on("SIGTERM", () => close("SIGTERM"));
child.on("exit", (code) => {
  server.close();
  process.exitCode = code ?? 1;
});
