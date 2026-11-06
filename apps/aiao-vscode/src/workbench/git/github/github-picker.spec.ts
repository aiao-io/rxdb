// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubApi } from './github-api.js';
import { GitHubApiError } from './github-api.js';
import {
  parseGitHubRepository,
  requestGitHubRepository,
  type GitHubRepositoryRequestOptions
} from './github-picker.js';

function makeApi(): { [K in keyof GitHubApi]: ReturnType<typeof vi.fn> } {
  return {
    getAuthenticatedUser: vi.fn(),
    searchRepositories: vi.fn(async () => []),
    listMyRepositories: vi.fn(async () => []),
    getRepository: vi.fn(async (owner: string, repo: string) => ({ owner, repo, defaultBranch: 'main', isPrivate: false })),
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
    quota: vi.fn(),
    clearCache: vi.fn()
  };
}

const repository = (fullName: string) => ({ fullName, description: '仓库说明', stars: 1, cloneUrl: '', isPrivate: false });
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('parseGitHubRepository', () => {
  it.each([
    [' octo/repo ', { owner: 'octo', repo: 'repo' }],
    ['https://github.com/octo/repo/', { owner: 'octo', repo: 'repo' }],
    ['https://github.com/octo/repo.git', { owner: 'octo', repo: 'repo' }],
    ['https://github.com/octo/repo/tree/feature/x', { owner: 'octo', repo: 'repo', branch: 'feature/x' }],
    ['https://github.com/octo/repo/tree/feature%2Fx', { owner: 'octo', repo: 'repo', branch: 'feature/x' }]
  ])('解析合法仓库坐标 %s', (value, expected) => {
    expect(parseGitHubRepository(value)).toEqual(expected);
  });

  it.each([
    '', 'hello', 'http://github.com/octo/repo', 'https://gitlab.com/octo/repo',
    'https://github.com.evil.example/octo/repo', 'https://name@github.com/octo/repo',
    'https://github.com:8443/octo/repo', 'https//github.com/octo/repo', 'git@github.com:octo/repo.git',
    'octo/repo/extra', 'https://github.com/octo/repo/blob/main/a.ts', 'https://github.com/octo/repo/pull/1',
    'https://github.com/octo/repo/tree/', 'https://github.com/octo/repo/tree/%ZZ', 'octo/repo name'
  ])('拒绝非法地址或非仓库路径 %s', value => {
    expect(parseGitHubRepository(value)).toBeNull();
  });
});

