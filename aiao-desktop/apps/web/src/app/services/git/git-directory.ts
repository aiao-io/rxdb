import type { DiskPath } from '../../disk/disk-path';
import type { DiskStore } from '../../disk/disk-store';
import { encodeGitArchive } from './git-archive';
import { assertGitPath } from './git-paths';
import { GIT_WORKBENCH_LIMITS, GitWorkbenchError, type GitFile } from './git-protocol';

interface SourceFile {
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface SourceDirectory {
  readonly kind: 'directory';
  readonly name: string;
  values(): AsyncIterable<
    SourceDirectory | { readonly kind: 'file'; readonly name: string; getFile(): Promise<SourceFile> }
  >;
}

class DirectoryArchive {
  private readonly files: GitFile[] = [];
  private readonly directories = new Set<string>();
  private total = 0;

  directory(path: string) {
    assertGitPath(path, true);
    this.directories.add(path);
    if (this.directories.size > GIT_WORKBENCH_LIMITS.files) throw new Error('仓库目录数量超限');
  }

  async file(path: string, file: SourceFile) {
    assertGitPath(path, true);
    this.total += file.size;
    if (
      file.size > GIT_WORKBENCH_LIMITS.fileBytes ||
      this.files.length >= GIT_WORKBENCH_LIMITS.files ||
      this.total > GIT_WORKBENCH_LIMITS.totalBytes
    )
      throw new GitWorkbenchError('resource_limit', `仓库文件超过导入上限：${path}`);
    this.files.push({ path, bytes: new Uint8Array(await file.arrayBuffer()) });
  }

  finish(name: string) {
    if (!this.files.some(file => file.path === '.git/HEAD'))
      throw new Error('目录尚未初始化或未包含 .git/HEAD。请选择完整的 Git 仓库');
    return { name, archive: encodeGitArchive({ files: this.files, directories: [...this.directories] }) };
  }
}

export async function archiveOfDirectory(directory: SourceDirectory) {
  const archive = new DirectoryArchive();
  async function visit(current: SourceDirectory, prefix: string): Promise<void> {
    for await (const entry of current.values()) {
      const path = prefix + entry.name;
      if (entry.kind === 'file') await archive.file(path, await entry.getFile());
      else {
        archive.directory(path);
        await visit(entry, path + '/');
      }
    }
  }
  await visit(directory, '');
  return archive.finish(directory.name);
}

export async function archiveOfUploadedDirectory(files: readonly File[]) {
  const archive = new DirectoryArchive();
  const root = files[0]?.webkitRelativePath.split('/')[0];
  if (!root) throw new Error('请选择一个 Git 仓库文件夹');
  for (const file of files) {
    const [name, ...parts] = file.webkitRelativePath.split('/');
    if (name !== root || !parts.length) throw new Error('请选择一个 Git 仓库文件夹');
    for (let count = 1; count < parts.length; count++) archive.directory(parts.slice(0, count).join('/'));
    await archive.file(parts.join('/'), file);
  }
  return archive.finish(root);
}

export function diskDirectory(store: DiskStore, path: DiskPath): SourceDirectory {
  return {
    kind: 'directory',
    name: path.at(-1)!,
    async *values() {
      for (const entry of await store.list(path)) {
        const child = [...path, entry.name];
        if (entry.kind === 'directory') yield diskDirectory(store, child);
        else
          yield {
            kind: 'file',
            name: entry.name,
            getFile: async () => ({
              size: (await store.info(child)).size,
              arrayBuffer: async () => new Uint8Array(await store.read(child)).buffer
            })
          };
      }
    }
  };
}
