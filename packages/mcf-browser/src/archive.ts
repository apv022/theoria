import { unzipSync, zipSync } from "fflate";
import type { SerializedFile } from "./types";
import type { VirtualFile } from "./vfs";

export const ARCHIVE_LIMITS = {
  entries: 4096,
  entryBytes: 64 * 1024 * 1024,
  totalBytes: 512 * 1024 * 1024,
  compressionRatio: 200,
} as const;

const forbiddenExtensions = new Set([
  ".app",
  ".bat",
  ".cmd",
  ".com",
  ".dll",
  ".dylib",
  ".exe",
  ".html",
  ".htm",
  ".jar",
  ".js",
  ".mjs",
  ".msi",
  ".ps1",
  ".scr",
  ".sh",
  ".so",
  ".vbs",
  ".wasm",
]);
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export class ArchiveSecurityError extends Error {
  override readonly name = "ArchiveSecurityError";
  constructor(
    readonly code:
      | "MCF_ARCHIVE_INVALID"
      | "MCF_ARCHIVE_LIMIT_EXCEEDED"
      | "MCF_PATH_TRAVERSAL"
      | "MCF_UNSAFE_CONTENT",
    message: string,
  ) {
    super(message);
  }
}

export function isSafePackagePath(value: string): boolean {
  if (
    !value ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    value.includes("//") ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    return false;
  return value
    .split("/")
    .every((part) => part !== "" && part !== "." && part !== "..");
}

const extension = (name: string): string => {
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index).toLowerCase();
};

const assertSafeSvg = (name: string, bytes: Uint8Array): void => {
  let source: string;
  try {
    source = textDecoder.decode(bytes);
  } catch {
    throw new ArchiveSecurityError(
      "MCF_UNSAFE_CONTENT",
      `${name} is not valid UTF-8 SVG.`,
    );
  }
  if (
    /<\s*(?:script|foreignObject|iframe|object|embed)\b/i.test(source) ||
    /\bon[a-z]+\s*=/i.test(source) ||
    /\b(?:href|src)\s*=\s*["']?\s*(?:javascript:|data:text\/html)/i.test(
      source,
    ) ||
    /<!DOCTYPE|<!ENTITY/i.test(source)
  ) {
    throw new ArchiveSecurityError(
      "MCF_UNSAFE_CONTENT",
      `Unsafe active SVG content in ${name}.`,
    );
  }
};

interface CentralEntry {
  readonly name: string;
  readonly compressed: number;
  readonly uncompressed: number;
  readonly mode: number;
  readonly directory: boolean;
}

