import { sha256 } from "@noble/hashes/sha2.js";

const encoder = new TextEncoder();

const encodeBase64 = (value: Uint8Array): string => {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const encodeHex = (value: Uint8Array): string =>
  [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");

function createHash(algorithm: string) {
  if (algorithm.toLowerCase() !== "sha256")
    throw new Error(`Unsupported hash: ${algorithm}`);
  const chunks: Uint8Array[] = [];
  return {
    update(value: Uint8Array | string) {
      chunks.push(typeof value === "string" ? encoder.encode(value) : value);
      return this;
    },
    digest(encoding: "base64" | "hex" = "hex") {
      const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
      const input = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        input.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const digest = sha256(input);
      return encoding === "base64" ? encodeBase64(digest) : encodeHex(digest);
    },
  };
}

export { createHash };
export default { createHash };
