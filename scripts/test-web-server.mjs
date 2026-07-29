import { spawn } from "node:child_process";
import { createServer } from "node:http";

const profiles = new Map();
const users = new Map();
const tokens = new Map();
const packages = new Map();
const packageVersions = new Map();
const sourceObjects = new Map();
let expired = false;
let failNextUpload = false;

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

const rawBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const multipartFile = (buffer, contentType) => {
  const boundary =
    contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[1] ??
    contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/)?.[2];
  if (!boundary) return buffer;
  const marker = Buffer.from(`--${boundary}`);
  let offset = 0;
  while (offset < buffer.length) {
    const start = buffer.indexOf(marker, offset);
    if (start < 0) break;
    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), start);
    if (headerEnd < 0) break;
    const next = buffer.indexOf(marker, headerEnd + 4);
    if (next < 0) break;
    const headers = buffer.subarray(start, headerEnd).toString("utf8");
    if (/content-type:\s*application\/(?:x-)?zip/i.test(headers))
      return buffer.subarray(headerEnd + 4, Math.max(headerEnd + 4, next - 2));
    offset = next;
  }
  return buffer;
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

const visiblePackage = (value, user) =>
  value &&
  (value.visibility === "public" ||
    value.visibility === "unlisted" ||
    value.owner_id === user?.id);

