import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitWorkbenchError } from '../git-protocol.js';
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
    api.getFileContents
      .mockResolvedValueOnce(text('hello a'))
      .mockResolvedValueOnce(text('hello b'))
      .mockResolvedValueOnce(new Uint8Array([0, 255, 1]));
    await backend.open('github:octo/repo@main');
  };

  it('opens a repository snapshot with typed contents and branch encoding', async () => {
    await openMain();
    expect(api.getBranchSha).toHaveBeenCalledWith('octo', 'repo', 'main');
    expect(api.getTreeFiles).toHaveBeenCalledWith('octo', 'repo', 'tree-1');
    expect(api.getFileContents).toHaveBeenCalledTimes(3);
    expect(await backend.status('github:octo/repo@main')).toMatchObject({
      head: 'head-1',
      branch: 'main',
      entries: []
    });

    api.getBranchSha.mockResolvedValue('head-2');
    api.getCommit.mockResolvedValue({ sha: 'head-2', treeSha: 'tree-2', parents: ['head-1'], message: 'x' });
    api.getTreeFiles.mockResolvedValue(treeWith([{ path: 'a.ts' }]));
    api.getFileContents.mockResolvedValueOnce(text('v2'));
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
    api.getFileContents.mockResolvedValueOnce(new Uint8Array(2 * 1024 * 1024 + 1));
    await expect(backend.open('github:octo/repo@main')).rejects.toMatchObject({
      code: 'resource_limit',
      message: expect.stringContaining('huge.bin')
    });
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
    api.getFileContents.mockResolvedValueOnce(text('old a'));
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
    expect(api.getZipball).toHaveBeenCalledWith('octo', 'repo', 'head-1');

    await expect(backend.create('github:octo/new@main', {})).rejects.toBeInstanceOf(GitWorkbenchError);
    await expect(backend.importArchive(id, new Uint8Array())).rejects.toMatchObject({ code: 'unsupported_operation' });
  });

  it('renames a working file as delete plus add', async () => {
    await openMain();
    const id = 'github:octo/repo@main';
    await backend.rename(id, 'src/a.ts', 'src/c.ts');
    const status = await backend.status(id);
    expect(status.entries).toContainEqual({ path: 'src/a.ts', index: ' ', worktree: 'D' });
    expect(status.entries).toContainEqual({ path: 'src/c.ts', index: '?', worktree: '?' });
  });
});
