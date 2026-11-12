import { unzipSync, zipSync, type Zippable } from 'fflate';
import { assertSupportedGitIndex } from './git-index.js';
import { assertGitPath, assertNoPathCollisions } from './git-paths.js';
import { GIT_WORKBENCH_LIMITS, GitWorkbenchError, type GitFile } from './git-protocol.js';

export interface GitArchive {
  readonly files: readonly GitFile[];
  readonly directories: readonly string[];
}

export function assertGitFileLimits(files: readonly GitFile[]): void {
  if (files.length > GIT_WORKBENCH_LIMITS.files)
    throw new GitWorkbenchError('resource_limit', 'Project file count exceeds limit');
  let total = 0;
  for (const file of files) {
    if (file.bytes.length > GIT_WORKBENCH_LIMITS.fileBytes)
      throw new GitWorkbenchError('resource_limit', `File exceeds limit: ${file.path}`);
    total += file.bytes.length;
  }
  if (total > GIT_WORKBENCH_LIMITS.totalBytes)
    throw new GitWorkbenchError('resource_limit', 'Project byte count exceeds limit');
}

export function encodeGitArchive(archive: GitArchive): Uint8Array<ArrayBuffer> {
  assertGitFileLimits(archive.files);
  const entries: Zippable = Object.create(null) as Zippable;
  for (const path of archive.directories) entries[`${path}/`] = [new Uint8Array(), { os: 3, attrs: 0o40755 << 16 }];
  for (const file of archive.files) entries[file.path] = [file.bytes, { os: 3, attrs: 0o100644 << 16 }];
  return zipSync(entries, { level: 0 });
}

function assertZipMetadata(bytes: Uint8Array<ArrayBuffer>): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let position = bytes.length - 22;
  const minimum = Math.max(0, position - 65_535);
  while (position >= minimum && view.getUint32(position, true) !== 0x06054b50) position -= 1;
  if (position < minimum) throw new GitWorkbenchError('invalid_archive', 'ZIP directory is missing');
  const count = view.getUint16(position + 10, true);
  if (count > GIT_WORKBENCH_LIMITS.files * 2)
    throw new GitWorkbenchError('resource_limit', 'ZIP entry count exceeds limit');
  position = view.getUint32(position + 16, true);
  let total = 0;
  const names = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    if (position + 46 > bytes.length || view.getUint32(position, true) !== 0x02014b50)
      throw new GitWorkbenchError('invalid_archive', 'Invalid ZIP central directory');
    const nameLength = view.getUint16(position + 28, true);
    const end = position + 46 + nameLength;
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(position + 46, end));
    const mode = view.getUint32(position + 38, true) >>> 16;
    const type = mode & 0o170000;
    if ((type && type !== 0o100000 && type !== 0o040000) || (mode & 0o111 && type !== 0o040000))
      throw new GitWorkbenchError('invalid_archive', `Unsupported file semantics: ${name}`);
    assertGitPath(name.endsWith('/') ? name.slice(0, -1) : name, true);
    if (names.has(name)) throw new GitWorkbenchError('invalid_archive', `Duplicate ZIP entry: ${name}`);
    names.add(name);
    const length = view.getUint32(position + 24, true);
    if (length > GIT_WORKBENCH_LIMITS.fileBytes)
      throw new GitWorkbenchError('resource_limit', `ZIP entry exceeds limit: ${name}`);
    total += length;
    position = end + view.getUint16(position + 30, true) + view.getUint16(position + 32, true);
  }
  if (total > GIT_WORKBENCH_LIMITS.totalBytes)
    throw new GitWorkbenchError('resource_limit', 'ZIP expanded bytes exceed limit');
}

function assertRepositoryConfig(files: readonly GitFile[]): void {
  const prohibited = files.find(
    file =>
      /^\.git\/(?:commondir$|gitdir$|config\.worktree$|worktrees\/|modules\/|objects\/info\/(?:http-)?alternates$)/.test(
        file.path
      ) ||
      (file.path.startsWith('.git/hooks/') && !file.path.endsWith('.sample'))
  );
  if (prohibited) throw new GitWorkbenchError('invalid_archive', `Unsupported Git metadata: ${prohibited.path}`);
  const config = files.find(file => file.path === '.git/config');
  if (!config) throw new GitWorkbenchError('invalid_archive', 'Git config is missing');
  const text = new TextDecoder().decode(config.bytes);
  const external = /^\s*\[(?:include|includeIf|extensions)\b|^\s*(?:worktree|hooksPath|gitdir|alternates)\s*=/im.test(
    text
  );
  const bare = text
    .split('\n')
    .some(line => /^\s*bare\s*=/i.test(line) && line.split('=').slice(1).join('=').trim().toLowerCase() !== 'false');
  if (external || bare)
    throw new GitWorkbenchError('invalid_archive', 'External or bare Git configuration is unsupported');
}

export function decodeGitArchive(bytes: Uint8Array<ArrayBuffer>): GitArchive {
  if (bytes.length < 22 || bytes.length > GIT_WORKBENCH_LIMITS.archiveBytes)
    throw new GitWorkbenchError('resource_limit', 'Archive byte count is invalid');
  try {
    assertZipMetadata(bytes);
    const entries = unzipSync(bytes);
    const directories = Object.keys(entries)
      .filter(path => path.endsWith('/'))
      .map(path => path.slice(0, -1));
    const files = Object.entries(entries)
      .filter(([path]) => !path.endsWith('/'))
      .map(([path, data]) => ({ path, bytes: new Uint8Array(data) }));
    const filePaths = new Set(files.map(file => file.path));
    if (directories.some(path => filePaths.has(path)))
      throw new GitWorkbenchError('invalid_archive', 'ZIP path is both a directory and file');
    assertNoPathCollisions(
      [...directories, ...files.map(file => file.path)],
      files.map(file => file.path)
    );
    assertGitFileLimits(files);
    if (!files.some(file => file.path === '.git/HEAD'))
      throw new GitWorkbenchError('invalid_archive', 'Git HEAD is missing');
    assertRepositoryConfig(files);
    const index = files.find(file => file.path === '.git/index');
    if (index) assertSupportedGitIndex(index.bytes);
    return { files, directories };
  } catch (cause) {
    if (cause instanceof GitWorkbenchError) throw cause;
    throw new GitWorkbenchError('invalid_archive', 'Cannot decode project archive', { cause });
  }
}