function centralEntries(bytes: Uint8Array): readonly CentralEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  const minimum = Math.max(0, bytes.byteLength - 65_557);
  for (let cursor = bytes.byteLength - 22; cursor >= minimum; cursor--) {
    if (view.getUint32(cursor, true) === 0x06054b50) {
      end = cursor;
      break;
    }
  }
  if (end < 0)
    throw new ArchiveSecurityError(
      "MCF_ARCHIVE_INVALID",
      "ZIP end record is missing.",
    );
  const count = view.getUint16(end + 10, true);
  const offset = view.getUint32(end + 16, true);
  if (count === 0xffff || offset === 0xffffffff) {
    throw new ArchiveSecurityError(
      "MCF_ARCHIVE_INVALID",
      "ZIP64 archives are not supported.",
    );
  }
  if (count > ARCHIVE_LIMITS.entries) {
    throw new ArchiveSecurityError(
      "MCF_ARCHIVE_LIMIT_EXCEEDED",
      "Archive has too many entries.",
    );
  }
  const entries: CentralEntry[] = [];
  let cursor = offset;
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index++) {
    if (
      cursor + 46 > bytes.byteLength ||
      view.getUint32(cursor, true) !== 0x02014b50
    ) {
      throw new ArchiveSecurityError(
        "MCF_ARCHIVE_INVALID",
        "ZIP central directory is malformed.",
      );
    }
    const flags = view.getUint16(cursor + 8, true);
    if ((flags & 1) !== 0) {
      throw new ArchiveSecurityError(
        "MCF_ARCHIVE_INVALID",
        "Encrypted ZIP entries are unsupported.",
      );
    }
    const compressed = view.getUint32(cursor + 20, true);
    const uncompressed = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const external = view.getUint32(cursor + 38, true);
    const name = decoder.decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    const directory = name.endsWith("/");
    const normalized = directory ? name.slice(0, -1) : name;
    if (!isSafePackagePath(normalized)) {
      throw new ArchiveSecurityError(
        "MCF_PATH_TRAVERSAL",
        `Unsafe archive entry: ${name}`,
      );
    }
    if (!directory && forbiddenExtensions.has(extension(name))) {
      throw new ArchiveSecurityError(
        "MCF_UNSAFE_CONTENT",
        `Executable or active file is forbidden: ${name}`,
      );
    }
    const kind = (external >>> 16) & 0o170000;
    if (kind && kind !== 0o100000 && kind !== 0o040000) {
      throw new ArchiveSecurityError(
        "MCF_ARCHIVE_INVALID",
        `Special archive entry is forbidden: ${name}`,
      );
    }
    entries.push({
      name,
      compressed,
      uncompressed,
      mode: external >>> 16,
      directory,
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function extractSafeArchive(bytes: Uint8Array): readonly VirtualFile[] {
  const entries = centralEntries(bytes);
  const names = new Set<string>();
  let total = 0;
  for (const entry of entries) {
    if (names.has(entry.name)) {
      throw new ArchiveSecurityError(
        "MCF_ARCHIVE_INVALID",
        `Duplicate archive entry: ${entry.name}`,
      );
    }
    names.add(entry.name);
    total += entry.uncompressed;
    const ratio =
      entry.compressed === 0
        ? entry.uncompressed === 0
          ? 1
          : Infinity
        : entry.uncompressed / entry.compressed;
    if (
      entry.uncompressed > ARCHIVE_LIMITS.entryBytes ||
      total > ARCHIVE_LIMITS.totalBytes ||
      ratio > ARCHIVE_LIMITS.compressionRatio
    ) {
      throw new ArchiveSecurityError(
        "MCF_ARCHIVE_LIMIT_EXCEEDED",
        `Archive limit exceeded by ${entry.name}.`,
      );
    }
  }
  let expanded: Record<string, Uint8Array>;
  try {
    expanded = unzipSync(bytes);
  } catch (error) {
    throw new ArchiveSecurityError(
      "MCF_ARCHIVE_INVALID",
      (error as Error).message,
    );
  }
  const files = Object.entries(expanded)
    .filter(([name]) => !name.endsWith("/"))
    .map(([path, data]) => {
      if (path.toLowerCase().endsWith(".svg")) assertSafeSvg(path, data);
      return { path, bytes: data };
    });
  if (!files.some((file) => file.path === "manifest.yaml")) {
    throw new ArchiveSecurityError(
      "MCF_ARCHIVE_INVALID",
      "Archive root has no manifest.yaml.",
    );
  }
  return files;
}

export function normalizeDirectoryFiles(
  input: readonly SerializedFile[],
): readonly VirtualFile[] {
  if (input.length > ARCHIVE_LIMITS.entries) {
    throw new ArchiveSecurityError(
      "MCF_ARCHIVE_LIMIT_EXCEEDED",
      "Directory has too many files.",
    );
  }
  const roots = input.map((file) => file.path.split("/")[0]).filter(Boolean);
  const pickerRoot = new Set(roots).size === 1 ? roots[0] : undefined;
  // A directory picker adds its selected directory name to every relative
  // path. Only strip that component when it contains the package manifest;
  // otherwise a legitimate single path such as assets/diagram.png would be
  // changed to diagram.png during validation.
  const stripRoot = Boolean(
    pickerRoot &&
      !input.some((file) => file.path === "manifest.yaml") &&
      input.some((file) => file.path === `${pickerRoot}/manifest.yaml`),
  );
  let total = 0;
  const names = new Set<string>();
  return input.map((file) => {
    const path = stripRoot
      ? file.path.slice(file.path.indexOf("/") + 1)
      : file.path;
    if (!isSafePackagePath(path)) {
      throw new ArchiveSecurityError(
        "MCF_PATH_TRAVERSAL",
        `Unsafe directory entry: ${file.path}`,
      );
    }
    if (names.has(path))
      throw new ArchiveSecurityError(
        "MCF_ARCHIVE_INVALID",
        `Duplicate file: ${path}`,
      );
    names.add(path);
    if (forbiddenExtensions.has(extension(path))) {
      throw new ArchiveSecurityError(
        "MCF_UNSAFE_CONTENT",
        `Executable or active file is forbidden: ${path}`,
      );
    }
    const bytes = new Uint8Array(file.bytes);
    total += bytes.byteLength;
    if (
      bytes.byteLength > ARCHIVE_LIMITS.entryBytes ||
      total > ARCHIVE_LIMITS.totalBytes
    ) {
      throw new ArchiveSecurityError(
        "MCF_ARCHIVE_LIMIT_EXCEEDED",
        `Directory limit exceeded by ${path}.`,
      );
    }
    if (path.toLowerCase().endsWith(".svg")) assertSafeSvg(path, bytes);
    return { path, bytes };
  });
}

export function createDeterministicArchive(
  files: readonly VirtualFile[],
): Uint8Array {
  const input: Record<string, [Uint8Array, { mtime: Date }]> = {};
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    input[file.path] = [
      file.bytes,
      { mtime: new Date("1980-01-02T00:00:00.000Z") },
    ];
  }
  return zipSync(input, { level: 6 });
}
