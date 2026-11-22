import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME, type DiskPath } from '../disk/disk-path';
import { MemoryDiskStore } from '../disk/memory-disk-store';
import { configureServices } from '../testing/angular';
import { DesktopAppServices } from './desktop-app-services';
import { FileSystem } from './file-system';
import { GithubConnection } from './github-connection';
import type { GithubGitBackend } from './github-git-backend';
import { projectIdForPath, type GithubRepositoryRecord } from './github-repository';
import { gitfile } from './github-volume-binding';
import { GithubWorkspace } from './github-workspace';

const githubFile = (path: string, value: string) => ({ path, bytes: new TextEncoder().encode(value) });
type WorkspaceGitFixture = Record<keyof GithubGitBackend, ReturnType<typeof vi.fn>>;

const git = vi.hoisted(
  () =>
    new Proxy({} as WorkspaceGitFixture, {
      get(target, key: keyof WorkspaceGitFixture) {
        return (target[key] ??= vi.fn());
      }
    })
);
vi.mock('./github-git-backend', () => ({
  GithubGitBackend: class {
    constructor() {
      return git;
    }
  }
}));
const journal = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), clear: vi.fn() }));
vi.mock('./github-volume-journal', () => ({ volumeJournal: async () => journal }));
const root = [...HOME, 'Desktop', 'repo'];
const id = projectIdForPath(root);
const original = githubFile('a', 'original');
const snapshot = { projectId: id, revision: 1, files: [original] };
const initial: GithubRepositoryRecord = {
  projectId: id,
  name: 'repo',
  rootPath: root,
  branch: 'main',
  owner: null,
  repo: null,
  remoteTree: null,
  remoteHead: null,
  remoteEntries: [],
  updatedAt: 1,
  private: false
};

