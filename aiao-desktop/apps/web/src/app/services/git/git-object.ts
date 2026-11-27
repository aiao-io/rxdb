import { GitWorkbenchError } from './git-protocol.js';

/** MEMFS 的最小文件系统接口：读 loose object 只需要 readFile 与目录探测。 */
export interface GitObjectFilesystem {
  readFile(path: string): Uint8Array<ArrayBuffer>;
  readdir(path: string): string[];
  analyzePath(path: string): { readonly exists: boolean };
}

/** 读出的对象：kind 为 `commit` / `tree` / `blob`，bytes 是剥离头部后的内容（commit 为文本、tree 为二进制条目、blob 为原始内容）。 */
export interface GitObject {
  readonly kind: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

const hex = (bytes: Uint8Array<ArrayBuffer>): string =>
  [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');

/**
 * 只读读取一个 loose git 对象（`.git/objects/<2>/<38>`，zlib 压缩的 `kind size\0content`）。
 * 不经过 stdout、不触碰工作区；对象不存在时抛 {@link GitWorkbenchError}（调用方决定是否回退到 cat-file）。
 */
export async function readLooseObject(fs: GitObjectFilesystem, root: string, oid: string): Promise<GitObject> {
  const path = `${root}/.git/objects/${oid.slice(0, 2)}/${oid.slice(2)}`;
  let compressed: Uint8Array<ArrayBuffer>;
  try {
    compressed = new Uint8Array(fs.readFile(path));
  } catch {
    throw new GitWorkbenchError('git_failed', `Loose object ${oid} is not available`);
  }
  const inflated = new Uint8Array(
    await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer()
  );
  const headerEnd = inflated.indexOf(0);
  if (headerEnd < 0) throw new GitWorkbenchError('git_failed', `Loose object ${oid} is malformed`);
  const header = new TextDecoder().decode(inflated.subarray(0, headerEnd));
  const kind = header.split(' ')[0];
  if (kind !== 'commit' && kind !== 'tree' && kind !== 'blob')
    throw new GitWorkbenchError('git_failed', `Unsupported loose object kind: ${kind}`);
  return { kind, bytes: inflated.slice(headerEnd + 1) };
}

/** 树对象里的一个条目：mode 为八进制字符串（`40000` 是子树），oid 是 20 字节 sha 的十六进制。 */
export interface GitTreeEntry {
  readonly mode: string;
  readonly kind: 'tree' | 'blob';
  readonly oid: string;
  readonly name: string;
}

/** 解析树对象的二进制条目：`<mode> <name>\0<20 字节 sha>` 依次排列（git 的排序即目录序遍历序）。 */
export function parseGitTree(bytes: Uint8Array<ArrayBuffer>): readonly GitTreeEntry[] {
  const entries: GitTreeEntry[] = [];
  let position = 0;
  while (position < bytes.length) {
    const space = bytes.indexOf(0x20, position);
    if (space < 0) throw new GitWorkbenchError('git_failed', 'Git tree entry is malformed');
    const mode = new TextDecoder().decode(bytes.subarray(position, space));
    position = space + 1;
    const terminator = bytes.indexOf(0, position);
    if (terminator < 0 || terminator + 21 > bytes.length)
      throw new GitWorkbenchError('git_failed', 'Git tree entry is truncated');
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(position, terminator));
    const oid = hex(bytes.slice(terminator + 1, terminator + 21));
    entries.push({
      mode,
      kind: mode === '40000' || mode === '040000' ? 'tree' : 'blob',
      oid,
      name
    });
    position = terminator + 21;
  }
  return entries;
}
