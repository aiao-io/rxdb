// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubApi } from './github-api.js';
import { GitHubApiError } from './github-api.js';
import { parseGitHubRepository, requestGitHubRepository } from './github-picker.js';

function makeApi(): { [K in keyof GitHubApi]: ReturnType<typeof vi.fn> } {
  return {
    getAuthenticatedUser: vi.fn(),
    searchRepositories: vi.fn(async () => []),
    listMyRepositories: vi.fn(async () => []),
    getRepository: vi.fn(),
    listBranches: vi.fn(async () => []),
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
    quota: vi.fn(),
    clearCache: vi.fn()
  };
}

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('parseGitHubRepository', () => {
  it('parses owner/repo, URLs, tree branches and strips .git', () => {
    expect(parseGitHubRepository('octo/repo')).toEqual({ owner: 'octo', repo: 'repo' });
    expect(parseGitHubRepository('https://github.com/octo/repo')).toEqual({ owner: 'octo', repo: 'repo' });
    expect(parseGitHubRepository('https://github.com/octo/repo/tree/feature/x')).toEqual({
      owner: 'octo',
      repo: 'repo',
      branch: 'feature/x'
    });
    expect(parseGitHubRepository('https://github.com/octo/repo.git')).toEqual({ owner: 'octo', repo: 'repo' });
  });

  it('rejects non-github URLs and free text', () => {
    expect(parseGitHubRepository('hello')).toBeNull();
    expect(parseGitHubRepository('https://gitlab.com/octo/repo')).toBeNull();
    expect(parseGitHubRepository('')).toBeNull();
  });
});

describe('requestGitHubRepository', () => {
  let api: ReturnType<typeof makeApi>;
  let host: HTMLElement;

  beforeEach(() => {
    api = makeApi();
    host = document.createElement('div');
    document.body.append(host);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    host.remove();
  });

  const dialog = (): HTMLDialogElement => host.querySelector('dialog')!;
  const clickItem = async (index = 0): Promise<void> => {
    const items = dialog().querySelectorAll<HTMLButtonElement>('.wb-github-item');
    items[index].click();
    await flush();
  };

  it('lists my repositories for an empty query and opens the selected default branch', async () => {
    api.listMyRepositories.mockResolvedValue([
      { fullName: 'octo/one', description: 'demo', stars: 1, cloneUrl: '', isPrivate: false }
    ]);
    api.getRepository.mockResolvedValue({ owner: 'octo', repo: 'one', defaultBranch: 'main', isPrivate: false });
    api.listBranches.mockResolvedValue([
      { name: 'feature', sha: 'sha-feature' },
      { name: 'main', sha: 'sha-main' }
    ]);
    const pending = requestGitHubRepository(host, api as unknown as GitHubApi);
    await flush();
    expect(api.listMyRepositories).toHaveBeenCalledOnce();
    expect(dialog().querySelector('.wb-github-item-name')?.textContent).toBe('octo/one');

    await clickItem();
    expect(api.getRepository).toHaveBeenCalledWith('octo', 'one');
    expect(api.listBranches).toHaveBeenCalledWith('octo', 'one');
    const branches = [...dialog().querySelectorAll<HTMLButtonElement>('.wb-github-item')];
    expect(branches.map(button => button.querySelector('.wb-github-item-name')?.textContent)).toEqual([
      'main',
      'feature'
    ]);

    dialog().querySelector<HTMLButtonElement>('.wb-github-open')!.click();
    await expect(pending).resolves.toEqual({ owner: 'octo', repo: 'one', branch: 'main' });
    expect(host.querySelector('dialog')).toBeNull();
  });

  it('searches repositories after a debounce and guards stale responses', async () => {
    let resolveFirst!: (
      value: { fullName: string; description: null; stars: number; cloneUrl: string; isPrivate: boolean }[]
    ) => void;
    api.searchRepositories
      .mockImplementationOnce(() => new Promise(resolve => (resolveFirst = resolve)))
      .mockResolvedValueOnce([{ fullName: 'octo/two', description: null, stars: 2, cloneUrl: '', isPrivate: true }]);
    void requestGitHubRepository(host, api as unknown as GitHubApi);
    const input = dialog().querySelector<HTMLInputElement>('input')!;
    input.value = 'one';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);
    expect(api.searchRepositories).toHaveBeenCalledWith('one');

    input.value = 'two';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);
    resolveFirst([{ fullName: 'octo/one', description: null, stars: 1, cloneUrl: '', isPrivate: false }]);
    await flush();
    expect(dialog().querySelector('.wb-github-item-name')?.textContent).toBe('octo/two');
  });

  it('resolves pasted URLs directly without searching', async () => {
    api.getRepository.mockResolvedValue({ owner: 'octo', repo: 'direct', defaultBranch: 'main', isPrivate: false });
    api.listBranches.mockResolvedValue([{ name: 'main', sha: 'sha-main' }]);
    const pending = requestGitHubRepository(host, api as unknown as GitHubApi);
    const input = dialog().querySelector<HTMLInputElement>('input')!;
    input.value = 'https://github.com/octo/direct';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(300);
    expect(api.searchRepositories).not.toHaveBeenCalled();
    expect(api.getRepository).toHaveBeenCalledWith('octo', 'direct');
    await flush();
    await clickItem();
    dialog().querySelector<HTMLButtonElement>('.wb-github-open')!.click();
    await expect(pending).resolves.toEqual({ owner: 'octo', repo: 'direct', branch: 'main' });
  });

  it('shows API failures inside the dialog and keeps it open', async () => {
    api.listMyRepositories.mockRejectedValue(new GitHubApiError('auth_required', '登录凭据无效', 401));
    void requestGitHubRepository(host, api as unknown as GitHubApi);
    await flush();
    expect(dialog().querySelector('.wb-github-error')?.textContent).toBe('登录凭据无效');
    expect(dialog().open).toBe(true);
  });

  it('resolves null on cancel', async () => {
    const pending = requestGitHubRepository(host, api as unknown as GitHubApi);
    await flush();
    dialog().querySelector<HTMLButtonElement>('.wb-dialog-actions button')!.click();
    await expect(pending).resolves.toBeNull();
    expect(host.querySelector('dialog')).toBeNull();
  });

  it('offers login on authentication failures when wired', async () => {
    api.listMyRepositories.mockRejectedValue(new GitHubApiError('auth_required', '需要登录', 401));
    const onLogin = vi.fn();
    void requestGitHubRepository(host, api as unknown as GitHubApi, { onLogin });
    await flush();
    const button = [...dialog().querySelectorAll('button')].find(item => item.textContent === '登录 GitHub');
    expect(button).toBeDefined();
    button!.click();
    expect(onLogin).toHaveBeenCalledOnce();
  });

  it('omits the login button without a hook', async () => {
    api.listMyRepositories.mockRejectedValue(new GitHubApiError('auth_required', '需要登录', 401));
    void requestGitHubRepository(host, api as unknown as GitHubApi);
    await flush();
    expect([...dialog().querySelectorAll('button')].some(item => item.textContent === '登录 GitHub')).toBe(false);
  });
});