describe('桌面共享 Git 仓库', () => {
  const disk = new MemoryDiskStore();
  const changes = new Subject<unknown>();
  const remote = { open: vi.fn(), pull: vi.fn(), push: vi.fn() };
  const rows = new Map<string, GithubRepositoryRecord>();
  const store = {
    ready: async () => undefined,
    records: () => [...rows.values()],
    find: (key: string) => rows.get(key),
    put: vi.fn(async (row: GithubRepositoryRecord) => {
      rows.set(row.projectId, row);
    })
  };
  let workspace: GithubWorkspace;
  beforeEach(async () => {
    vi.resetAllMocks();
    rows.clear();
    rows.set(id, initial);
    await disk.remove(root);
    await disk.write([...root, 'a'], original.bytes);
    await disk.write([...root, '.git'], new TextEncoder().encode(gitfile(id)));
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, task: () => unknown) => task() } });
    configureServices([
      GithubWorkspace,
      {
        provide: DesktopAppServices,
        useValue: { get: (type: unknown) => (type === GithubConnection ? { remote } : store) }
      },
      {
        provide: FileSystem,
        useValue: {
          notifyChanges: (paths: readonly DiskPath[]) => changes.next(paths),
          run: (task: (store: MemoryDiskStore) => unknown) => task(disk)
        }
      }
    ]);
    workspace = TestBed.inject(GithubWorkspace);
    git.snapshot.mockResolvedValue(snapshot);
    git.open.mockResolvedValue(snapshot);
    git.status.mockResolvedValue({ head: 'abc', branch: 'main', raw: '', entries: [] });
    journal.read.mockResolvedValue(null);
  });

  it('按最深目录查找仓库，打开已有目录不创建仓库，同名导入会先拒绝', async () => {
    const nested = { ...initial, projectId: 'nested', rootPath: [...root, 'nested'] };
    rows.set('nested', nested);
    expect(await workspace.repositoryAt([...nested.rootPath, 'src'])).toBe(nested);
    expect(await workspace.openDirectory(root)).toBe(initial);
    await expect(workspace.openDirectory(HOME, true)).rejects.toThrow('请选择');
    await expect(workspace.createDirectory(root, [])).rejects.toThrow('已存在');
    await expect(workspace.importDirectory('..', new Uint8Array())).rejects.toThrow('请选择');
    rows.set(id, { ...initial, rootPath: ['other'] });
    await expect(workspace.openDirectory(root)).rejects.toThrow('其他目录');
  });

  it('编辑器调用绑定的仓库并编码文件字节，打开、索引与写入使用同一工作树', async () => {
    const request = { projectId: id } as const;
    expect(await workspace.call({ ...request, operation: 'open' })).toMatchObject({
      files: [{ bytes: 'b3JpZ2luYWw=' }]
    });
    const edited = githubFile('a', 'edited');
    git.save.mockImplementation(async () => {
      git.snapshot.mockResolvedValue({ ...snapshot, revision: 2, files: [edited] });
      return { ...snapshot, revision: 2, files: [edited] };
    });
    await workspace.call({
      ...request,
      operation: 'save',
      expectedRevision: 1,
      files: [{ path: 'a', base64: 'ZWRpdGVk' }]
    });
    expect(await disk.read([...root, 'a'])).toEqual(edited.bytes);
    git.stage.mockResolvedValue({});
    git.unstage.mockResolvedValue({});
    git.readDiff.mockResolvedValue({});
    git.commit.mockResolvedValue('abc');
    git.history.mockResolvedValue([]);
    git.remove.mockResolvedValue(snapshot);
    git.rename.mockResolvedValue(snapshot);
    git.move.mockResolvedValue(snapshot);
    git.discardWorking.mockResolvedValue(snapshot);
    git.restore.mockResolvedValue(snapshot);
    for (const operation of ['stage', 'unstage'] as const)
      await workspace.call({ ...request, operation, paths: ['a'] });
    for (const operation of ['remove', 'discardWorking'] as const)
      await workspace.call({ ...request, operation, path: 'a' });
    for (const operation of ['rename', 'move'] as const)
      await workspace.call({ ...request, operation, path: 'a', destination: 'b' });
    for (const operation of ['status', 'history'] as const) await workspace.call({ ...request, operation });
    await workspace.call({ ...request, operation: 'restore', oid: 'abc' });
    await workspace.call({ ...request, operation: 'readDiff', path: 'a', kind: 'working' });
    expect(await workspace.call({ ...request, operation: 'commit', message: 'message' })).toBe('abc');
    expect(git.stage).toHaveBeenCalledWith(id, ['a']);
    expect(git.save).toHaveBeenCalledWith(id, [edited], 1, []);
    await expect(workspace.call({ projectId: 'missing', operation: 'status' })).rejects.toThrow('未登记');
    await disk.write([...root, '.git'], original.bytes);
    await expect(workspace.open(id)).rejects.toThrow('另一个仓库');
  });

  it('离线添加、移除、回滚 origin，fetch 单独记观察值，pull 后才推进基线', async () => {
    await expect(workspace.fetch(id)).rejects.toThrow('remote');
    await expect(workspace.pull(id)).rejects.toThrow('remote');
    await expect(workspace.configureRemote(id, 'https://example.invalid/a/b')).rejects.toThrow('GitHub');
    await expect(workspace.configureRemote(id, null)).rejects.toThrow('No such');
    git.origin.mockResolvedValue(null);
    const configured = await workspace.configureRemote(id, 'octo/repo');
    git.origin.mockResolvedValue('https://github.com/octo/repo.git');
    await expect(workspace.configureRemote(id, 'octo/repo')).rejects.toThrow('exists');
    store.put.mockRejectedValueOnce(new Error('quota'));
    await expect(workspace.configureRemote(id, null)).rejects.toThrow('quota');
    expect(git.setOrigin).toHaveBeenLastCalledWith(id, 'https://github.com/octo/repo.git');
    remote.open.mockResolvedValue({
      record: { ...configured, remoteHead: 'r1', remoteTree: 'tree' },
      files: [githubFile('b', 'remote')]
    });
    await workspace.fetch(id);
    expect(rows.get(id)).toMatchObject({ fetched: { branch: 'main', head: 'r1' }, remoteHead: null });
    remote.pull.mockResolvedValue(await remote.open());
    git.save.mockResolvedValue(snapshot);
    await workspace.call({ projectId: id, operation: 'pull' });
    expect(remote.pull).toHaveBeenCalledWith(
      expect.objectContaining({ remoteHead: null }),
      [original],
      true,
      expect.anything()
    );
    expect(rows.get(id)?.remoteHead).toBe('r1');
    await workspace.pull(id);
    expect(remote.pull).toHaveBeenCalledTimes(1);
    git.committed.mockResolvedValue(snapshot);
    remote.push.mockResolvedValue({ head: 'r2', tree: 't2' });
    await workspace.push(id, 'publish');
    expect(rows.get(id)?.remoteHead).toBe('r2');
    git.status.mockResolvedValue({ ...snapshot, branch: 'other' });
    await workspace.push(id, 'publish branch');
    expect(remote.push).toHaveBeenLastCalledWith(
      expect.objectContaining({ branch: 'other', remoteHead: null }),
      snapshot.files,
      'publish branch',
      'r2'
    );
    await workspace.configureRemote(id, null);
    expect(rows.get(id)?.owner).toBeNull();
  });

  it('切回已同步的分支复用它自己的远端基线，更换 origin 后清除所有旧基线', async () => {
    rows.set(id, { ...initial, owner: 'octo', repo: 'one', remoteHead: 'main-head', remoteTree: 'main-tree' });
    git.committed.mockResolvedValue(snapshot);
    git.status.mockResolvedValue({ branch: 'topic' });
    remote.push.mockResolvedValueOnce({ head: 'topic-head', tree: 'topic-tree' });
    await workspace.push(id, 'topic');
    git.status.mockResolvedValue({ branch: 'main' });
    remote.push.mockResolvedValueOnce({ head: 'main-2', tree: 'main-tree-2' });
    await workspace.push(id, 'back on main');
    expect(remote.push.mock.calls[1][0]).toMatchObject({
      branch: 'main',
      remoteHead: 'main-head',
      remoteTree: 'main-tree'
    });

    git.status.mockResolvedValue({ branch: 'topic' });
    remote.open.mockResolvedValue({
      record: { ...rows.get(id), branch: 'topic', remoteHead: 'topic-head', remoteTree: 'topic-tree' },
      files: snapshot.files
    });
    await workspace.pull(id);
    expect(remote.pull).not.toHaveBeenCalled();
    expect(rows.get(id)).toMatchObject({ branch: 'topic', remoteHead: 'topic-head' });

    await workspace.configureRemote(id, null);
    await workspace.configureRemote(id, 'octo/two');
    git.status.mockResolvedValue({ branch: 'main' });
    remote.push.mockResolvedValueOnce({ head: 'new', tree: 'new-tree' });
    await workspace.push(id, 'new origin');
    expect(remote.push.mock.calls[2][0]).toMatchObject({
      repo: 'two',
      branch: 'main',
      remoteHead: null,
      remoteTree: null
    });
  });

  it('只发布本次改动，并把卷内编辑和恢复后的工作目录带入 Git 操作', async () => {
    const called = vi.fn();
    changes.subscribe(called);
    await disk.write([...root, 'a'], githubFile('a', 'terminal').bytes);
    journal.read.mockResolvedValueOnce(await (await import('./github-worktree')).projectionHashes([original]));
    git.save.mockResolvedValue(snapshot);
    await workspace.inspect(id);
    expect(git.save).toHaveBeenCalled();
    await workspace.diffText(id, false);
    await workspace.localCommand(id, '', ['ls-files']);
    await workspace.commitChanges(id, 'abc');
    await workspace.branches(id);
    await workspace.createBranch(id, 'topic');
    await workspace.checkout(id, 'topic');
    await workspace.deleteBranch(id, 'topic');
    await workspace.exportArchive(id);
    await workspace.create(id, []);
    await workspace.importArchive(id, new Uint8Array());
    await workspace.setClonedOrigin({ ...initial, owner: 'o', repo: 'r' });
    workspace.restart();
    expect(git.setOrigin).toHaveBeenLastCalledWith(id, 'https://github.com/o/r.git');
  });
});
