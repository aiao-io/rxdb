import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkbenchSession, type WorkbenchFiles } from '../../session.js';
import { GIT_WORKBENCH_LIMITS, GitWorkbenchError } from '../git-protocol.js';
import type { GitHubApi } from './github-api.js';
import { GitHubApiError } from './github-api.js';
import { createGitHubBackend } from './github-backend.js';

function makeApi(): { [K in keyof GitHubApi]: ReturnType<typeof vi.fn> } {
  return {
    getAuthenticatedUser: vi.fn(),
    searchRepositories: vi.fn(),
    listMyRepositories: vi.fn(),
    getRepository: vi.fn(),
    listBranches: vi.fn(),
    getBranchSha: vi.fn(),
    getTreeFiles: vi.fn(),
    getFileContents: vi.fn(),
    getBlobContents: vi.fn(),
    listCommits: vi.fn(),
    getCommit: vi.fn(),
    createBlob: vi.fn(),
    createTree: vi.fn(),
    createCommit: vi.fn(),
    updateRef: vi.fn(),
    createRepository: vi.fn(),
    getZipball: vi.fn(),
    quota: vi.fn(() => ({ remaining: 100, limit: 5000, resetAt: null })),
    clearCache: vi.fn()
  };
}

function treeWith(files: { path: string; mode?: string }[]): { path: string; sha: string; mode: string }[] {
  return files.map(({ path, mode }) => ({ path, sha: `sha-${path}`, mode: mode ?? '100644' }));
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe('GitHub virtual repository backend', () => {
  let api: ReturnType<typeof makeApi>;
  let backend: ReturnType<typeof createGitHubBackend>;

  beforeEach(() => {
    api = makeApi();
    backend = createGitHubBackend({ api: api as unknown as GitHubApi });
  });

  const openMain = async (): Promise<void> => {
    api.getBranchSha.mockResolvedValue('head-1');
    api.getCommit.mockResolvedValue({ sha: 'head-1', treeSha: 'tree-1', parents: ['parent-1'], message: 'first' });
    api.getTreeFiles.mockResolvedValue(
      treeWith([{ path: 'src/a.ts' }, { path: 'src/b.ts', mode: '100755' }, { path: 'logo.png' }])
    );
    api.getBlobContents
      .mockResolvedValueOnce(text('hello a'))
      .mockResolvedValueOnce(text('hello b'))
      .mockResolvedValueOnce(new Uint8Array([0, 255, 1]));
    await backend.open('github:octo/repo@main');
  };

  function remoteFiles(files: WorkbenchFiles, modes: Record<string, string> = {}): void {
    api.getBranchSha.mockResolvedValue('remote-head');
    api.getCommit.mockResolvedValue({
      sha: 'remote-head',
      treeSha: 'remote-tree',
      parents: ['head-1'],
      message: 'remote'
    });
    api.getTreeFiles.mockResolvedValue(treeWith(Object.keys(files).map(path => ({ path, mode: modes[path] }))));
    api.getBlobContents.mockImplementation(async (_owner: string, _repo: string, sha: string) => {
      const path = sha.slice('sha-'.length);
      const value = files[path];
      return typeof value === 'string' ? text(value) : value;
    });
  }

  it('opens a repository snapshot with typed contents and branch encoding', async () => {
    await openMain();
    expect(api.getBranchSha).toHaveBeenCalledWith('octo', 'repo', 'main');
    expect(api.getTreeFiles).toHaveBeenCalledWith('octo', 'repo', 'tree-1');
    expect(api.getBlobContents).toHaveBeenCalledTimes(3);
    expect(await backend.status('github:octo/repo@main')).toMatchObject({
      head: 'head-1',
      branch: 'main',
      remote: { name: 'origin', url: 'https://github.com/octo/repo' },
      entries: []
    });

    api.getBranchSha.mockResolvedValue('head-2');
    api.getCommit.mockResolvedValue({ sha: 'head-2', treeSha: 'tree-2', parents: ['head-1'], message: 'x' });
    api.getTreeFiles.mockResolvedValue(treeWith([{ path: 'a.ts' }]));
    api.getBlobContents.mockResolvedValueOnce(text('v2'));
    const snapshot = await backend.open('github:octo/repo@feature%2Fx');
    expect(api.getBranchSha).toHaveBeenCalledWith('octo', 'repo', 'feature/x');
    expect(snapshot).toMatchObject({ projectId: 'github:octo/repo@feature%2Fx', revision: 'head-2' });
    expect(snapshot.files).toEqual({ 'a.ts': 'v2' });
  });

  it('maps API failures to workbench error codes', async () => {
    api.getBranchSha.mockRejectedValue(new GitHubApiError('not_found', 'Not Found', 404));
    await expect(backend.open('github:octo/missing@main')).rejects.toMatchObject({ code: 'remote_not_found' });

    api.getBranchSha.mockRejectedValue(new GitHubApiError('auth_required', 'auth', 401));
    await expect(backend.open('github:octo/missing@main')).rejects.toMatchObject({ code: 'auth_required' });

    api.getBranchSha.mockRejectedValue(new GitHubApiError('rate_limited', 'quota', 403));
    await expect(backend.open('github:octo/missing@main')).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('refuses repositories with files over the workbench limit', async () => {
    api.getBranchSha.mockResolvedValue('head-1');
    api.getCommit.mockResolvedValue({ sha: 'head-1', treeSha: 'tree-1', parents: [], message: 'x' });
    api.getTreeFiles.mockResolvedValue([{ path: 'huge.bin', sha: 'sha-huge', mode: '100644' }]);
    api.getBlobContents.mockResolvedValueOnce(new Uint8Array(2 * 1024 * 1024 + 1));
    await expect(backend.open('github:octo/repo@main')).rejects.toMatchObject({
      code: 'resource_limit',
      message: expect.stringContaining('huge.bin')
    });
  });

  it('refuses repositories with too many files before downloading blobs', async () => {
    api.getBranchSha.mockResolvedValue('head-1');
    api.getCommit.mockResolvedValue({ sha: 'head-1', treeSha: 'tree-1', parents: [], message: 'x' });
    api.getTreeFiles.mockResolvedValue(
      Array.from({ length: GIT_WORKBENCH_LIMITS.files + 1 }, (_, index) => ({
        path: `file-${index}.txt`,
        sha: `sha-${index}`,
        mode: '100644'
      }))
    );
    await expect(backend.open('github:octo/repo@main')).rejects.toMatchObject({ code: 'resource_limit' });
    expect(api.getBlobContents).not.toHaveBeenCalled();
  });

  it('refuses repositories whose downloaded blobs exceed the total byte limit', async () => {
    api.getBranchSha.mockResolvedValue('head-1');
    api.getCommit.mockResolvedValue({ sha: 'head-1', treeSha: 'tree-1', parents: [], message: 'x' });
    api.getTreeFiles.mockResolvedValue(
      Array.from({ length: 11 }, (_, index) => ({ path: `file-${index}.bin`, sha: `sha-${index}`, mode: '100644' }))
    );
    api.getBlobContents.mockResolvedValue(new Uint8Array(2 * 1024 * 1024));
    await expect(backend.open('github:octo/repo@main')).rejects.toMatchObject({ code: 'resource_limit' });
  });

  it('reports working tree changes, untracked files and deletions with porcelain codes', async () => {
    await openMain();
    const id = 'github:octo/repo@main';

    const saved = await backend.save(
      id,
      {
        'src/a.ts': 'changed',
        'src/b.ts': 'hello b',
        'logo.png': new Uint8Array([0, 255, 1]),
        'new.ts': 'untracked'
      },
      'head-1'
    );
    expect(saved.revision).toBe('head-1:1');
    let status = await backend.status(id);
    expect(status.entries).toEqual([
      { path: 'new.ts', index: '?', worktree: '?' },
      { path: 'src/a.ts', index: ' ', worktree: 'M' }
    ]);

    await backend.remove(id, 'src/b.ts');
    status = await backend.status(id);
    expect(status.entries).toContainEqual({ path: 'src/b.ts', index: ' ', worktree: 'D' });
  });

  it('rejects saves against a stale revision', async () => {
    await openMain();
    await expect(
      backend.save('github:octo/repo@main', { 'src/a.ts': 'changed' }, 'stale-revision')
    ).rejects.toMatchObject({ code: 'revision_conflict' });
  });

  it('外部增量保存保留未提及文件，并原子删除指定路径', async () => {
    await openMain();
    const saved = await backend.save('github:octo/repo@main', { 'new.ts': 'new' }, 'head-1', ['src/a.ts']);
    expect(saved.files).toEqual({ 'new.ts': 'new', 'src/b.ts': 'hello b', 'logo.png': new Uint8Array([0, 255, 1]) });
    expect(saved.revision).toBe('head-1:1');
  });

  it('外部保存拒绝非法路径、写删冲突和不存在的删除，失败不修改内容', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    await expect(backend.save(id, { 'src/a.ts': 'next' }, 'head-1', ['src/a.ts'])).rejects.toMatchObject({
      code: 'path_collision'
    });
    await expect(backend.save(id, {}, 'head-1', ['.git/config'])).rejects.toMatchObject({ code: 'invalid_path' });
    await expect(backend.save(id, {}, 'head-1', ['missing.ts'])).rejects.toMatchObject({ code: 'invalid_path' });
    expect((await backend.status(id)).entries).toEqual([]);
  });

  it('pulls remote additions, deletions and binary changes as one clean snapshot', async () => {
    await openMain();
    const files = { 'src/a.ts': 'remote a', 'new.ts': 'remote new', 'logo.png': new Uint8Array([1, 2, 3]) };
    remoteFiles(files);

    const snapshot = await backend.pull!('github:octo/repo@main');

    expect(snapshot.files).toEqual(files);
    expect(snapshot.revision).not.toBe('head-1');
    expect(await backend.status('github:octo/repo@main')).toMatchObject({ head: 'remote-head', entries: [] });
    expect(api.getBlobContents).toHaveBeenCalledWith('octo', 'repo', 'sha-src/a.ts');
    expect(api.getTreeFiles).toHaveBeenLastCalledWith('octo', 'repo', 'remote-tree');
  });

  it('returns the existing snapshot without refetching file contents when the remote head is unchanged', async () => {
    await openMain();
    const snapshot = await backend.pull!('github:octo/repo@main');
    expect(snapshot.revision).toBe('head-1');
    expect(snapshot.files['src/a.ts']).toBe('hello a');
    expect(api.getBlobContents).toHaveBeenCalledTimes(3);
    expect(api.getCommit).toHaveBeenCalledTimes(1);
  });

  it('preserves local working edits and staged snapshots while pulling non-overlapping changes', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    const baseline = { 'src/b.ts': 'hello b', 'logo.png': new Uint8Array([0, 255, 1]) };
    await backend.save(id, { ...baseline, 'src/a.ts': 'staged a' }, 'head-1');
    await backend.stage(id, ['src/a.ts']);
    await backend.save(id, { ...baseline, 'src/a.ts': 'working a', 'local.ts': 'local' }, 'head-1:1');
    remoteFiles({ ...baseline, 'src/a.ts': 'hello a', 'src/b.ts': 'remote b' });

    const snapshot = await backend.pull!(id);

    expect(snapshot.files).toEqual({
      ...baseline,
      'src/a.ts': 'working a',
      'src/b.ts': 'remote b',
      'local.ts': 'local'
    });
    expect(await backend.status(id)).toMatchObject({
      head: 'remote-head',
      entries: [
        { path: 'local.ts', index: '?', worktree: '?' },
        { path: 'src/a.ts', index: 'M', worktree: 'M' }
      ]
    });
    expect(await backend.readDiff(id, 'src/a.ts', 'staged')).toMatchObject({
      base: { text: 'hello a' },
      modified: { text: 'staged a' }
    });
    expect(await backend.readDiff(id, 'src/a.ts', 'working')).toMatchObject({
      base: { text: 'staged a' },
      modified: { text: 'working a' }
    });
  });

  it('rejects conflicting pulls atomically and reports every conflicting path', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    const local = { 'src/a.ts': 'local a', 'src/b.ts': 'hello b', 'logo.png': new Uint8Array([9]) };
    await backend.save(id, local, 'head-1');
    await backend.stage(id, ['src/a.ts']);
    const before = await backend.status(id);
    remoteFiles({ 'src/a.ts': 'remote a', 'src/b.ts': 'hello b', 'logo.png': new Uint8Array([8]) });

    await expect(backend.pull!(id)).rejects.toMatchObject({
      code: 'remote_conflict',
      message: expect.stringMatching(/logo\.png.*src\/a\.ts/)
    });
    expect(await backend.status(id)).toEqual(before);
    expect(await backend.readDiff(id, 'src/a.ts', 'staged')).toMatchObject({ modified: { text: 'local a' } });
    api.getBranchSha.mockResolvedValue('head-1');
    expect(await backend.pull!(id)).toMatchObject({ revision: 'head-1:1', files: local });
  });

  it('detects a staged conflict even when the working buffer was edited back to the old baseline', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    const baseline = { 'src/a.ts': 'hello a', 'src/b.ts': 'hello b', 'logo.png': new Uint8Array([0, 255, 1]) };
    await backend.save(id, { ...baseline, 'src/a.ts': 'staged a' }, 'head-1');
    await backend.stage(id, ['src/a.ts']);
    await backend.save(id, baseline, 'head-1:1');
    remoteFiles({ ...baseline, 'src/a.ts': 'remote a' });

    await expect(backend.pull!(id)).rejects.toMatchObject({
      code: 'remote_conflict',
      message: expect.stringContaining('src/a.ts')
    });
    expect(await backend.readDiff(id, 'src/a.ts', 'staged')).toMatchObject({ modified: { text: 'staged a' } });
  });

  it('accepts remote changes identical to local staged content without leaving a stale staged change', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    const files = { 'src/a.ts': 'same a', 'src/b.ts': 'hello b', 'logo.png': new Uint8Array([0, 255, 1]) };
    await backend.save(id, files, 'head-1');
    await backend.stage(id, ['src/a.ts']);
    remoteFiles(files);

    expect((await backend.pull!(id)).files).toEqual(files);
    expect((await backend.status(id)).entries).toEqual([]);
  });

  it('keeps working edits after the remote has already adopted the staged snapshot', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    const baseline = { 'src/a.ts': 'hello a', 'src/b.ts': 'hello b', 'logo.png': new Uint8Array([0, 255, 1]) };
    await backend.save(id, { ...baseline, 'src/a.ts': 'staged a' }, 'head-1');
    await backend.stage(id, ['src/a.ts']);
    await backend.save(id, baseline, 'head-1:1');
    remoteFiles({ ...baseline, 'src/a.ts': 'staged a' });

    expect((await backend.pull!(id)).files['src/a.ts']).toBe('hello a');
    expect((await backend.status(id)).entries).toEqual([{ path: 'src/a.ts', index: ' ', worktree: 'M' }]);
  });

  it('keeps a local staged deletion when the remote changed another file', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    await backend.remove(id, 'src/a.ts');
    await backend.stage(id, ['src/a.ts']);
    remoteFiles({ 'src/a.ts': 'hello a', 'src/b.ts': 'remote b', 'logo.png': new Uint8Array([0, 255, 1]) });

    const snapshot = await backend.pull!(id);

    expect(snapshot.files).not.toHaveProperty('src/a.ts');
    expect(snapshot.files['src/b.ts']).toBe('remote b');
    expect((await backend.status(id)).entries).toEqual([{ path: 'src/a.ts', index: 'D', worktree: ' ' }]);
  });

  it('keeps a staged new file visible after deletion and an unrelated pull', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    const baseline = { 'src/a.ts': 'hello a', 'src/b.ts': 'hello b', 'logo.png': new Uint8Array([0, 255, 1]) };
    await backend.save(id, { ...baseline, 'new.ts': 'staged addition' }, 'head-1');
    await backend.stage(id, ['new.ts']);
    await backend.remove(id, 'new.ts');
    expect((await backend.status(id)).entries).toEqual([{ path: 'new.ts', index: 'A', worktree: 'D' }]);
    remoteFiles({ ...baseline, 'src/b.ts': 'remote b' });

    const snapshot = await backend.pull!(id);

    expect(snapshot.files).not.toHaveProperty('new.ts');
    expect(snapshot.files['src/b.ts']).toBe('remote b');
    expect((await backend.status(id)).entries).toEqual([{ path: 'new.ts', index: 'A', worktree: 'D' }]);
    api.createTree.mockResolvedValue('next-tree');
    api.createCommit.mockResolvedValue('next-head');
    api.updateRef.mockResolvedValue(undefined);

    await backend.commit(id, 'add staged file');

    expect(api.createTree).toHaveBeenCalledWith('octo', 'repo', 'remote-tree', [
      { path: 'new.ts', mode: '100644', content: 'staged addition' }
    ]);
    expect(api.createCommit).toHaveBeenCalledWith('octo', 'repo', 'add staged file', 'next-tree', ['remote-head']);
    expect(api.updateRef).toHaveBeenCalledWith('octo', 'repo', 'heads/main', 'next-head', false);
    expect((await backend.status(id)).entries).toEqual([{ path: 'new.ts', index: ' ', worktree: 'D' }]);
    expect(await backend.readDiff(id, 'new.ts', 'working')).toMatchObject({
      base: { text: 'staged addition' },
      modified: { exists: false }
    });
  });

  it('rejects a remote deletion that would erase a local change', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    await backend.save(
      id,
      { 'src/a.ts': 'local a', 'src/b.ts': 'hello b', 'logo.png': new Uint8Array([0, 255, 1]) },
      'head-1'
    );
    remoteFiles({ 'src/b.ts': 'hello b', 'logo.png': new Uint8Array([0, 255, 1]) });
    await expect(backend.pull!(id)).rejects.toMatchObject({
      code: 'remote_conflict',
      message: expect.stringContaining('src/a.ts')
    });
    expect((await backend.status(id)).head).toBe('head-1');
  });

  it('rejects file and directory collisions between local additions and the remote snapshot', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    await backend.save(id, { 'local-dir': 'local file' }, 'head-1');
    remoteFiles({
      'src/a.ts': 'hello a',
      'src/b.ts': 'hello b',
      'logo.png': new Uint8Array([0, 255, 1]),
      'local-dir/remote.ts': 'remote file'
    });
    await expect(backend.pull!(id)).rejects.toMatchObject({
      code: 'remote_conflict',
      message: expect.stringContaining('local-dir')
    });
    expect((await backend.status(id)).head).toBe('head-1');
  });

  it('rejects a collision in the staged tree even when the working tree has no colliding file', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    const baseline = { 'src/a.ts': 'hello a', 'src/b.ts': 'hello b', 'logo.png': new Uint8Array([0, 255, 1]) };
    await backend.save(id, { ...baseline, 'local-dir': 'staged file' }, 'head-1');
    await backend.stage(id, ['local-dir']);
    await backend.save(id, baseline, 'head-1:1');
    remoteFiles({ ...baseline, 'local-dir/remote.ts': 'remote file' });

    await expect(backend.pull!(id)).rejects.toMatchObject({
      code: 'remote_conflict',
      message: expect.stringContaining('local-dir')
    });
    expect((await backend.status(id)).head).toBe('head-1');
  });

  it('retains the original baseline and edits when remote contents fail to load', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    await backend.stage(id, ['src/a.ts']);
    const before = await backend.status(id);
    remoteFiles({ 'src/a.ts': 'remote a' });
    api.getBlobContents.mockRejectedValue(new GitHubApiError('network_failed', 'offline'));
    await expect(backend.pull!(id)).rejects.toMatchObject({ code: 'network_failed' });
    expect(await backend.status(id)).toEqual(before);
    expect(await backend.readDiff(id, 'src/a.ts', 'staged')).toMatchObject({
      base: { text: 'hello a' },
      modified: { text: 'hello a' }
    });
  });

  it('rejects a pull when a save completes while remote files are downloading', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    remoteFiles({ 'src/a.ts': 'remote a' });
    let finish!: (bytes: Uint8Array) => void;
    api.getBlobContents.mockImplementation(
      () =>
        new Promise<Uint8Array>(resolve => {
          finish = resolve;
        })
    );
    const pulling = backend.pull!(id);
    await vi.waitFor(() => expect(api.getBlobContents).toHaveBeenCalledWith('octo', 'repo', 'sha-src/a.ts'));
    await backend.save(id, { 'src/a.ts': 'saved during pull' }, 'head-1');
    finish(text('remote a'));

    await expect(pulling).rejects.toMatchObject({ code: 'revision_conflict' });
    api.getBranchSha.mockResolvedValue('head-1');
    expect(await backend.pull!(id)).toMatchObject({ revision: 'head-1:1', files: { 'src/a.ts': 'saved during pull' } });
  });

  it('rejects a pull when the staged snapshot changes during remote download', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    remoteFiles({ 'src/a.ts': 'hello a' });
    let finish!: (bytes: Uint8Array) => void;
    api.getBlobContents.mockImplementation(
      () =>
        new Promise<Uint8Array>(resolve => {
          finish = resolve;
        })
    );
    const pulling = backend.pull!(id);
    await vi.waitFor(() => expect(api.getBlobContents).toHaveBeenCalledWith('octo', 'repo', 'sha-src/a.ts'));
    await backend.stage(id, ['src/a.ts']);
    finish(text('hello a'));

    await expect(pulling).rejects.toMatchObject({ code: 'revision_conflict' });
    expect((await backend.status(id)).head).toBe('head-1');
    expect(await backend.readDiff(id, 'src/a.ts', 'staged')).toMatchObject({ modified: { text: 'hello a' } });
  });

  it('uses pulled executable modes and trees for the next pushed commit', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    remoteFiles({ 'src/a.ts': 'hello a' }, { 'src/a.ts': '100755' });
    const pulled = await backend.pull!(id);
    await backend.save(id, { 'src/a.ts': 'changed executable' }, pulled.revision);
    await backend.stage(id, ['src/a.ts']);
    api.createTree.mockResolvedValue('next-tree');
    api.createCommit.mockResolvedValue('next-head');
    api.updateRef.mockResolvedValue(undefined);

    await backend.commit(id, 'after pull');

    expect(api.createTree).toHaveBeenCalledWith('octo', 'repo', 'remote-tree', [
      { path: 'src/a.ts', mode: '100755', content: 'changed executable' }
    ]);
    expect(api.createCommit).toHaveBeenCalledWith('octo', 'repo', 'after pull', 'next-tree', ['remote-head']);
  });

  it('stages, unstages and diffs both sides with binary awareness', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    await backend.save(
      id,
      {
        'src/a.ts': 'changed',
        'src/b.ts': 'hello b',
        'new.ts': 'brand new',
        'logo.png': new Uint8Array([9, 9])
      },
      'head-1'
    );

    await backend.stage(id, ['src/a.ts', 'new.ts', 'logo.png']);
    let status = await backend.status(id);
    expect(status.entries).toContainEqual({ path: 'new.ts', index: 'A', worktree: ' ' });
    expect(status.entries).toContainEqual({ path: 'src/a.ts', index: 'M', worktree: ' ' });
    expect(status.entries).toContainEqual({ path: 'logo.png', index: 'M', worktree: ' ' });

    const staged = await backend.readDiff(id, 'src/a.ts', 'staged');
    expect(staged.base).toEqual({ exists: true, binary: false, text: 'hello a', byteLength: 7 });
    expect(staged.modified).toEqual({ exists: true, binary: false, text: 'changed', byteLength: 7 });

    const working = await backend.readDiff(id, 'new.ts', 'working');
    expect(working.base).toEqual({ exists: true, binary: false, text: 'brand new', byteLength: 9 });

    const binary = await backend.readDiff(id, 'logo.png', 'staged');
    expect(binary.modified.binary).toBe(true);
    expect(binary.modified.byteLength).toBe(2);

    await backend.unstage(id, ['src/a.ts']);
    status = await backend.status(id);
    expect(status.entries).toContainEqual({ path: 'src/a.ts', index: ' ', worktree: 'M' });
  });

  it('discards working changes back to the baseline', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    await backend.save(
      id,
      { 'src/a.ts': 'changed', 'src/b.ts': 'hello b', 'logo.png': new Uint8Array([0, 255, 1]) },
      'head-1'
    );
    const snapshot = await backend.discardWorking(id, 'src/a.ts');
    expect(snapshot.files['src/a.ts']).toBe('hello a');
    expect(snapshot.files['src/b.ts']).toBe('hello b');
    expect(await backend.status(id)).toMatchObject({ entries: [] });
  });

  it('commits staged changes through the git database API and keeps unstaged edits', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    await backend.save(
      id,
      {
        'src/a.ts': 'changed',
        'new.ts': 'brand new',
        'src/b.ts': 'still working',
        'logo.png': new Uint8Array([0, 255, 2])
      },
      'head-1'
    );
    await backend.stage(id, ['src/a.ts', 'new.ts']);

    api.createTree.mockResolvedValue('tree-2');
    api.createCommit.mockResolvedValue('head-2');
    api.updateRef.mockResolvedValue(undefined);

    const oid = await backend.commit(id, 'feat: change a');
    expect(oid).toBe('head-2');
    expect(api.createTree).toHaveBeenCalledWith('octo', 'repo', 'tree-1', [
      { path: 'new.ts', mode: '100644', content: 'brand new' },
      { path: 'src/a.ts', mode: '100644', content: 'changed' }
    ]);
    expect(api.createCommit).toHaveBeenCalledWith('octo', 'repo', 'feat: change a', 'tree-2', ['head-1']);
    expect(api.updateRef).toHaveBeenCalledWith('octo', 'repo', 'heads/main', 'head-2', false);

    const status = await backend.status(id);
    expect(status.head).toBe('head-2');
    expect(status.entries).toEqual([
      { path: 'logo.png', index: ' ', worktree: 'M' },
      { path: 'src/b.ts', index: ' ', worktree: 'M' }
    ]);
  });

  it('allows the same workbench session to save again after committing and pushing', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    api.getBlobContents.mockResolvedValue(text('initial'));
    const session = new WorkbenchSession(backend);
    await session.open(id);
    session.edit('src/a.ts', 'first edit');
    await session.save();
    await backend.stage(id, ['src/a.ts']);
    api.createTree.mockResolvedValue('tree-2');
    api.createCommit.mockResolvedValue('head-2');
    api.updateRef.mockResolvedValue(undefined);

    await backend.commit(id, 'first push');
    session.edit('src/a.ts', 'second edit');
    await session.save();

    expect(session.state.dirty).toBe(false);
    expect(session.state.files['src/a.ts']).toBe('second edit');
    expect((await backend.status(id)).entries).toContainEqual({ path: 'src/a.ts', index: ' ', worktree: 'M' });
  });

  it('keeps a new staged edit when an earlier staged snapshot finishes pushing', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    const baseline = { 'src/b.ts': 'hello b', 'logo.png': new Uint8Array([0, 255, 1]) };
    await backend.save(id, { ...baseline, 'src/a.ts': 'first staged' }, 'head-1');
    await backend.stage(id, ['src/a.ts']);
    let finish!: (tree: string) => void;
    api.createTree.mockImplementation(
      () =>
        new Promise<string>(resolve => {
          finish = resolve;
        })
    );
    api.createCommit.mockResolvedValue('pushed-head');
    api.updateRef.mockResolvedValue(undefined);
    const pushing = backend.commit(id, 'first staged snapshot');
    await vi.waitFor(() => expect(api.createTree).toHaveBeenCalled());
    await backend.save(id, { ...baseline, 'src/a.ts': 'second staged' }, 'head-1:1');
    await backend.stage(id, ['src/a.ts']);
    finish('pushed-tree');

    await expect(pushing).resolves.toBe('pushed-head');

    expect(await backend.readDiff(id, 'src/a.ts', 'staged')).toMatchObject({
      base: { text: 'first staged' },
      modified: { text: 'second staged' }
    });
    expect((await backend.status(id)).entries).toContainEqual({ path: 'src/a.ts', index: 'M', worktree: ' ' });
  });

  it('uploads binary and oversized staged content as blobs and deletes staged removals', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    const bigText = 'x'.repeat(600 * 1024);
    await backend.save(
      id,
      { 'logo.png': new Uint8Array([1, 2, 3]), 'big.ts': bigText, 'src/a.ts': 'hello a', 'src/b.ts': 'hello b' },
      'head-1'
    );
    await backend.stage(id, ['logo.png', 'big.ts']);
    await backend.remove(id, 'src/a.ts');
    await backend.stage(id, ['src/a.ts']);

    api.createBlob.mockResolvedValueOnce('blob-logo').mockResolvedValueOnce('blob-big');
    api.createTree.mockResolvedValue('tree-2');
    api.createCommit.mockResolvedValue('head-2');
    api.updateRef.mockResolvedValue(undefined);

    await backend.commit(id, 'feat: assets');
    expect(api.createBlob).toHaveBeenCalledTimes(2);
    expect(api.createTree).toHaveBeenCalledWith('octo', 'repo', 'tree-1', [
      { path: 'big.ts', mode: '100644', sha: 'blob-big' },
      { path: 'logo.png', mode: '100644', sha: 'blob-logo' },
      { path: 'src/a.ts', sha: null }
    ]);
  });

  it('preserves the executable mode of modified files', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    await backend.save(
      id,
      { 'src/b.ts': 'exec changed', 'src/a.ts': 'hello a', 'logo.png': new Uint8Array([0, 255, 1]) },
      'head-1'
    );
    await backend.stage(id, ['src/b.ts']);
    api.createTree.mockResolvedValue('tree-2');
    api.createCommit.mockResolvedValue('head-2');
    api.updateRef.mockResolvedValue(undefined);
    await backend.commit(id, 'chmod');
    expect(api.createTree).toHaveBeenCalledWith('octo', 'repo', 'tree-1', [
      { path: 'src/b.ts', mode: '100755', content: 'exec changed' }
    ]);
  });

  it('rejects empty commits and surfaces ref conflicts', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    await expect(backend.commit(id, 'nothing')).rejects.toMatchObject({ code: 'nothing_staged' });

    const baseline = { 'src/b.ts': 'hello b', 'logo.png': new Uint8Array([0, 255, 1]) };
    await backend.save(id, { ...baseline, 'src/a.ts': 'changed' }, 'head-1');
    await backend.stage(id, ['src/a.ts']);
    await backend.save(id, { ...baseline, 'src/a.ts': 'hello a' }, 'head-1:1');
    await backend.stage(id, ['src/a.ts']);
    await expect(backend.commit(id, 'no effective change')).rejects.toMatchObject({ code: 'nothing_staged' });

    await backend.save(id, { ...baseline, 'src/a.ts': 'changed' }, 'head-1:2');
    await backend.stage(id, ['src/a.ts']);
    api.createTree.mockResolvedValue('tree-2');
    api.createCommit.mockResolvedValue('head-2');
    api.updateRef.mockRejectedValue(new GitHubApiError('conflict', 'ref update failed', 422));
    await expect(backend.commit(id, 'conflict')).rejects.toMatchObject({ code: 'remote_conflict' });
    const status = await backend.status(id);
    expect(status.head).toBe('head-1');
    expect(status.entries).toContainEqual({ path: 'src/a.ts', index: 'M', worktree: ' ' });
  });

  it('lists history and restores a snapshot at a commit without moving HEAD', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    api.listCommits.mockResolvedValue([
      { oid: 'head-1', message: 'first' },
      { oid: 'parent-1', message: 'root' }
    ]);
    await expect(backend.history(id)).resolves.toEqual([
      { oid: 'head-1', message: 'first' },
      { oid: 'parent-1', message: 'root' }
    ]);

    api.getCommit.mockResolvedValue({ sha: 'parent-1', treeSha: 'tree-0', parents: [], message: 'root' });
    api.getTreeFiles.mockResolvedValue(treeWith([{ path: 'src/a.ts' }]));
    api.getBlobContents.mockResolvedValueOnce(text('old a'));
    const snapshot = await backend.restore(id, 'parent-1');
    expect(snapshot.files).toEqual({ 'src/a.ts': 'old a' });
    expect((await backend.status(id)).head).toBe('head-1');
    expect((await backend.status(id)).entries).toContainEqual({ path: 'src/a.ts', index: ' ', worktree: 'M' });
    expect((await backend.status(id)).entries).toContainEqual({ path: 'src/b.ts', index: ' ', worktree: 'D' });
  });

  it('exports the branch as a zipball and rejects local-only operations', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    api.getZipball.mockResolvedValue(new Uint8Array([80, 75]));
    await expect(backend.exportArchive(id)).resolves.toEqual(new Uint8Array([80, 75]));
    expect(api.getZipball).toHaveBeenCalledWith('octo', 'repo', 'head-1', 24 * 1024 * 1024);

    await expect(backend.create('github:octo/new@main', {})).rejects.toBeInstanceOf(GitWorkbenchError);
    await expect(backend.importArchive(id, new Uint8Array())).rejects.toMatchObject({ code: 'unsupported_operation' });
  });

  it('rejects zipballs over the workbench archive limit', async () => {
    await openMain();
    api.getZipball.mockResolvedValue(new Uint8Array(GIT_WORKBENCH_LIMITS.archiveBytes + 1));
    await expect(backend.exportArchive('github:octo/repo@main')).rejects.toMatchObject({ code: 'resource_limit' });
  });

  it('renames a working file as delete plus add', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    await backend.rename(id, 'src/a.ts', 'src/c.ts');
    const status = await backend.status(id);
    expect(status.entries).toContainEqual({ path: 'src/a.ts', index: ' ', worktree: 'D' });
    expect(status.entries).toContainEqual({ path: 'src/c.ts', index: '?', worktree: '?' });
  });

  it('rejects remote rename and move path collisions without changing the buffer', async () => {
    await openMain();
    const id = 'github:octo/repo@main';

    await expect(backend.rename(id, 'src/a.ts', 'src/b.ts')).rejects.toMatchObject({ code: 'path_collision' });
    await expect(backend.rename(id, 'src/a.ts', '../a.ts')).rejects.toMatchObject({ code: 'invalid_path' });
    await expect(backend.move(id, 'src', 'src/nested')).rejects.toMatchObject({ code: 'path_collision' });
    await expect(backend.move(id, 'src/a.ts', 'logo.png')).rejects.toMatchObject({ code: 'path_collision' });

    expect((await backend.status(id)).entries).toEqual([]);
  });

  it('moves a remote directory as one validated buffer update', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    await backend.move(id, 'src', 'lib');

    expect((await backend.status(id)).entries).toEqual([
      { path: 'lib/a.ts', index: '?', worktree: '?' },
      { path: 'lib/b.ts', index: '?', worktree: '?' },
      { path: 'logo.png', index: ' ', worktree: ' ' },
      { path: 'src/a.ts', index: ' ', worktree: 'D' },
      { path: 'src/b.ts', index: ' ', worktree: 'D' }
    ].filter(entry => entry.index !== ' ' || entry.worktree !== ' '));
  });
});
