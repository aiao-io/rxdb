import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Preferences } from '../data/preferences';
import { configureServices } from '../testing/angular';
import { GIT_WORKBENCH_LIMITS } from './git/git-protocol';
import type { GitFile } from './github-git-backend';
import {
  GithubRemoteRepository,
  GithubRepositoryStore,
  parseGithubRemote,
  projectIdFor,
  type GithubRepositoryRecord
} from './github-repository';
import { GitHubApiError, type GitHubApi } from './github/github-api';
import type { GitHubTreeEntry } from './github/github-types';

const bytes = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value) as Uint8Array<ArrayBuffer>;
const file = (path: string, value: string | number[]): GitFile => ({
  path,
  bytes: typeof value === 'string' ? bytes(value) : (new Uint8Array(value) as Uint8Array<ArrayBuffer>)
});
const entry = (path: string, sha = `sha-${path}`, mode = '100644'): GitHubTreeEntry => ({ path, sha, mode });

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
    createInitialFile: vi.fn(),
    createBlob: vi.fn(),
    createTree: vi.fn(),
    createCommit: vi.fn(),
    updateRef: vi.fn(),
    createRef: vi.fn(),
    createRepository: vi.fn(),
    getZipball: vi.fn(),
    quota: vi.fn(),
    clearCache: vi.fn()
  };
}

function record(overrides: Partial<GithubRepositoryRecord> = {}): GithubRepositoryRecord {
  return {
    projectId: 'github-octo-repo-main',
    name: 'octo/repo',
    owner: 'octo',
    repo: 'repo',
    branch: 'main',
    private: false,
    remoteHead: 'head-1',
    remoteTree: 'tree-1',
    remoteEntries: [entry('a.txt'), entry('b.txt')],
    updatedAt: 1,
    ...overrides
  };
}