const restResult = (request, response, value) => {
  const wantsObject = request.headers.accept?.includes(
    "application/vnd.pgrst.object",
  );
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return json(response, 200, wantsObject ? (values[0] ?? null) : values, {
    "content-range": values.length
      ? `0-${values.length - 1}/${values.length}`
      : "*/0",
  });
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:55431");
  if (request.method === "OPTIONS") return json(response, 200, {});
  if (url.pathname === "/__test/reset") {
    profiles.clear();
    users.clear();
    tokens.clear();
    packages.clear();
    packageVersions.clear();
    sourceObjects.clear();
    expired = false;
    failNextUpload = false;
    return json(response, 200, {});
  }
  if (url.pathname === "/__test/expire") {
    expired = true;
    return json(response, 200, {});
  }
  if (url.pathname === "/__test/fail-upload") {
    failNextUpload = true;
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
  if (url.pathname === "/rest/v1/packages" && request.method === "GET") {
    const user = authUser(request);
    const id = url.searchParams.get("id")?.replace(/^eq\./, "");
    const slug = url.searchParams.get("slug")?.replace(/^eq\./, "");
    const value = [...packages.values()].find(
      (candidate) =>
        (!id || candidate.id === id) && (!slug || candidate.slug === slug),
    );
    return restResult(
      request,
      response,
      visiblePackage(value, user) ? value : undefined,
    );
  }
  if (
    url.pathname === "/rest/v1/package_versions" &&
    request.method === "GET"
  ) {
    const user = authUser(request);
    const packageId = url.searchParams.get("package_id")?.replace(/^eq\./, "");
    const parent = packageId ? packages.get(packageId) : undefined;
    const values = visiblePackage(parent, user)
      ? [...packageVersions.values()]
          .filter((candidate) => candidate.package_id === packageId)
          .sort((left, right) =>
            right.published_at.localeCompare(left.published_at),
          )
      : [];
    return restResult(request, response, values);
  }
  if (
    url.pathname === "/rest/v1/rpc/package_slug_available" &&
    request.method === "POST"
  ) {
    const user = authUser(request);
    if (!user)
      return json(response, 401, {
        code: "42501",
        message: "Authentication required",
      });
    const value = await body(request);
    const slug = String(value.candidate ?? "")
      .trim()
      .toLowerCase();
    const existingId = value.existing_package_id;
    const available =
      /^[a-z][a-z0-9-]{2,62}$/.test(slug) &&
      ![...packages.values()].some(
        (candidate) => candidate.slug === slug && candidate.id !== existingId,
      );
    return json(response, 200, available);
  }
  if (
    url.pathname === "/rest/v1/rpc/package_version_available" &&
    request.method === "POST"
  ) {
    const user = authUser(request);
    if (!user)
      return json(response, 401, {
        code: "42501",
        message: "Authentication required",
      });
    const value = await body(request);
    const parent = packages.get(value.candidate_package_id);
    const available =
      parent?.owner_id === user.id &&
      ![...packageVersions.values()].some(
        (candidate) =>
          candidate.package_id === value.candidate_package_id &&
          candidate.version === value.candidate_version,
      );
    return json(response, 200, available);
  }
  if (
    url.pathname === "/rest/v1/rpc/publish_package_version" &&
    request.method === "POST"
  ) {
    const user = authUser(request);
    if (!user)
      return json(response, 401, {
        code: "42501",
        message: "Authentication required",
      });
    const value = await body(request);
    const object = sourceObjects.get(value.requested_source_storage_path);
    if (!object || object.ownerId !== user.id)
      return json(response, 400, {
        code: "22023",
        message: "Verified source upload is missing",
      });
    const conflict = [...packageVersions.values()].some(
      (candidate) =>
        candidate.package_id === value.requested_package_id &&
        candidate.version === value.requested_version,
    );
    if (conflict)
      return json(response, 409, {
        code: "23505",
        message: "package version already exists",
      });
    const existing = packages.get(value.requested_package_id);
    if (existing && existing.owner_id !== user.id)
      return json(response, 403, {
        code: "42501",
        message: "package belongs to another creator",
      });
    if (
      [...packages.values()].some(
        (candidate) =>
          candidate.slug === value.requested_slug &&
          candidate.id !== value.requested_package_id,
      )
    )
      return json(response, 409, {
        code: "23505",
        message: "package slug is unavailable",
      });
    const now = new Date().toISOString();
    const versionId = crypto.randomUUID();
    const version = {
      id: versionId,
      package_id: value.requested_package_id,
      version: value.requested_version,
      mcf_version: value.requested_mcf_version,
      package_kind: value.requested_package_kind,
      source_storage_path: value.requested_source_storage_path,
      source_checksum: value.requested_source_checksum,
      manifest_summary: value.requested_manifest_summary,
      validation_summary: value.requested_validation_summary,
      release_notes: value.requested_release_notes,
      published_at: now,
    };
    packageVersions.set(versionId, version);
    packages.set(value.requested_package_id, {
      id: value.requested_package_id,
      owner_id: user.id,
      slug: value.requested_slug,
      title: value.requested_title,
      description: value.requested_description,
      visibility: value.requested_visibility,
      latest_version_id: versionId,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });
    return json(response, 200, [
      {
        package_id: value.requested_package_id,
        version_id: versionId,
        slug: value.requested_slug,
        version: value.requested_version,
        published_at: now,
      },
    ]);
  }
  const uploadPrefix = "/storage/v1/object/package-sources/";
  if (url.pathname.startsWith(uploadPrefix) && request.method === "POST") {
    const user = authUser(request);
    if (!user)
      return json(response, 401, {
        statusCode: "401",
        error: "Unauthorized",
        message: "Authentication required",
      });
    if (failNextUpload) {
      failNextUpload = false;
      return json(response, 503, {
        statusCode: "503",
        error: "Unavailable",
        message: "Temporary upload failure",
      });
    }
    const path = decodeURIComponent(url.pathname.slice(uploadPrefix.length));
    if (!path.startsWith(`packages/${user.id}/`) || sourceObjects.has(path))
      return json(response, 400, {
        statusCode: "400",
        error: "Invalid path",
        message: "Object path is unavailable",
      });
    const raw = await rawBody(request);
    sourceObjects.set(path, {
      ownerId: user.id,
      bytes: multipartFile(raw, String(request.headers["content-type"] ?? "")),
    });
    return json(response, 200, {
      Id: crypto.randomUUID(),
      Key: `package-sources/${path}`,
    });
  }
  if (
    url.pathname === "/storage/v1/object/package-sources" &&
    request.method === "DELETE"
  ) {
    const user = authUser(request);
    const value = await body(request);
    for (const path of value.prefixes ?? []) {
      const object = sourceObjects.get(path);
      const finalized = [...packageVersions.values()].some(
        (candidate) => candidate.source_storage_path === path,
      );
      if (object?.ownerId === user?.id && !finalized)
        sourceObjects.delete(path);
    }
    return json(response, 200, []);
  }
  const downloadPrefix = "/storage/v1/object/package-sources/";
  if (url.pathname.startsWith(downloadPrefix) && request.method === "GET") {
    const path = decodeURIComponent(url.pathname.slice(downloadPrefix.length));
    const object = sourceObjects.get(path);
    const release = [...packageVersions.values()].find(
      (candidate) => candidate.source_storage_path === path,
    );
    const parent = release ? packages.get(release.package_id) : undefined;
    if (!object || !release || !visiblePackage(parent, authUser(request)))
      return json(response, 404, {
        statusCode: "404",
        error: "Not found",
        message: "Object not found",
      });
    response.writeHead(200, {
      "content-type": "application/zip",
      "content-length": object.bytes.length,
    });
    return response.end(object.bytes);
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
