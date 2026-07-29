import {
  readVirtualFile,
  readVirtualText,
  realVirtualPath,
  virtualStat,
} from "../vfs";

const readFile = (
  path: string,
  encoding?: string,
): Promise<Uint8Array | string> =>
  Promise.resolve(encoding ? readVirtualText(path) : readVirtualFile(path));

const stat = (path: string) => Promise.resolve(virtualStat(path));
const realpath = (path: string) => Promise.resolve(realVirtualPath(path));

export { readFile, realpath, stat };
export default { readFile, realpath, stat };
