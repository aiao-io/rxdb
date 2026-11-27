import type { DiskPath } from '../disk/disk-path';
import type { DiskStore } from '../disk/disk-store';
import { GIT_WORKBENCH_LIMITS, GitWorkbenchError, type GitFile } from './git/git-protocol';

export async function worktreeFiles(store: DiskStore, root: DiskPath): Promise<GitFile[]> {
  const files: GitFile[] = [];
  let total = 0;
  async function visit(directory: DiskPath): Promise<void> {
    for (const entry of await store.list(directory)) {
      if (entry.name.toLowerCase() === '.git') continue;
      const path = [...directory, entry.name];
      if (entry.kind === 'directory') {
        await visit(path);
        continue;
      }
      const { size } = await store.info(path);
      total += size;
      if (
        size > GIT_WORKBENCH_LIMITS.fileBytes ||
        files.length >= GIT_WORKBENCH_LIMITS.files ||
        total > GIT_WORKBENCH_LIMITS.totalBytes
      )
        throw new GitWorkbenchError('resource_limit', '目录超过 Git 工作区的大小上限');
      files.push({ path: path.slice(root.length).join('/'), bytes: new Uint8Array(await store.read(path)) });
    }
  }
  await visit(root);
  return files;
}

export function worktreeDelta(before: readonly GitFile[], after: readonly GitFile[]) {
  const previous = new Map(before.map(file => [file.path, file.bytes]));
  const changed = after.filter(({ path, bytes }) => {
    const old = previous.get(path);
    previous.delete(path);
    return old?.length !== bytes.length || !bytes.every((byte, i) => byte === old[i]);
  });
  return { changed, removed: [...previous.keys()] };
}

export async function hashBytes(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function projectionHashes(files: readonly GitFile[]): Promise<[string, string][]> {
  return Promise.all(files.map(async ({ path, bytes }) => [path, await hashBytes(bytes)]));
}

export async function publishWorkingFiles(
  store: DiskStore,
  root: DiskPath,
  diff: ReturnType<typeof worktreeDelta>
): Promise<DiskPath[]> {
  for (const path of diff.removed) await store.remove([...root, ...path.split('/')]);
  for (const file of diff.changed) await store.write([...root, ...file.path.split('/')], file.bytes);
  return [...diff.removed, ...diff.changed.map(file => file.path)].map(path => [...root, ...path.split('/')]);
}

/** 恢复被中断的发布。工作区与卷同时修改过的同一路径交由用户处理，先检查整批再写入。 */
export async function recoverWorkingFiles(
  store: DiskStore,
  root: DiskPath,
  base: readonly [string, string][],
  disk: readonly GitFile[],
  git: readonly GitFile[]
) {
  const previous = new Map(base);
  const current = new Map(await projectionHashes(disk));
  const next = new Map(await projectionHashes(git));
  const targets = new Set<string>();
  for (const path of new Set([...previous.keys(), ...next.keys()])) {
    if (next.get(path) === previous.get(path) || next.get(path) === current.get(path)) continue;
    if (current.get(path) !== previous.get(path))
      throw new GitWorkbenchError('revision_conflict', `恢复工作区前请先保留并移走卷内的冲突文件：${path}`);
    targets.add(path);
  }
  const diff = worktreeDelta(
    disk.filter(file => targets.has(file.path)),
    git.filter(file => targets.has(file.path))
  );
  return publishWorkingFiles(store, root, diff);
}
