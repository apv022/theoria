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
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { unzipSync, zipSync } from "fflate";

const exec = promisify(execFile);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceRoot = path.join(projectRoot, "fixtures/sources");
const validator = path.join(
  projectRoot,
  "packages/mcf-browser/node_modules/.bin/mcf",
);

const defaultFixtures = [
  { source: "minimal-1.0", name: "minimal-1.0", packageType: "directory" },
  {
    source: "minimal-1.1",
    name: "minimal-1.1.mcf.zip",
    packageType: "archive",
  },
  {
    source: "standalone-module",
    name: "standalone-module.mcf.zip",
    packageType: "archive",
  },
  {
    source: "standalone-lesson",
    name: "standalone-lesson.mcf.zip",
    packageType: "archive",
  },
  {
    source: "feature-showcase",
    name: "feature-showcase.mcf.zip",
    packageType: "archive",
  },
  { source: "stress", name: "stress.mcf.zip", packageType: "archive" },
];

async function filesOf(directory, prefix = "") {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesOf(target, relative)));
    else if (entry.isFile())
      files.push({ path: relative, bytes: await readFile(target) });
  }
  return files;
}

async function directorySize(directory) {
  return (await filesOf(directory)).reduce(
    (total, file) => total + file.bytes.byteLength,
    0,
  );
}

async function createArchive(source, destination) {
  const input = Object.fromEntries(
    (await filesOf(source)).map((file) => [file.path, file.bytes]),
  );
  const archive = zipSync(input, {
    level: 9,
    mtime: new Date("1980-01-02T00:00:00.000Z"),
  });
  await writeFile(destination, archive);
}

async function archiveManifest(file) {
  const archive = unzipSync(new Uint8Array(await readFile(file)));
  const manifest = archive["manifest.yaml"];
  if (!manifest) throw new Error(`${file} does not contain manifest.yaml.`);
  return new TextDecoder().decode(manifest);
}

export function manifestIdentity(source) {
  const mcf = /^mcf:\s*["']?([0-9.]+)["']?\s*$/m.exec(source)?.[1] ?? "unknown";
  const kind =
    /^kind:\s*["']?([a-z_]+)["']?\s*$/m.exec(source)?.[1] ??
    (mcf === "1.0" ? "course" : "unknown");
  return { mcfVersion: mcf, packageKind: kind };
}

export async function discoverFixtures(fixtures = defaultFixtures) {
  const discovered = fixtures.map((fixture) => ({
    ...fixture,
    sourcePath: path.join(sourceRoot, fixture.source),
  }));
  for (const fixture of discovered) {
    const info = await stat(fixture.sourcePath);
    if (!info.isDirectory())
      throw new Error(`${fixture.sourcePath} must be a directory.`);
    await stat(path.join(fixture.sourcePath, "manifest.yaml"));
  }
  return discovered;
}

async function validate(sourcePath) {
  try {
    const { stdout, stderr } = await exec(validator, ["validate", sourcePath], {
      cwd: projectRoot,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { status: "valid", detail: `${stdout}${stderr}`.trim() };
  } catch (error) {
    const detail =
      `${error?.stdout ?? ""}${error?.stderr ?? error?.message ?? "Validation failed."}`.trim();
    throw new Error(`Fixture validation failed for ${sourcePath}: ${detail}`);
  }
}

export async function prepareFixtures({
  destination = path.join(projectRoot, "fixtures/local"),
  fixtures = defaultFixtures,
} = {}) {
  const discovered = await discoverFixtures(fixtures);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const entries = [];
  for (const fixture of discovered) {
    const output = path.join(destination, fixture.name);
    if (fixture.packageType === "directory")
      await cp(fixture.sourcePath, output, { recursive: true, force: true });
    else await createArchive(fixture.sourcePath, output);
    const manifest =
      fixture.packageType === "directory"
        ? await readFile(path.join(output, "manifest.yaml"), "utf8")
        : await archiveManifest(output);
    const identity = manifestIdentity(manifest);
    if (identity.mcfVersion === "unknown" || identity.packageKind === "unknown")
      throw new Error(
        `Fixture ${fixture.source} has an incomplete manifest identity.`,
      );
    const validation = await validate(output);
    entries.push({
      sourcePath: path.relative(projectRoot, fixture.sourcePath),
      copiedPath: fixture.name,
      packageType: fixture.packageType,
      mcfVersion: identity.mcfVersion,
      packageKind: identity.packageKind,
      archiveSizeBytes:
        fixture.packageType === "directory"
          ? await directorySize(output)
          : (await stat(output)).size,
      validation,
    });
  }
  const index = {
    schema: 1,
    compiler: path.relative(projectRoot, validator),
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
  console.log(
    `Prepared and validated ${index.fixtures.length} fixtures in fixtures/local.`,
  );
}
