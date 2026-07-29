export interface VirtualFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

const files = new Map<string, Uint8Array>();
const decoder = new TextDecoder("utf-8", { fatal: true });

const normalize = (value: string): string => {
  const normalized = value.replaceAll("\\", "/").replace(/\/+/g, "/");
  const rooted = normalized.startsWith("/") ? normalized : `/${normalized}`;
  const parts: string[] = [];
  for (const part of rooted.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return `/${parts.join("/")}`;
};

export function mountVirtualFiles(
  input: readonly VirtualFile[],
  root = "/package",
): void {
  files.clear();
  for (const file of input)
    files.set(normalize(`${root}/${file.path}`), file.bytes);
}

export function clearVirtualFiles(): void {
  files.clear();
}

export function virtualFileEntries(): readonly VirtualFile[] {
  return [...files.entries()].map(([path, bytes]) => ({
    path: path.replace(/^\/package\//, ""),
    bytes,
  }));
}

export function readVirtualFile(path: string): Uint8Array {
  const value = files.get(normalize(path));
  if (!value)
    throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
  return value;
}

export function readVirtualText(path: string): string {
  return decoder.decode(readVirtualFile(path));
}

export function virtualStat(path: string): {
  isFile(): boolean;
  isDirectory(): boolean;
} {
  const normalized = normalize(path);
  const file = files.has(normalized);
  const prefix = normalized === "/" ? "/" : `${normalized}/`;
  const directory =
    normalized === "/package" ||
    [...files.keys()].some((key) => key.startsWith(prefix));
  if (!file && !directory)
    throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
  return { isFile: () => file, isDirectory: () => !file && directory };
}

export function realVirtualPath(path: string): string {
  virtualStat(path);
  return normalize(path);
}
