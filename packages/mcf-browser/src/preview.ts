import { unzipSync } from "fflate";

export function extractCompiledIndex(artifact: ArrayBuffer): string {
  const files = unzipSync(new Uint8Array(artifact));
  const index = files["index.html"];
  if (!index) throw new Error("Compiled artifact has no index.html.");
  return new TextDecoder("utf-8", { fatal: true }).decode(index);
}
