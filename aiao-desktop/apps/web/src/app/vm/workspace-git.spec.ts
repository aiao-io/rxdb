import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GithubWorkspace } from '../services/github-workspace';
import { runWorkspaceGit } from './workspace-git';

const root = ['Users', 'dev', 'demo'];
const record = { rootPath: root, projectId: 'id', owner: 'octo', repo: 'demo' };
const workspace = {
  repositoryAt: vi.fn(),
  openDirectory: vi.fn(),
  status: vi.fn(),
  stage: vi.fn(),
  snapshot: vi.fn(),
  diffText: vi.fn(),
  commit: vi.fn(),
  createBranch: vi.fn(),
  deleteBranch: vi.fn(),
  checkout: vi.fn(),
  branches: vi.fn(),
  history: vi.fn(),
  configureRemote: vi.fn(),
  fetch: vi.fn(),
  pull: vi.fn(),
  push: vi.fn(),
  localCommand: vi.fn()
};
const run = (...args: string[]) =>
  runWorkspaceGit(workspace as unknown as GithubWorkspace, { cwd: '/Users/dev/demo', args });

describe('桌面终端 Git', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    workspace.repositoryAt.mockResolvedValue(record);
    workspace.history.mockResolvedValue([{ oid: 'abcdef1234', message: 'first' }]);
    workspace.branches.mockResolvedValue([
      { current: true, name: 'main' },
      { current: false, name: 'topic' }
    ]);
    workspace.status.mockResolvedValue({
      branch: 'main',
      head: 'abcdef1234',
      raw: ' M src/a',
      entries: [{ path: 'src/a' }]
    });
    workspace.snapshot.mockResolvedValue({ files: [] });
    workspace.localCommand.mockResolvedValue({ exitCode: 0, stdout: 'native', stderr: '' });
  });
  it('在子目录中找仓库，成功与失败经 stdout、stderr 和退出码分别返回', async () => {
    expect((await run('--help')).stdout).toContain('usage: git');
    expect((await run('--version')).code).toBe(0);
    expect((await run('-C', 'src', 'rev-parse', '--show-toplevel')).stdout).toBe('/Users/dev/demo\n');
    expect((await run('rev-parse', 'HEAD')).stdout).toBe('abcdef1234\n');
    expect((await run('init', '.')).stdout).toContain('Reinitialized');
    expect((await run('status', '-s')).stdout).toBe(' M src/a\n');
    expect((await run('status')).stdout).toContain('On branch main');
    expect((await run('add', 'src')).code).toBe(0);
    expect(workspace.stage).toHaveBeenCalledWith('id', ['src/a']);
    await run('add', '-A');
    expect((await run('add', '../other')).stderr).toContain('outside');
    expect((await run('add', 'missing')).stderr).toContain('pathspec');
    workspace.diffText.mockResolvedValue('diff');
    expect((await run('diff', '--cached')).stdout).toContain('diff');
    workspace.commit.mockResolvedValue('abcdef1234');
    expect((await run('commit', '-m', 'first')).stdout).toContain('[main abcdef1]');
    expect((await run('branch')).stdout).toContain('* main');
    await run('branch', 'topic');
    await run('switch', '-c', 'topic');
    await run('checkout', 'topic');
    await run('branch', '-d', 'topic');
    expect(workspace.deleteBranch).toHaveBeenCalledWith('id', 'topic');
    expect((await run('log', '--oneline')).stdout).toContain('abcdef1 first');
    expect((await run('ls-files')).stdout).toBe('native');
    expect((await run('config', 'user.name', 'test')).stdout).toBe('native');
    workspace.repositoryAt.mockResolvedValue(undefined);
    expect(await run('status')).toMatchObject({
      code: 1,
      stdout: '',
      stderr: expect.stringContaining('not a git repository')
    });
  });
  it('仓库坐标和同步都交给共享工作区，同一终端可读回 origin', async () => {
    expect((await run('remote')).stdout).toBe('origin\n');
    expect((await run('remote', '-v')).stdout).toContain('https://github.com/octo/demo.git (push)');
    expect((await run('remote', 'get-url', 'origin')).stdout).toContain('demo.git');
    await run('remote', 'remove', 'origin');
    expect(workspace.configureRemote).toHaveBeenCalledWith('id', null);
    workspace.repositoryAt.mockResolvedValue({ ...record, owner: null, repo: null });
    expect((await run('remote')).stdout).toBe('');
    await run('remote', 'add', 'origin', 'https://github.com/octo/demo.git');
    expect(workspace.configureRemote).toHaveBeenLastCalledWith('id', 'https://github.com/octo/demo.git');
    workspace.fetch.mockResolvedValue({ name: 'demo', branch: 'main', head: 'abc' });
    expect((await run('fetch', 'origin')).stdout).toContain('abc');
    workspace.fetch.mockResolvedValue({ name: 'demo', branch: 'main', head: null });
    expect((await run('fetch', 'origin')).stdout).toContain('No remote branch main');
    await run('pull', 'origin', 'main');
    await run('push', 'origin');
    expect(workspace.push).toHaveBeenCalledWith('id', 'first');
    expect((await run('push', 'origin', 'other')).code).toBe(1);
  });
});
