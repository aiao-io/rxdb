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