describe('打开远程仓库Quick Pick', () => {
  let api: ReturnType<typeof makeApi>;
  let host: HTMLElement;

  beforeEach(() => {
    api = makeApi();
    host = document.createElement('div');
    document.body.append(host);
    vi.useFakeTimers();
  });

  afterEach(() => {
    host.querySelector<HTMLDialogElement>('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }));
    vi.useRealTimers();
    host.remove();
  });

  const dialog = (): HTMLDialogElement => host.querySelector('dialog')!;
  const input = (): HTMLInputElement => dialog().querySelector('input')!;
  const begin = (options: GitHubRepositoryRequestOptions = {}) => requestGitHubRepository(host, api as unknown as GitHubApi, options);
  const choose = async (action: string): Promise<void> => {
    dialog().querySelector<HTMLButtonElement>(`[data-github-action="${action}"]`)!.click();
    await flush();
  };
  const type = (value: string): void => {
    input().value = value;
    input().dispatchEvent(new Event('input'));
  };
  const key = (value: string, composing = false): void => {
    input().dispatchEvent(new KeyboardEvent('keydown', { key: value, isComposing: composing, bubbles: true, cancelable: true }));
  };

  it('首屏只展示提供程序和最近远端，选择GitHub后才请求我的仓库', async () => {
    api.listMyRepositories.mockResolvedValue([repository('octo/one')]);
    void begin({ recentRepositories: [{ owner: 'team', repo: 'recent', branch: 'release' }] });
    await flush();
    expect(dialog().classList.contains('wb-github-picker')).toBe(true);
    expect(input().placeholder).toBe('输入远程 URL，或选择远程提供程序');
    expect(api.listMyRepositories).not.toHaveBeenCalled();
    expect(dialog().querySelector('[data-github-action="provider"]')?.textContent).toBe('从 GitHub 打开仓库');
    expect(dialog().querySelector('[data-github-action="recent"]')?.textContent).toContain('team/recent');
    expect(dialog().querySelector('[data-github-action="recent"]')?.textContent).toContain('release');
    await choose('provider');
    expect(api.listMyRepositories).toHaveBeenCalledOnce();
    expect(input().placeholder).toBe('选择仓库，或键入要搜索的组织或仓库名称');
    expect(dialog().querySelector('.wb-github-item-name')?.textContent).toBe('octo/one');
  });

  it('选择仓库直接打开默认分支，不查询分支也不出现确认步骤', async () => {
    api.listMyRepositories.mockResolvedValue([repository('octo/one')]);
    api.getRepository.mockResolvedValue({ owner: 'octo', repo: 'one', defaultBranch: 'develop', isPrivate: false });
    const pending = begin();
    await choose('provider');
    await choose('open');
    await expect(pending).resolves.toEqual({ owner: 'octo', repo: 'one', branch: 'develop' });
    expect(api.listBranches).not.toHaveBeenCalled();
    expect(host.querySelector('dialog')).toBeNull();
  });

  it('最近远端保留原分支并直接打开', async () => {
    const target = { owner: 'octo', repo: 'recent', branch: 'feature/x' };
    const pending = begin({ recentRepositories: [target] });
    await choose('recent');
    await expect(pending).resolves.toEqual(target);
    expect(api.getRepository).not.toHaveBeenCalled();
    expect(api.listMyRepositories).not.toHaveBeenCalled();
  });

  it.each(['octo/direct', 'https://github.com/octo/direct/tree/feature%2Fx'])('粘贴地址立即提供选项，Enter后查询元数据并打开 %s', async value => {
    const pending = begin();
    type(value);
    expect(api.getRepository).not.toHaveBeenCalled();
    expect(dialog().querySelector('[data-github-action="open"]')?.textContent).toContain('打开 octo/direct');
    key('Enter');
    await expect(pending).resolves.toEqual({ owner: 'octo', repo: 'direct', branch: value.includes('/tree/') ? 'feature/x' : 'main' });
    expect(api.getRepository).toHaveBeenCalledExactlyOnceWith('octo', 'direct');
    expect(api.searchRepositories).not.toHaveBeenCalled();
    expect(api.listBranches).not.toHaveBeenCalled();
  });

  it('非法远端地址显示提示，不发出仓库搜索或打开请求', async () => {
    void begin();
    type('https://gitlab.com/octo/repo');
    key('Enter');
    await vi.advanceTimersByTimeAsync(300);
    expect(dialog().querySelector('[role="status"]')?.textContent).toContain('有效');
    expect(api.getRepository).not.toHaveBeenCalled();
    expect(api.searchRepositories).not.toHaveBeenCalled();
  });

  it('输入事件立即使旧响应失效，debounce尚未结束时也不能回灌旧列表', async () => {
    let finish!: (value: ReturnType<typeof repository>[]) => void;
    api.listMyRepositories.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    api.searchRepositories.mockResolvedValue([repository('octo/new')]);
    void begin();
    await choose('provider');
    type('new');
    finish([repository('octo/stale')]);
    await flush();
    expect(dialog().textContent).not.toContain('octo/stale');
    expect(api.searchRepositories).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(api.searchRepositories).toHaveBeenCalledExactlyOnceWith('new');
    expect(dialog().querySelector('.wb-github-item-name')?.textContent).toBe('octo/new');
  });

  it('返回保留两个步骤的输入，再进提供程序恢复上次仓库查询', async () => {
    void begin();
    type('organization');
    await choose('provider');
    expect(api.searchRepositories).toHaveBeenCalledWith('organization');
    type('project');
    await vi.advanceTimersByTimeAsync(300);
    await choose('back');
    expect(input().value).toBe('organization');
    expect(document.activeElement).toBe(input());
    await choose('provider');
    expect(input().value).toBe('project');
    expect(api.searchRepositories).toHaveBeenCalledWith('project');
  });

  it('方向键维护active descendant，Enter选中项目且IME输入不误触发', async () => {
    const target = { owner: 'octo', repo: 'recent', branch: 'release' };
    const pending = begin({ recentRepositories: [target] });
    expect(input().getAttribute('role')).toBe('combobox');
    const list = dialog().querySelector('[role="listbox"]');
    expect(input().getAttribute('aria-controls')).toBe(list?.id);
    key('ArrowDown');
    const selected = dialog().querySelector('[role="option"][aria-selected="true"]');
    expect(selected?.getAttribute('data-github-action')).toBe('recent');
    expect(input().getAttribute('aria-activedescendant')).toBe(selected?.id);
    key('Enter', true);
    expect(dialog().open).toBe(true);
    key('ArrowUp');
    key('ArrowUp');
    key('Enter');
    await expect(pending).resolves.toEqual(target);
  });

  it.each(['Escape', 'cancel', 'outside'])('取消通过%s结束并归还焦点', async method => {
    const anchor = document.createElement('button');
    host.append(anchor);
    anchor.focus();
    const pending = begin();
    if (method === 'Escape') key('Escape');
    else if (method === 'cancel') await choose('cancel');
    else dialog().dispatchEvent(new PointerEvent('pointerdown', { clientX: -10, clientY: -10, bubbles: true }));
    await expect(pending).resolves.toBeNull();
    expect(host.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(anchor);
  });

  it('加载和空态通过aria-live播报，不提供可误接受的旧项目', async () => {
    let finish!: (value: never[]) => void;
    api.listMyRepositories.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = begin();
    await choose('provider');
    expect(dialog().querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite');
    expect(dialog().querySelector('[role="listbox"]')?.getAttribute('aria-busy')).toBe('true');
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
    key('Enter');
    finish([]);
    await flush();
    expect(dialog().querySelector('[role="status"]')?.textContent).toContain('没有');
    expect(dialog().querySelector('[role="listbox"]')?.getAttribute('aria-busy')).toBe('false');
    await choose('cancel');
    await expect(pending).resolves.toBeNull();
  });

  it('API失败保留原查询，可重试后选择结果', async () => {
    api.searchRepositories.mockRejectedValueOnce(new GitHubApiError('network_failed', '网络断开'))
      .mockResolvedValueOnce([repository('octo/retry')]);
    void begin();
    type('query');
    await choose('provider');
    expect(dialog().querySelector('.wb-github-error')?.textContent).toBe('网络断开');
    expect(input().value).toBe('query');
    await choose('retry');
    expect(api.searchRepositories).toHaveBeenCalledTimes(2);
    expect(dialog().querySelector('.wb-github-item-name')?.textContent).toBe('octo/retry');
  });

  it('认证失败等待登录完成后恢复原查询，登录期间不能重复接受', async () => {
    let finishLogin!: () => void;
    const onLogin = vi.fn(() => new Promise<void>(resolve => { finishLogin = resolve; }));
    api.searchRepositories.mockRejectedValueOnce(new GitHubApiError('auth_required', '请登录', 401))
      .mockResolvedValueOnce([repository('octo/recovered')]);
    void begin({ onLogin });
    type('original');
    await choose('provider');
    await choose('login');
    key('Enter');
    expect(onLogin).toHaveBeenCalledOnce();
    expect(api.searchRepositories).toHaveBeenCalledTimes(1);
    finishLogin();
    await flush();
    expect(api.searchRepositories).toHaveBeenLastCalledWith('original');
    expect(input().value).toBe('original');
    expect(dialog().querySelector('.wb-github-item-name')?.textContent).toBe('octo/recovered');
  });

  it('取消后忽略迟到的登录和仓库请求', async () => {
    let finishLogin!: () => void;
    const onLogin = vi.fn(() => new Promise<void>(resolve => { finishLogin = resolve; }));
    api.listMyRepositories.mockRejectedValueOnce(new GitHubApiError('auth_required', '请登录', 401));
    const pending = begin({ onLogin });
    await choose('provider');
    await choose('login');
    key('Escape');
    finishLogin();
    await flush();
    await expect(pending).resolves.toBeNull();
    expect(api.listMyRepositories).toHaveBeenCalledOnce();
    expect(host.querySelector('dialog')).toBeNull();
  });

  it('未提供登录回调时错误只提供重试入口', async () => {
    api.listMyRepositories.mockRejectedValueOnce(new GitHubApiError('auth_required', '请登录', 401));
    void begin();
    await choose('provider');
    expect(dialog().querySelector('[data-github-action="login"]')).toBeNull();
    expect(dialog().querySelector('[data-github-action="retry"]')).not.toBeNull();
  });
});
