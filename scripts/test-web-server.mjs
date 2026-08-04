import { spawn } from "node:child_process";
import { createServer } from "node:http";

const profiles = new Map();
const users = new Map();
const tokens = new Map();
const packages = new Map();
const packageVersions = new Map();
const packageStars = new Map();
const sourceObjects = new Map();
const syncDevices = new Map();
const syncRecords = new Map();
const syncBlobs = new Map();
const syncObjects = new Map();
let syncCursor = 0;
let expired = false;
let failNextUpload = false;
let failRepository = false;

const json = (response, status, value, extra = {}) => {
  response.writeHead(status, {
    "access-control-allow-origin": "http://127.0.0.1:3000",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info, x-supabase-api-version, x-upsert, x-retry-count, prefer, accept-profile, content-profile",
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
    if (
      /content-disposition:[^\r\n]*(?:filename=|name="file")/i.test(headers) ||
      /content-type:\s*application\/(?:x-)?zip/i.test(headers)
    )
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

const repositoryRow = (packageValue, version, profile, totalCount) => ({
  package_id: packageValue.id,
  owner_id: packageValue.owner_id,
  slug: packageValue.slug,
  title: packageValue.title,
  description: packageValue.description,
  visibility: packageValue.visibility,
  latest_version_id: packageValue.latest_version_id,
  package_created_at: packageValue.created_at,
  package_updated_at: packageValue.updated_at,
  profile_id: profile.id,
  creator_handle: profile.handle,
  creator_display_name: profile.display_name,
  creator_bio: profile.bio,
  creator_avatar_path: profile.avatar_path,
  creator_created_at: profile.created_at,
  creator_updated_at: profile.updated_at,
  version_id: version.id,
  version: version.version,
  mcf_version: version.mcf_version,
  package_kind: version.package_kind,
  source_storage_path: version.source_storage_path,
  source_checksum: version.source_checksum,
  manifest_summary: version.manifest_summary,
  validation_summary: version.validation_summary,
  release_notes: version.release_notes,
  published_at: version.published_at,
  total_count: totalCount,
});

const repositoryValues = () =>
  [...packages.values()].flatMap((packageValue) => {
    if (packageValue.visibility !== "public") return [];
    const version = packageVersions.get(packageValue.latest_version_id);
    const profile = profiles.get(packageValue.owner_id);
    return version && profile ? [{ packageValue, version, profile }] : [];
  });

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
    packageStars.clear();
    sourceObjects.clear();
    syncDevices.clear();
    syncRecords.clear();
    syncBlobs.clear();
    syncObjects.clear();
    syncCursor = 0;
    expired = false;
    failNextUpload = false;
    failRepository = false;
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
  if (url.pathname === "/__test/fail-repository") {
    failRepository = true;
    return json(response, 200, {});
  }
  if (url.pathname === "/__test/sync-state") {
    const user = authUser(request);
    return json(response, 200, {
      records: user
        ? [...syncRecords.values()].filter(
            (record) => record.owner_id === user.id,
          )
        : [...syncRecords.values()],
      blobs: user
        ? [...syncBlobs.values()].filter((blob) => blob.owner_id === user.id)
        : [...syncBlobs.values()],
    });
  }
  if (url.pathname === "/__test/seed-repository" && request.method === "POST") {
    const value = await body(request);
    for (const seed of value.packages ?? []) {
      let profile = [...profiles.values()].find(
        (candidate) => candidate.handle === seed.creatorHandle,
      );
      if (!profile) {
        const ownerId = crypto.randomUUID();
        const now = new Date().toISOString();
        profile = {
          id: ownerId,
          handle: seed.creatorHandle,
          display_name: seed.creatorDisplayName ?? seed.creatorHandle,
          bio: seed.creatorBio ?? "",
          avatar_path: null,
          location: seed.creatorLocation ?? "",
          website_url: seed.creatorWebsite ?? "",
          created_at: now,
          updated_at: now,
        };
        profiles.set(ownerId, profile);
      }
      const packageId = crypto.randomUUID();
      const versionId = crypto.randomUUID();
      const publishedAt = seed.publishedAt ?? new Date().toISOString();
      const checksum = String(seed.checksum ?? "a".repeat(64));
      const version = String(seed.version ?? "1.0.0");
      const path = `packages/${profile.id}/${packageId}/${version}/${checksum}.mcf.zip`;
      packageVersions.set(versionId, {
        id: versionId,
        package_id: packageId,
        version,
        mcf_version: seed.mcfVersion ?? "1.1",
        package_kind: seed.kind ?? "course",
        source_storage_path: path,
        source_checksum: checksum,
        source_size: Buffer.byteLength(seed.source ?? "invalid test source"),
        manifest_summary: {
          mcf: seed.mcfVersion ?? "1.1",
          kind: seed.kind ?? "course",
          id: seed.manifestId ?? seed.slug,
          title: seed.title,
          version,
          language: seed.language ?? "en",
          authors: [{ name: seed.creatorDisplayName ?? seed.creatorHandle }],
          license: seed.license ?? "CC-BY-4.0",
          subjects: seed.subjects ?? [],
          keywords: seed.keywords ?? [],
          ...(seed.level
            ? { level: { identifier: seed.level, label: seed.level } }
            : {}),
          learningOutcomes: (seed.learningOutcomes ?? []).map(
            (statement, index) => ({
              id: `outcome-${index + 1}`,
              statement,
            }),
          ),
          lessonCount: seed.lessonCount ?? 1,
          activityCount: seed.activityCount ?? 1,
          questionCount: seed.questionCount ?? 0,
        },
        validation_summary: { state: "valid", diagnostics: [] },
        release_notes: seed.releaseNotes ?? "",
        published_at: publishedAt,
      });
      packages.set(packageId, {
        id: packageId,
        owner_id: profile.id,
        slug: seed.slug,
        title: seed.title,
        description: seed.description ?? "",
        visibility: seed.visibility ?? "public",
        latest_version_id: versionId,
        parent_package_id: seed.parentPackageId ?? null,
        parent_version_id: seed.parentVersionId ?? null,
        created_at: publishedAt,
        updated_at: seed.updatedAt ?? publishedAt,
      });
      sourceObjects.set(path, {
        ownerId: profile.id,
        bytes: Buffer.from(seed.source ?? "invalid test source"),
      });
    }
    return json(response, 200, { packages: packages.size });
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
      location: "",
      website_url: "",
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
  if (
    url.pathname === "/rest/v1/sync_records" &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    const user = authUser(request);
    if (!user)
      return json(response, 401, { code: "42501", message: "RLS rejected" });
    const category = url.searchParams.get("category")?.replace(/^eq\./, "");
    const deleted = url.searchParams.get("deleted")?.replace(/^eq\./, "");
    const cursor = Number(
      url.searchParams.get("sync_cursor")?.replace(/^gt\./, "") ?? 0,
    );
    const limit = Math.max(1, Number(url.searchParams.get("limit") ?? 1000));
    const values = [...syncRecords.values()]
      .filter(
        (record) =>
          record.owner_id === user.id &&
          (!category || record.category === category) &&
          (deleted === undefined || String(record.deleted) === deleted) &&
          record.sync_cursor > cursor,
      )
      .sort((left, right) => left.sync_cursor - right.sync_cursor)
      .slice(0, limit);
    if (request.method === "HEAD") {
      response.writeHead(200, {
        "access-control-allow-origin": "http://127.0.0.1:3000",
        "access-control-allow-credentials": "true",
        "access-control-expose-headers": "content-range",
        "content-range": values.length
          ? `0-${values.length - 1}/${values.length}`
          : "*/0",
      });
      return response.end();
    }
    return restResult(request, response, values);
  }
  if (url.pathname === "/rest/v1/sync_blobs" && request.method === "GET") {
    const user = authUser(request);
    if (!user)
      return json(response, 401, { code: "42501", message: "RLS rejected" });
    const checksum = url.searchParams.get("checksum")?.replace(/^eq\./, "");
    const kind = url.searchParams.get("blob_kind")?.replace(/^eq\./, "");
    return restResult(
      request,
      response,
      [...syncBlobs.values()].filter(
        (blob) =>
          blob.owner_id === user.id &&
          (!checksum || blob.checksum === checksum) &&
          (!kind || blob.blob_kind === kind),
      ),
    );
  }
  if (url.pathname === "/rest/v1/packages" && request.method === "GET") {
    const user = authUser(request);
    const id = url.searchParams.get("id")?.replace(/^eq\./, "");
    const slug = url.searchParams.get("slug")?.replace(/^eq\./, "");
    const ownerId = url.searchParams.get("owner_id")?.replace(/^eq\./, "");
    if (ownerId && !id && !slug)
      return restResult(
        request,
        response,
        [...packages.values()].filter(
          (candidate) =>
            candidate.owner_id === ownerId && candidate.owner_id === user?.id,
        ),
      );
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
    url.pathname === "/rest/v1/rpc/profile_repository_summary" &&
    request.method === "POST"
  ) {
    const value = await body(request);
    const profile = [...profiles.values()].find(
      (candidate) =>
        candidate.handle === String(value.requested_handle ?? "").toLowerCase(),
    );
    if (!profile) return json(response, 200, []);
    const publicPackages = [...packages.values()].filter(
      (candidate) =>
        candidate.owner_id === profile.id && candidate.visibility === "public",
    );
    const releases = [...packageVersions.values()]
      .filter((release) =>
        publicPackages.some((candidate) => candidate.id === release.package_id),
      )
      .sort((left, right) =>
        right.published_at.localeCompare(left.published_at),
      );
    return json(response, 200, [
      {
        public_package_count: publicPackages.length,
        total_version_count: releases.length,
        total_stars_received: [...packageStars.values()].filter((star) =>
          publicPackages.some((candidate) => candidate.id === star.packageId),
        ).length,
        recent_activity: releases.slice(0, 8).map((release) => {
          const repository = packages.get(release.package_id);
          return {
            slug: repository.slug,
            title: repository.title,
            version: release.version,
            publishedAt: release.published_at,
          };
        }),
      },
    ]);
  }
  if (
    url.pathname === "/rest/v1/rpc/repository_package_network" &&
    request.method === "POST"
  ) {
    const value = await body(request);
    const user = authUser(request);
    const target = packages.get(value.requested_package_id);
    if (!visiblePackage(target, user)) return json(response, 200, []);
    const parent = target.parent_package_id
      ? packages.get(target.parent_package_id)
      : undefined;
    const parentVersion = target.parent_version_id
      ? packageVersions.get(target.parent_version_id)
      : undefined;
    const parentProfile = parent ? profiles.get(parent.owner_id) : undefined;
    const directForks = [...packages.values()]
      .filter(
        (candidate) =>
          candidate.parent_package_id === target.id &&
          candidate.visibility === "public",
      )
      .map((candidate) => ({
        slug: candidate.slug,
        title: candidate.title,
        creatorHandle: profiles.get(candidate.owner_id)?.handle ?? "unknown",
        createdAt: candidate.created_at,
      }));
    return json(response, 200, [
      {
        star_count: [...packageStars.values()].filter(
          (star) => star.packageId === target.id,
        ).length,
        fork_count: directForks.length,
        viewer_starred: Boolean(
          user && packageStars.has(`${user.id}:${target.id}`),
        ),
        parent_slug:
          parent && visiblePackage(parent, user) ? parent.slug : null,
        parent_title:
          parent && visiblePackage(parent, user) ? parent.title : null,
        parent_version:
          parent && visiblePackage(parent, user)
            ? parentVersion?.version
            : null,
        parent_creator_handle:
          parent && visiblePackage(parent, user) ? parentProfile?.handle : null,
        direct_forks: directForks,
      },
    ]);
  }
  if (
    url.pathname === "/rest/v1/rpc/set_package_star" &&
    request.method === "POST"
  ) {
    const user = authUser(request);
    if (!user)
      return json(response, 401, {
        code: "42501",
        message: "Authentication required",
      });
    const value = await body(request);
    const target = packages.get(value.requested_package_id);
    if (!visiblePackage(target, user))
      return json(response, 403, {
        code: "42501",
        message: "Package is unavailable",
      });
    const key = `${user.id}:${target.id}`;
    if (value.requested_starred)
      packageStars.set(key, {
        userId: user.id,
        packageId: target.id,
        createdAt: new Date().toISOString(),
      });
    else packageStars.delete(key);
    return json(response, 200, [
      {
        starred: packageStars.has(key),
        star_count: [...packageStars.values()].filter(
          (star) => star.packageId === target.id,
        ).length,
      },
    ]);
  }
  if (
    url.pathname === "/rest/v1/rpc/repository_starred_package_ids" &&
    request.method === "POST"
  ) {
    const user = authUser(request);
    if (!user)
      return json(response, 401, {
        code: "42501",
        message: "Authentication required",
      });
    const value = await body(request);
    const values = [...packageStars.values()]
      .filter(
        (star) =>
          star.userId === user.id &&
          visiblePackage(packages.get(star.packageId), user),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const total = values.length;
    const offset = Number(value.requested_offset ?? 0);
    const limit = Number(value.requested_limit ?? 12);
    return json(
      response,
      200,
      values.slice(offset, offset + limit).map((star) => ({
        package_id: star.packageId,
        starred_at: star.createdAt,
        total_count: total,
      })),
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
    url.pathname === "/rest/v1/rpc/sync_register_device" &&
    request.method === "POST"
  ) {
    const user = authUser(request);
    if (!user)
      return json(response, 401, {
        code: "42501",
        message: "Authentication required",
      });
    const value = await body(request);
    const key = `${user.id}:${value.requested_device_id}`;
    const existing = syncDevices.get(key);
    const now = new Date().toISOString();
    const device = {
      owner_id: user.id,
      device_id: value.requested_device_id,
      device_name: value.requested_device_name,
      enabled: Boolean(value.requested_enabled),
      created_at: existing?.created_at ?? now,
      last_seen_at: now,
    };
    syncDevices.set(key, device);
    return json(response, 200, device);
  }
  if (
    url.pathname === "/rest/v1/rpc/sync_apply_record" &&
    request.method === "POST"
  ) {
    const user = authUser(request);
    if (!user)
      return json(response, 401, {
        code: "42501",
        message: "Authentication required",
      });
    const value = await body(request);
    const device = syncDevices.get(`${user.id}:${value.requested_device_id}`);
    if (!device?.enabled)
      return json(response, 403, {
        code: "42501",
        message: "sync is not enabled for this device",
      });
    const key = `${user.id}:${value.requested_category}:${value.requested_stable_id}`;
    const existing = syncRecords.get(key);
    if (existing?.last_operation_id === value.requested_operation_id)
      return json(response, 200, existing);
    if (
      Number(existing?.revision ?? 0) !==
      Number(value.requested_expected_revision ?? 0)
    )
      return json(response, 409, {
        code: "40001",
        message: "remote revision conflict",
      });
    syncCursor += 1;
    const now = new Date().toISOString();
    const record = {
      owner_id: user.id,
      category: value.requested_category,
      stable_id: value.requested_stable_id,
      schema_version: value.requested_schema_version,
      revision: Number(value.requested_expected_revision ?? 0) + 1,
      reset_generation: value.requested_reset_generation,
      source_checksum: value.requested_source_checksum,
      payload: value.requested_payload,
      artifact_status: value.requested_artifact_status,
      deleted: Boolean(value.requested_deleted),
      updated_by_device_id: value.requested_device_id,
      last_operation_id: value.requested_operation_id,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      sync_cursor: syncCursor,
    };
    syncRecords.set(key, record);
    return json(response, 200, record);
  }
  if (
    url.pathname === "/rest/v1/rpc/sync_register_blob" &&
    request.method === "POST"
  ) {
    const user = authUser(request);
    if (!user)
      return json(response, 401, {
        code: "42501",
        message: "Authentication required",
      });
    const value = await body(request);
    const object = syncObjects.get(value.requested_storage_path);
    if (!object || object.ownerId !== user.id)
      return json(response, 400, {
        code: "22023",
        message: "private sync blob upload is missing",
      });
    const key = `${user.id}:${value.requested_checksum}`;
    const record = syncBlobs.get(key) ?? {
      owner_id: user.id,
      checksum: value.requested_checksum,
      blob_kind: value.requested_blob_kind,
      storage_path: value.requested_storage_path,
      byte_size: value.requested_byte_size,
      content_type: value.requested_content_type,
      created_at: new Date().toISOString(),
    };
    syncBlobs.set(key, record);
    return json(response, 200, record);
  }
  if (
    url.pathname === "/rest/v1/rpc/repository_packages" &&
    request.method === "POST"
  ) {
    if (failRepository)
      return json(response, 503, {
        code: "REPOSITORY_UNAVAILABLE",
        message: "Test repository unavailable",
      });
    const value = await body(request);
    const query = String(value.requested_query ?? "")
      .trim()
      .toLowerCase();
    const subject = String(value.requested_subject ?? "").toLowerCase();
    const level = String(value.requested_level ?? "").toLowerCase();
    const language = String(value.requested_language ?? "").toLowerCase();
    const kind = String(value.requested_kind ?? "");
    const mcfVersion = String(value.requested_mcf_version ?? "");
    const handle = String(value.requested_profile_handle ?? "").toLowerCase();
    const sort = String(value.requested_sort ?? "newest");
    const filtered = repositoryValues()
      .map((item) => {
        const manifest = item.version.manifest_summary;
        const searchable = [
          item.packageValue.title,
          item.packageValue.description,
          item.packageValue.slug,
          item.profile.handle,
          item.profile.display_name,
          ...(manifest.subjects ?? []),
          ...(manifest.keywords ?? []),
          JSON.stringify(manifest.learningOutcomes ?? []),
          JSON.stringify(manifest.level ?? {}),
        ]
          .join(" ")
          .toLowerCase();
        const title = item.packageValue.title.toLowerCase();
        const score = !query
          ? 0
          : title.includes(query)
            ? 3
            : `${item.profile.handle} ${item.profile.display_name}`
                  .toLowerCase()
                  .includes(query)
              ? 2
              : searchable.includes(query)
                ? 1
                : 0;
        return { ...item, score, manifest };
      })
      .filter(
        (item) =>
          (!query || item.score > 0) &&
          (!subject ||
            (item.manifest.subjects ?? []).some(
              (candidate) => candidate.toLowerCase() === subject,
            )) &&
          (!level ||
            String(
              item.manifest.level?.identifier ??
                item.manifest.level?.label ??
                item.manifest.level ??
                "",
            ).toLowerCase() === level) &&
          (!language ||
            String(item.manifest.language ?? "").toLowerCase() === language) &&
          (!kind || item.version.package_kind === kind) &&
          (!mcfVersion || item.version.mcf_version === mcfVersion) &&
          (!handle || item.profile.handle === handle),
      )
      .sort((left, right) => {
        if (sort === "relevance" && query && left.score !== right.score)
          return right.score - left.score;
        if (sort === "title")
          return (
            left.packageValue.title.localeCompare(right.packageValue.title) ||
            left.packageValue.id.localeCompare(right.packageValue.id)
          );
        const field = sort === "updated" ? "updated_at" : undefined;
        const leftDate = field
          ? left.packageValue[field]
          : left.version.published_at;
        const rightDate = field
          ? right.packageValue[field]
          : right.version.published_at;
        return (
          rightDate.localeCompare(leftDate) ||
          left.packageValue.title.localeCompare(right.packageValue.title) ||
          left.packageValue.id.localeCompare(right.packageValue.id)
        );
      });
    const total = filtered.length;
    const offset = Math.max(0, Number(value.requested_offset ?? 0));
    const limit = Math.min(
      24,
      Math.max(1, Number(value.requested_limit ?? 12)),
    );
    return json(
      response,
      200,
      filtered
        .slice(offset, offset + limit)
        .map((item) =>
          repositoryRow(item.packageValue, item.version, item.profile, total),
        ),
    );
  }
  if (
    url.pathname === "/rest/v1/rpc/repository_subjects" &&
    request.method === "POST"
  ) {
    if (failRepository)
      return json(response, 503, {
        code: "REPOSITORY_UNAVAILABLE",
        message: "Test repository unavailable",
      });
    const value = await body(request);
    const counts = new Map();
    for (const item of repositoryValues())
      for (const subject of item.version.manifest_summary.subjects ?? []) {
        const normalized = subject.toLowerCase();
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      }
    const limit = Math.min(24, Math.max(1, Number(value.requested_limit ?? 8)));
    return json(
      response,
      200,
      [...counts.entries()]
        .sort(
          ([leftName, leftCount], [rightName, rightCount]) =>
            rightCount - leftCount || leftName.localeCompare(rightName),
        )
        .slice(0, limit)
        .map(([subjectName, packageCount]) => ({
          subject: subjectName,
          package_count: packageCount,
        })),
    );
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
    if (conflict) {
      const previous = [...packageVersions.values()].find(
        (candidate) =>
          candidate.package_id === value.requested_package_id &&
          candidate.version === value.requested_version,
      );
      if (
        previous.source_checksum === value.requested_source_checksum &&
        previous.source_storage_path === value.requested_source_storage_path &&
        previous.source_size === value.requested_source_size &&
        JSON.stringify(previous.manifest_summary) ===
          JSON.stringify(value.requested_manifest_summary) &&
        previous.release_notes === value.requested_release_notes
      )
        return json(response, 200, [
          {
            package_id: value.requested_package_id,
            version_id: previous.id,
            slug: packages.get(value.requested_package_id)?.slug,
            version: previous.version,
            published_at: previous.published_at,
          },
        ]);
      return json(response, 409, {
        code: "23505",
        message: "package version already exists",
      });
    }
    const existing = packages.get(value.requested_package_id);
    if (existing && existing.owner_id !== user.id)
      return json(response, 403, {
        code: "42501",
        message: "package belongs to another creator",
      });
    if (
      existing &&
      (existing.parent_package_id !==
        (value.requested_parent_package_id ?? null) ||
        existing.parent_version_id !==
          (value.requested_parent_version_id ?? null))
    )
      return json(response, 409, {
        code: "55000",
        message: "published fork lineage cannot be changed",
      });
    if (value.requested_parent_package_id) {
      const parent = packages.get(value.requested_parent_package_id);
      const parentVersion = packageVersions.get(
        value.requested_parent_version_id,
      );
      if (
        !visiblePackage(parent, user) ||
        parentVersion?.package_id !== parent?.id
      )
        return json(response, 403, {
          code: "42501",
          message: "fork source is unavailable",
        });
      if (
        !existing &&
        [...packages.values()].some(
          (candidate) =>
            candidate.owner_id === user.id &&
            candidate.parent_package_id === value.requested_parent_package_id &&
            candidate.parent_version_id === value.requested_parent_version_id,
        )
      )
        return json(response, 409, {
          code: "23505",
          message: "fork already exists",
        });
    }
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
      source_size: value.requested_source_size,
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
      parent_package_id:
        existing?.parent_package_id ??
        value.requested_parent_package_id ??
        null,
      parent_version_id:
        existing?.parent_version_id ??
        value.requested_parent_version_id ??
        null,
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
        error: sourceObjects.has(path) ? "Duplicate" : "Invalid path",
        message: sourceObjects.has(path)
          ? "Object already exists"
          : "Object path is unavailable",
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
  const syncObjectPrefix = "/storage/v1/object/account-sync/";
  if (url.pathname.startsWith(syncObjectPrefix) && request.method === "POST") {
    const user = authUser(request);
    if (!user)
      return json(response, 401, {
        statusCode: "401",
        error: "Unauthorized",
        message: "Authentication required",
      });
    const path = decodeURIComponent(
      url.pathname.slice(syncObjectPrefix.length),
    );
    if (!path.startsWith(`users/${user.id}/`))
      return json(response, 403, {
        statusCode: "403",
        error: "Forbidden",
        message: "Private path rejected",
      });
    if (syncObjects.has(path))
      return json(response, 400, {
        statusCode: "400",
        error: "Duplicate",
        message: "Object already exists",
      });
    const raw = await rawBody(request);
    syncObjects.set(path, {
      ownerId: user.id,
      bytes: multipartFile(raw, String(request.headers["content-type"] ?? "")),
    });
    return json(response, 200, {
      Id: crypto.randomUUID(),
      Key: `account-sync/${path}`,
    });
  }
  if (url.pathname.startsWith(syncObjectPrefix) && request.method === "GET") {
    const user = authUser(request);
    const path = decodeURIComponent(
      url.pathname.slice(syncObjectPrefix.length),
    );
    const object = syncObjects.get(path);
    const registered = [...syncBlobs.values()].some(
      (blob) => blob.owner_id === user?.id && blob.storage_path === path,
    );
    if (!user || object?.ownerId !== user.id || !registered)
      return json(response, 404, {
        statusCode: "404",
        error: "Not found",
        message: "Object not found",
      });
    response.writeHead(200, {
      "access-control-allow-origin": "http://127.0.0.1:3000",
      "access-control-allow-credentials": "true",
      "content-type": "application/octet-stream",
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
