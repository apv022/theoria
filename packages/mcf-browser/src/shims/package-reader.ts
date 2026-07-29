import path from "path-browserify";
import type { Diagnostic } from "mcf-npm/model";
import { virtualStat } from "../vfs";

export interface PackageSource {
  readonly root: string;
  readonly sourceType: "directory" | "archive";
}

export function validPackagePath(value: string): boolean {
  if (
    !value ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    value.includes("//")
  )
    return false;
  return value
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function openPackageSource(
  input: string,
  diagnostics: Diagnostic[],
): Promise<PackageSource | undefined> {
  const absolute = path.resolve(input);
  try {
    if (virtualStat(absolute).isDirectory()) {
      return Promise.resolve({ root: absolute, sourceType: "directory" });
    }
  } catch {
    diagnostics.push({
      code: "MCF_PACKAGE_ENTRY_MISSING",
      severity: "error",
      file: input,
      message: "Package does not exist in the browser virtual filesystem.",
    });
  }
  return Promise.resolve(undefined);
}