describe('GitHub repository parsing and remote workflow', () => {
  let api: ReturnType<typeof makeApi>;
  let remote: GithubRemoteRepository;

  beforeEach(() => {
    api = makeApi();
    api.getBlobContents.mockImplementation(async (_owner: string, _repo: string, sha: string) =>
      bytes(sha.startsWith('sha-') ? 'base' : '')
    );
    remote = new GithubRemoteRepository(api as unknown as GitHubApi);
  });

  it('Fetch 只读分支 ref，分支不存在时区分可访问仓库与无权访问', async () => {
    api.getBranchSha.mockResolvedValueOnce('latest');
    await expect(remote.fetchHead('octo', 'repo', 'main')).resolves.toBe('latest');
    expect(api.getCommit).not.toHaveBeenCalled();
    expect(api.listBranches).not.toHaveBeenCalled();

    const missing = new GitHubApiError('not_found', 'Not found');
    api.getBranchSha.mockRejectedValue(missing);
    api.listBranches.mockResolvedValueOnce([{ name: 'main', sha: 'latest' }]);
    await expect(remote.fetchHead('octo', 'repo', 'topic')).resolves.toBeNull();
    api.listBranches.mockResolvedValueOnce([{ name: 'topic', sha: 'newly-created' }]);
    await expect(remote.fetchHead('octo', 'repo', 'topic')).resolves.toBe('newly-created');
    api.listBranches.mockRejectedValueOnce(missing);
    await expect(remote.fetchHead('octo', 'repo', 'topic')).rejects.toThrow('仓库不存在或无权访问');

    api.getBranchSha.mockRejectedValueOnce(new GitHubApiError('network_failed', 'offline'));
    await expect(remote.fetchHead('octo', 'repo', 'topic')).rejects.toThrow('无法连接 GitHub API');

    api.getBranchSha.mockRejectedValueOnce(new GitHubApiError('auth_required', 'Bad credentials', 401));
    await expect(remote.fetchHead('octo', 'repo', 'topic')).rejects.toThrow('GitHub 登录已失效，请重新登录');
    expect(api.listBranches).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['octo/repo', { owner: 'octo', repo: 'repo' }],
    ['https://github.com/octo/repo.git', { owner: 'octo', repo: 'repo' }],
    ['https://github.com/octo/repo/tree/feature%2Fx', { owner: 'octo', repo: 'repo', branch: 'feature/x' }],
    ['/octo/repo/tree/release/v1', { owner: 'octo', repo: 'repo', branch: 'release/v1' }]
  ])('parses a supported remote %s', (value, expected) => {
    expect(parseGithubRemote(value)).toEqual(expected);
  });

  it.each([
    '',
    'octo',
    'git@github.com:octo/repo.git',
    'http://github.com/octo/repo',
    'github.com/octo/repo',
    'octo/repo?x=1',
    'octo/repo/tree/main?bad'
  ])('rejects an unsupported remote %s', value => {
    expect(parseGithubRemote(value)).toBeNull();
  });

  it('uses a bounded stable project id and keeps long branch names distinct', () => {
    expect(projectIdFor('octo', 'repo', 'main')).toBe('github-octo-repo-main');
    expect(projectIdFor('octo', 'repo', 'feature/x')).not.toBe(projectIdFor('octo', 'repo', 'feature-x'));
    expect(projectIdFor('octo', 'repo', 'feature_x')).not.toBe(projectIdFor('octo', 'repo', 'feature-x'));
    const first = projectIdFor('octo', 'repo', 'a'.repeat(100));
    const second = projectIdFor('octo', 'repo', `${'a'.repeat(99)}b`);
    expect(first.length).toBeLessThanOrEqual(64);
    expect(second.length).toBeLessThanOrEqual(64);
    expect(first).not.toBe(second);
  });

  it('opens public and private repositories while preserving bytes and skipping gitlinks', async () => {
    api.getRepository.mockResolvedValue({ owner: 'octo', repo: 'repo', defaultBranch: 'main', isPrivate: true });
    api.getBranchSha.mockResolvedValue('head-1');
    api.getCommit.mockResolvedValue({ sha: 'head-1', treeSha: 'tree-1', parents: [], message: 'initial' });
    api.getTreeFiles.mockResolvedValue([
      entry('README.md'),
      entry('vendor', 'gitlink', '160000'),
      entry('asset.bin', 'sha-asset')
    ]);
    api.getBlobContents.mockImplementation(async (_owner: string, _repo: string, sha: string) =>
      sha === 'sha-asset' ? new Uint8Array([0, 255]) : bytes('# repo\n')
    );
    const opened = await remote.open('octo', 'repo');
    expect(opened.record.private).toBe(true);
    expect(opened.record.remoteHead).toBe('head-1');
    expect(opened.files).toEqual([file('README.md', '# repo\n'), file('asset.bin', [0, 255])]);
  });

  it('pulls non-overlapping local and remote changes through a three-way merge', async () => {
    const base = [file('a.txt', 'base'), file('b.txt', 'base')];
    const local = [file('a.txt', 'local'), file('b.txt', 'base')];
    const remoteFiles = [file('a.txt', 'base'), file('b.txt', 'remote'), file('c.txt', 'new')];
    const result = await remote.pull(
      record({ remoteEntries: [entry('a.txt'), entry('b.txt')], remoteHead: 'head-1' }),
      local,
      true,
      {
        record: record({
          remoteHead: 'head-2',
          remoteTree: 'tree-2',
          remoteEntries: [entry('a.txt'), entry('b.txt'), entry('c.txt')]
        }),
        files: remoteFiles
      }
    );
    expect(result.files).toEqual([file('a.txt', 'local'), file('b.txt', 'remote'), file('c.txt', 'new')]);
    expect(result.record.remoteHead).toBe('head-2');
    void base;
  });

  it('reports every conflicting path without changing the supplied snapshot', async () => {
    const local = [file('a.txt', 'local'), file('b.txt', 'local-b')];
    const remoteFiles = [file('a.txt', 'remote'), file('b.txt', 'remote-b')];
    await expect(
      remote.pull(record(), local, true, { record: record({ remoteHead: 'head-2' }), files: remoteFiles })
    ).rejects.toThrow('a.txt, b.txt');
    expect(local).toEqual([file('a.txt', 'local'), file('b.txt', 'local-b')]);
  });

  it('preserves local additions and remote deletions when they do not conflict', async () => {
    const result = await remote.pull(
      record({ remoteEntries: [entry('a.txt'), entry('b.txt')] }),
      [file('a.txt', 'base'), file('local.txt', 'local')],
      true,
      { record: record({ remoteHead: 'head-2', remoteEntries: [entry('a.txt')] }), files: [file('a.txt', 'remote')] }
    );
    expect(result.files).toEqual([file('a.txt', 'remote'), file('local.txt', 'local')]);
  });

  it('returns local files without downloading a new base when the remote head is unchanged', async () => {
    const local = [file('a.txt', 'edited')];
    const result = await remote.pull(record(), local, true, { record: record(), files: [file('a.txt', 'base')] });
    expect(result.files).toEqual(local);
    expect(api.getBlobContents).not.toHaveBeenCalled();
  });

  it('uses the remote snapshot directly when the local worktree is clean', async () => {
    const remoteOpen = {
      record: record({
        remoteHead: 'head-2',
        remoteTree: 'tree-2',
        remoteEntries: [entry('a.txt', 'sha-remote')]
      }),
      files: [file('a.txt', 'remote')]
    };
    const result = await remote.pull(record(), [file('a.txt', 'local')], false, remoteOpen);
    expect(result).toEqual(remoteOpen);
    expect(api.getBlobContents).not.toHaveBeenCalled();
  });

  it('pushes inline text, binary blobs, deletions and the expected parent', async () => {
    api.getBranchSha.mockResolvedValue('head-1');
    api.createBlob.mockResolvedValue('blob-bin');
    api.createTree.mockResolvedValue('tree-2');
    api.createCommit.mockResolvedValue('head-2');
    const result = await remote.push(record(), [file('a.txt', 'changed'), file('image.bin', [0, 255])], 'update');
    expect(api.createBlob).toHaveBeenCalledWith('octo', 'repo', new Uint8Array([0, 255]));
    expect(api.createTree).toHaveBeenCalledWith('octo', 'repo', 'tree-1', [
      { path: 'a.txt', mode: '100644', content: 'changed' },
      { path: 'image.bin', mode: '100644', sha: 'blob-bin' },
      { path: 'b.txt', sha: null }
    ]);
    expect(api.createCommit).toHaveBeenCalledWith('octo', 'repo', 'update', 'tree-2', ['head-1']);
    expect(api.updateRef).toHaveBeenCalledWith('octo', 'repo', 'heads/main', 'head-2');
    expect(result).toEqual({ head: 'head-2', tree: 'tree-2' });
  });

  const fresh = () => record({ remoteHead: null, remoteTree: null, remoteEntries: [] });

  it('publishes the first committed file to an empty default branch, then advances it without force', async () => {
    api.getRepository.mockResolvedValue({ defaultBranch: 'main' });
    api.listBranches.mockResolvedValue([]);
    api.createInitialFile.mockResolvedValue({ head: 'first', tree: 'first-tree' });
    api.getBranchSha.mockResolvedValue('first');
    api.createTree.mockResolvedValue('full-tree');
    api.createCommit.mockResolvedValue('full-head');
    const files = [file('a', [0, 255]), file('b', 'text')];
    await expect(remote.push(fresh(), files, 'initial')).resolves.toEqual({ head: 'full-head', tree: 'full-tree' });
    expect(api.createInitialFile).toHaveBeenCalledWith('octo', 'repo', 'main', 'a', files[0].bytes, 'initial');
    expect(api.createTree).toHaveBeenCalledWith('octo', 'repo', 'first-tree', [
      { path: 'b', mode: '100644', content: 'text' }
    ]);
    expect(api.updateRef).toHaveBeenCalledWith('octo', 'repo', 'heads/main', 'full-head');
  });

  it('publishes a new branch without touching an existing ref or stripping a UTF-8 BOM', async () => {
    api.getRepository.mockResolvedValue({ defaultBranch: 'main' });
    api.listBranches.mockResolvedValue([{ name: 'main', sha: 'latest' }]);
    api.createTree.mockResolvedValue('tree');
    api.createCommit.mockResolvedValue('topic-head');
    await remote.push({ ...fresh(), branch: 'topic' }, [file('text', '\ufefftext')], 'publish', 'base');
    expect(api.createTree).toHaveBeenCalledWith('octo', 'repo', null, [
      { path: 'text', mode: '100644', content: '\ufefftext' }
    ]);
    expect(api.createCommit).toHaveBeenCalledWith('octo', 'repo', 'publish', 'tree', ['base']);
    expect(api.createRef).toHaveBeenCalledWith('octo', 'repo', 'topic', 'topic-head');
    expect(api.updateRef).not.toHaveBeenCalled();
  });

  it('requires integration before the first push to an existing remote even after fetch', async () => {
    api.getRepository.mockResolvedValue({ defaultBranch: 'main' });
    api.listBranches.mockResolvedValue([{ name: 'main', sha: 'upstream' }]);
    await expect(
      remote.push({ ...fresh(), fetched: { branch: 'main', head: 'upstream' } }, [file('mine', '1')], 'first')
    ).rejects.toThrow('先拉取');
    expect(api.createInitialFile).not.toHaveBeenCalled();
    expect(api.updateRef).not.toHaveBeenCalled();
  });

  it('rejects a changed remote head before creating a remote commit', async () => {
    api.getBranchSha.mockResolvedValue('head-2');
    await expect(remote.push(record(), [file('a.txt', 'changed')], 'update')).rejects.toThrow('远端分支已变化');
    expect(api.createTree).not.toHaveBeenCalled();
  });

  it('rejects unsupported remote modes, collisions and local resource limits', async () => {
    api.getRepository.mockRejectedValue(new GitHubApiError('not_found', 'missing', 404));
    await expect(remote.open('octo', 'repo', 'main')).rejects.toMatchObject({
      message: expect.stringContaining('仓库不存在')
    });
    api.getRepository.mockResolvedValue({ owner: 'octo', repo: 'repo', defaultBranch: 'main', isPrivate: false });
    api.getBranchSha.mockResolvedValue('head-1');
    api.getCommit.mockResolvedValue({ sha: 'head-1', treeSha: 'tree-1', parents: [], message: 'initial' });
    api.getTreeFiles.mockResolvedValue([entry('script.sh', 'sha', '100755')]);
    await expect(remote.open('octo', 'repo')).rejects.toThrow('模式不受支持');
    await expect(
      remote.pull(
        record(),
        Array.from({ length: GIT_WORKBENCH_LIMITS.files + 1 }, (_, index) => file(`f${index}`, 'x')),
        false,
        { record: record({ remoteHead: 'head-2' }), files: [] }
      )
    ).rejects.toThrow('文件数超过');
  });
});

describe('GitHub repository directory store', () => {
  it('atomically saves, removes and refreshes records changed by another tab', async () => {
    const external = new Subject<readonly string[]>();
    let records: GithubRepositoryRecord[] = [];
    const preferences = {
      ready: Promise.resolve(),
      external$: external.asObservable(),
      get: vi.fn(() => records),
      update: vi.fn(
        async (
          _key: string,
          _guard: unknown,
          updater: (current: GithubRepositoryRecord[]) => GithubRepositoryRecord[]
        ) => {
          records = updater(records);
        }
      )
    };
    configureServices([GithubRepositoryStore, { provide: Preferences, useValue: preferences }]);
    const store = TestBed.inject(GithubRepositoryStore);
    const one = record({ projectId: 'one', updatedAt: 1 });
    const two = record({ projectId: 'two', updatedAt: 2 });
    await store.put(one);
    await store.put(two);
    expect(store.records().map(item => item.projectId)).toEqual(['two', 'one']);
    records = [two];
    external.next(['github:repositories']);
    expect(store.records()).toEqual([two]);
    await store.remove('two');
    expect(records).toEqual([]);
  });
});
