import type { DiskPath } from '../disk/disk-path';
import { samePath, toVmPath } from '../disk/disk-path';
import type { DiskStore } from '../disk/disk-store';
import { archiveOfDirectory, diskDirectory } from './git/git-directory';
import { GIT_WORKBENCH_ROOT, assertProjectId } from './git/git-paths';
import { GitWorkbenchError, type GitSnapshot } from './git/git-protocol';
import type { GithubGitBackend } from './github-git-backend';
import { worktreeFiles } from './github-worktree';

export const gitfile = (id: string) => `gitdir: /opfs/${GIT_WORKBENCH_ROOT}/${id}/repository/.git\n`;

export async function projectFolder(id: string, create = false) {
  assertProjectId(id);
  let directory = await navigator.storage.getDirectory();
  for (const name of [...GIT_WORKBENCH_ROOT.split('/'), id])
    directory = await directory.getDirectoryHandle(name, { create });
  return directory;
}

async function fileIfPresent(dir: FileSystemDirectoryHandle, name: string) {
  try {
    return await dir.getFileHandle(name);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null;
    throw error;
  }
}

type Binding = { root: DiskPath; source: string; temporary: string };
const JOURNAL = 'volume-binding.json';

async function readBinding(directory: FileSystemDirectoryHandle): Promise<Binding | null> {
  const handle = await fileIfPresent(directory, JOURNAL);
  if (!handle) return null;
  const value: unknown = JSON.parse(await (await handle.getFile()).text());
  if (
    !value ||
    typeof value !== 'object' ||
    !('root' in value) ||
    !Array.isArray(value.root) ||
    !value.root.every(part => typeof part === 'string') ||
    !('temporary' in value) ||
    typeof value.temporary !== 'string' ||
    !/^\.aiao-bind-[a-f\d-]{36}$/.test(value.temporary) ||
    !('source' in value) ||
    typeof value.source !== 'string'
  )
    throw new Error('仓库目录绑定日志损坏');
  return { root: value.root, temporary: value.temporary, source: value.source };
}

async function writeBinding(directory: FileSystemDirectoryHandle, value: Binding) {
  const handle = await directory.getFileHandle(JOURNAL, { create: true });
  const writer = await handle.createWritable();
  await writer.write(JSON.stringify(value));
  await writer.close();
}

interface NewDirectory {
  readonly source: string;
  create(): Promise<GitSnapshot>;
}

/** 仅发布完整目录。中断后凭持久化的目标路径、来源和临时目录名继续同一操作。 */
export async function bindVolumeRepository<T>(
  store: DiskStore,
  root: DiskPath,
  id: string,
  git: Pick<GithubGitBackend, 'open' | 'create' | 'importArchive'>,
  options: { initialize?: boolean; copy?: NewDirectory },
  register: (snapshot: GitSnapshot) => Promise<T>
) {
  const marker = [...root, '.git'];
  const metadata = await store.kindOf(marker);
  const linked = metadata === 'file' && new TextDecoder().decode(await store.read(marker)) === gitfile(id);
  if (metadata === 'file' && !linked) throw new Error('此目录的 .git 文件指向外部工作树，请选择完整仓库');
  const dir = await projectFolder(id, true);
  const pending = await readBinding(dir);
  const copy = options.copy;
  const source = copy?.source ?? pending?.source ?? 'volume';
  if (pending && (!samePath(root, pending.root) || pending.source !== source))
    throw new Error('该目录有未完成的导入，请先用原仓库完成导入');
  const exists = await store.kindOf(root);
  if (copy && exists && !(pending && linked)) throw new Error(`目标目录已存在：${toVmPath(root)}`);
  if (exists === 'file') throw new Error('请选择目录');
  if (!copy && !metadata && !pending && !options.initialize)
    throw new GitWorkbenchError('project_missing', '目录尚未初始化。请先在终端运行 git init');
  const state = await fileIfPresent(dir, 'state.json');
  if (state && !pending && !linked) throw new Error('此仓库标识已被使用，请选择其他目录');
  const binding = pending ?? { root, source, temporary: `.aiao-bind-${crypto.randomUUID()}` };
  if (!pending) await writeBinding(dir, binding);
  const temporary = [...root.slice(0, -1), binding.temporary];
  const create = async () => {
    if (copy) return copy.create();
    if (source !== 'volume') throw new Error('请重新选择原仓库完成导入');
    if (metadata === 'directory')
      return git.importArchive(id, (await archiveOfDirectory(diskDirectory(store, root))).archive);
    return git.create(id, exists ? await worktreeFiles(store, root) : []);
  };
  let snapshot: GitSnapshot;
  try {
    if (pending && !state)
      await dir.removeEntry('repository', { recursive: true }).catch(error => {
        if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
      });
    snapshot = state ? await git.open(id) : await create();
  } catch (error) {
    if (!state && !(await fileIfPresent(dir, 'state.json'))) await dir.removeEntry(JOURNAL);
    throw error;
  }
  if (!linked && source !== 'volume') {
    if (exists) throw new Error(`目标目录已存在：${toVmPath(root)}`);
    await store.mkdir(temporary);
    for (const file of snapshot.files) await store.write([...temporary, ...file.path.split('/')], file.bytes);
    await store.write([...temporary, '.git'], new TextEncoder().encode(gitfile(id)));
    await store.move(temporary, root);
  } else if (!linked) {
    if (metadata === 'directory') await store.move(marker, temporary);
    await store.write(marker, new TextEncoder().encode(gitfile(id)));
  }
  if (source === 'volume') await store.remove(temporary);
  const result = await register(snapshot);
  await dir.removeEntry(JOURNAL);
  return result;
}
