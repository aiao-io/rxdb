import { assertGitPath } from './git-paths.js';
import { GitWorkbenchError } from './git-protocol.js';

/** 校验导入 index 的能力边界；不重写或重新生成 Git index。 */
export function assertSupportedGitIndex(bytes: Uint8Array<ArrayBuffer>): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 32 || view.getUint32(0) !== 0x44495243)
    throw new GitWorkbenchError('invalid_archive', 'Git index header is invalid');
  const version = view.getUint32(4);
  if (version !== 2 && version !== 3)
    throw new GitWorkbenchError('invalid_archive', `Unsupported Git index version: ${version}`);
  const count = view.getUint32(8);
  let position = 12;
  for (let index = 0; index < count; index += 1) {
    const start = position;
    if (position + 62 > bytes.length - 20)
      throw new GitWorkbenchError('invalid_archive', 'Git index entry is truncated');
    const mode = view.getUint32(position + 24);
    const flags = view.getUint16(position + 60);
    if (mode !== 0o100644 || flags & 0x3000)
      throw new GitWorkbenchError(
        'invalid_archive',
        'Symlink, executable, submodule and conflicted index entries are unsupported'
      );
    position += flags & 0x4000 ? 64 : 62;
    const nameStart = position;
    while (position < bytes.length - 20 && bytes[position] !== 0) position += 1;
    if (position === bytes.length - 20)
      throw new GitWorkbenchError('invalid_archive', 'Git index filename is truncated');
    assertGitPath(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(nameStart, position)));
    position = start + Math.ceil((position - start + 1) / 8) * 8;
  }
  while (position + 8 <= bytes.length - 20) {
    const signature = new TextDecoder().decode(bytes.subarray(position, position + 4));
    if (signature === 'link' || signature === 'sdir')
      throw new GitWorkbenchError('invalid_archive', 'Split and sparse Git indexes are unsupported');
    position += 8 + view.getUint32(position + 4);
  }
  if (position !== bytes.length - 20)
    throw new GitWorkbenchError('invalid_archive', 'Git index extension is truncated');
}

/** 索引里一个条目的路径与内容对象 id（工作台只支持普通文件条目，见 {@link assertSupportedGitIndex}）。 */
export interface GitIndexEntry {
  readonly path: string;
  readonly oid: string;
}

/**
 * 只读解析 Git index：先按 {@link assertSupportedGitIndex} 校验边界，再逐条取出路径与 sha1。
 * 用于读取暂存内容（替代 checkout 快照），不重写或修改 index。
 */
export function parseGitIndex(bytes: Uint8Array<ArrayBuffer>): readonly GitIndexEntry[] {
  assertSupportedGitIndex(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(8);
  const entries: GitIndexEntry[] = [];
  let position = 12;
  const hex = (start: number): string =>
    [...bytes.subarray(start, start + 20)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  for (let index = 0; index < count; index += 1) {
    const start = position;
    position += view.getUint16(position + 60) & 0x4000 ? 64 : 62;
    const nameStart = position;
    while (bytes[position] !== 0) position += 1;
    entries.push({
      path: new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(nameStart, position)),
      oid: hex(start + 40)
    });
    position = start + Math.ceil((position - start + 1) / 8) * 8;
  }
  return entries;
}
