import { decodeBase64, encodeBase64, type DesktopWorkspaceRequest } from '@aiao/orbit/desktop';
import { Service, inject } from '@angular/core';
import { HOME, isWithin, type DiskPath } from '../disk/disk-path';
import { DiskError, type DiskStore } from '../disk/disk-store';
import { validateName } from '../disk/file-operations';
import { FileSystem } from './file-system';
import { assertGitFileLimits } from './git/git-archive';
import { assertGitPath, assertNoPathCollisions } from './git/git-paths';
import type { GitFile } from './git/git-protocol';
import { hashBytes, projectionHashes, publishWorkingFiles, worktreeDelta, worktreeFiles } from './github-worktree';

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const metadata = (name: string) => name.toLowerCase() === '.git';

/** 直属卷内目录与 Git 仓库使用不同的项目标识，不登记或初始化 Git。 */
export async function folderProjectId(root: DiskPath): Promise<string> {
  if (!isWithin(root, HOME) || root.some(metadata)) throw new Error('请选择 Macintosh HD 主目录内的文件夹');
  root.forEach(validateName);
  return `folder-${(await hashBytes(encode(root))).slice(0, 48)}`;
}

async function revisionOf(files: readonly GitFile[]): Promise<number> {
  const hashes = (await projectionHashes(files)).sort(([a], [b]) => a.localeCompare(b, 'en'));
  return 1 + Number.parseInt((await hashBytes(encode(hashes))).slice(0, 13), 16);
}

async function snapshot(projectId: string, files: readonly GitFile[]) {
  return {
    projectId,
    revision: await revisionOf(files),
    files: files.map(({ path, bytes }) => ({ path, bytes: encodeBase64(bytes) }))
  };
}

async function pathHasGitMetadata(store: DiskStore, path: DiskPath): Promise<boolean> {
  const pending = [path];
  while (pending.length) {
    const current = pending.pop()!;
    for (const entry of await store.list(current)) {
      if (metadata(entry.name)) return true;
      if (entry.kind === 'directory') pending.push([...current, entry.name]);
    }
  }
  return false;
}

async function moveEntry(store: DiskStore, root: DiskPath, path: string, destination: string, fileOnly: boolean) {
  assertGitPath(path);
  assertGitPath(destination);
  const from = [...root, ...path.split('/')];
  const to = [...root, ...destination.split('/')];
  const kind = await store.kindOf(from);
  if (!kind) throw new DiskError('ENOENT', from);
  if (fileOnly && kind !== 'file') throw new DiskError('EISDIR', from);
  if (kind === 'directory' && (await pathHasGitMetadata(store, from)))
    throw new Error('不能从编辑器移动包含 .git 的目录');
  await store.move(from, to);
  return [from, to];
}

async function saveFiles(
  store: DiskStore,
  root: DiskPath,
  request: Extract<DesktopWorkspaceRequest, { operation: 'save' }>
) {
  const current = await worktreeFiles(store, root);
  const revision = await revisionOf(current);
  if (request.expectedRevision !== revision)
    throw new Error(`Expected revision ${request.expectedRevision}, current revision is ${revision}`);
  const next = new Map(current.map(file => [file.path, file]));
  const removed = new Set(request.removedPaths);
  for (const path of removed) {
    assertGitPath(path);
    if (!next.delete(path)) throw new DiskError('ENOENT', [...root, ...path.split('/')]);
  }
  for (const { path, base64 } of request.files) {
    assertGitPath(path);
    if (removed.has(path)) throw new Error(`Cannot write and remove the same file: ${path}`);
    next.set(path, { path, bytes: decodeBase64(base64) });
  }
  const files = [...next.values()];
  assertNoPathCollisions([...next.keys()]);
  assertGitFileLimits(files);
  const diff = worktreeDelta(current, files);
  for (const { path } of diff.changed) {
    const fullPath = [...root, ...path.split('/')];
    if ((await store.kindOf(fullPath)) === 'directory') throw new DiskError('EISDIR', fullPath);
  }
  const paths = await publishWorkingFiles(store, root, diff);
  return { paths, value: await snapshot(request.projectId, files) };
}

/** 在桌面磁盘锁内读取并保存指定目录，不向编辑器暴露卷路径或句柄。 */
@Service({ autoProvided: false })
export class DesktopFolderWorkspace {
  private readonly files = inject(FileSystem);

  async call(root: DiskPath, request: DesktopWorkspaceRequest) {
    if ((await folderProjectId(root)) !== request.projectId) throw new Error('工作区与窗口绑定的目录不一致');
    const result = await this.files.run(async store => {
      if ((await store.kindOf(root)) !== 'directory') throw new Error('桌面目录已移动或删除，请从终端重新打开');
      return this.operate(store, root, request);
    });
    if (result.paths?.length) this.files.notifyChanges(result.paths);
    return result.value;
  }

  private async operate(store: DiskStore, root: DiskPath, request: DesktopWorkspaceRequest) {
    switch (request.operation) {
      case 'open':
        return { value: await snapshot(request.projectId, await worktreeFiles(store, root)) };
      case 'save':
        return saveFiles(store, root, request);
      case 'remove': {
        assertGitPath(request.path);
        const path = [...root, ...request.path.split('/')];
        const kind = await store.kindOf(path);
        if (kind !== 'file') throw new DiskError(kind ? 'EISDIR' : 'ENOENT', path);
        await store.remove(path);
        return { paths: [path], value: null };
      }
      case 'rename':
      case 'move':
        return {
          paths: await moveEntry(store, root, request.path, request.destination, request.operation === 'rename'),
          value: null
        };
      default:
        throw new Error('此窗口直接编辑目录；请在终端中执行 git 操作');
    }
  }
}
