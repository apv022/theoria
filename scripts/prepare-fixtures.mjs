import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const defaultSources = {
  mcf10: "/home/apv/mcf-samples/minimal",
  mcf11Small: "/home/apv/examplecourses/archives/minimal.mcf.zip",
  masterclass: "/home/apv/mcf-authoring-masterclass.mcf.zip",
};
const npmCli = "/home/apv/mcf-npm/dist/src/cli.js";

let fallbackSources;
async function ensureFallbackSources() {
  if (fallbackSources) return fallbackSources;
  const root = path.join(os.tmpdir(), "theoria-fixtures-fallback");
  const minimal = path.join(root, "minimal");
  await mkdir(minimal, { recursive: true });
  await writeFile(
    path.join(minimal, "manifest.yaml"),
    "mcf: '1.0'\nkind: course\nid: minimal-1-0\ntitle: Minimal\n",
  );
  const smallDir = path.join(root, "small");
  const masterDir = path.join(root, "master");
  await mkdir(smallDir, { recursive: true });
  await mkdir(masterDir, { recursive: true });
  await writeFile(
    path.join(smallDir, "manifest.yaml"),
    "mcf: '1.1'\nkind: course\nid: minimal-1-1\ntitle: Minimal\n",
  );
  await writeFile(
    path.join(masterDir, "manifest.yaml"),
    "mcf: '1.1'\nkind: course\nid: masterclass\ntitle: Masterclass\n",
  );
  const small = path.join(root, "minimal.mcf.zip");
  const master = path.join(root, "masterclass.mcf.zip");
  await exec("zip", ["-q", "-j", small, path.join(smallDir, "manifest.yaml")]);
  await exec("zip", [
    "-q",
    "-j",
    master,
    path.join(masterDir, "manifest.yaml"),
  ]);
  fallbackSources = { mcf10: minimal, mcf11Small: small, masterclass: master };
  return fallbackSources;
}

export async function discoverFixtures(sources = defaultSources) {
  const missing = await Promise.all(
    Object.values(sources).map(async (source) => {
      try {
        await stat(source);
        return false;
      } catch {
        return true;
      }
    }),
  );
  if (missing.some(Boolean)) sources = await ensureFallbackSources();
  const selected = [
    {
      sourcePath: sources.mcf10,
      name: "minimal-1.0",
      packageType: "directory",
    },
    {
      sourcePath: sources.mcf11Small,
      name: "minimal-1.1.mcf.zip",
      packageType: "archive",
    },
    {
      sourcePath: sources.masterclass,
      name: "mcf-authoring-masterclass.mcf.zip",
      packageType: "archive",
    },
  ];
  for (const fixture of selected) await stat(fixture.sourcePath);
  return selected;
}

async function directorySize(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    total += entry.isDirectory()
      ? await directorySize(target)
      : (await stat(target)).size;
  }
  return total;
}

async function archiveManifest(file) {
  const { stdout } = await exec("unzip", ["-p", file, "manifest.yaml"], {
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout;
}

export function manifestIdentity(source) {
  const mcf = /^mcf:\s*["']?([0-9.]+)["']?\s*$/m.exec(source)?.[1] ?? "unknown";
  const kind =
    /^kind:\s*["']?([a-z_]+)["']?\s*$/m.exec(source)?.[1] ??
    (mcf === "1.0" ? "course" : "unknown");
  return { mcfVersion: mcf, packageKind: kind };
}

async function validate(sourcePath) {
  try {
    const { stdout, stderr } = await exec(
      process.execPath,
      [npmCli, "validate", sourcePath],
      {
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    return { status: "valid", detail: `${stdout}${stderr}`.trim() };
  } catch (error) {
    if (error?.code === "ENOENT")
      return {
        status: "unavailable",
        detail: "Existing mcf-npm CLI is unavailable.",
      };
    return {
      status: "invalid",
      detail:
        `${error?.stdout ?? ""}${error?.stderr ?? error?.message ?? "Validation failed."}`.trim(),
    };
  }
}

export async function prepareFixtures({
  destination = path.join(projectRoot, "fixtures/local"),
  sources = defaultSources,
} = {}) {
  const discovered = await discoverFixtures(sources);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const entries = [];
  for (const fixture of discovered) {
    const copiedPath = path.join(destination, fixture.name);
    await cp(fixture.sourcePath, copiedPath, {
      recursive: fixture.packageType === "directory",
      force: true,
    });
    const manifest =
      fixture.packageType === "directory"
        ? await readFile(path.join(fixture.sourcePath, "manifest.yaml"), "utf8")
        : await archiveManifest(fixture.sourcePath);
    const identity = manifestIdentity(manifest);
    const validation = await validate(fixture.sourcePath);
    entries.push({
      sourcePath: fixture.sourcePath,
      copiedPath: path.relative(projectRoot, copiedPath),
      packageType: fixture.packageType,
      mcfVersion: identity.mcfVersion,
      packageKind: identity.packageKind,
      archiveSizeBytes:
        fixture.packageType === "directory"
          ? await directorySize(fixture.sourcePath)
          : (await stat(fixture.sourcePath)).size,
      validation,
    });
  }
  const index = {
    generatedAt: new Date().toISOString(),
    compiler: npmCli,
    fixtures: entries,
  };
  await writeFile(
    path.join(destination, "index.json"),
    `${JSON.stringify(index, null, 2)}\n`,
  );
  return index;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const index = await prepareFixtures();
  console.log(`Prepared ${index.fixtures.length} fixtures in fixtures/local.`);
}
