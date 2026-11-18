// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubAuth, GitHubSession } from './github-auth.js';
import { requestGitHubLogin } from './github-login.js';
import { oauthDoneKey } from './github-oauth-bridge.js';

const SESSION: GitHubSession = { token: 'ghp_abc', login: 'octo', avatarUrl: null, provider: 'pat' };
const DESKTOP = 'https://desktop.aiao.io';
const OAUTH = {
  authorizeUrl: 'https://github.com/login/oauth/authorize?client_id=x',
  state: 'https://ide.example/github-callback?nonce=abcd1234abcd1234',
  verifier: 'verifier-1'
};

const pendingStorage = vi.hoisted(() => ({ save: vi.fn(async () => undefined) }));
vi.mock('./github-session-store.js', () => ({ createIndexedDbSecretStore: () => pendingStorage }));

function fakeAuth() {
  return {
    getSession: vi.fn<GitHubAuth['getSession']>(async () => null),
    loginWithPat: vi.fn<GitHubAuth['loginWithPat']>(async () => SESSION),
    beginOAuth: vi.fn<GitHubAuth['beginOAuth']>(),
    completeOAuth: vi.fn<GitHubAuth['completeOAuth']>(),
    refresh: vi.fn<GitHubAuth['refresh']>(async () => null),
    logout: vi.fn<GitHubAuth['logout']>(async () => undefined),
    subscribe: vi.fn<GitHubAuth['subscribe']>(() => () => undefined)
  };
}

describe('requestGitHubLogin', () => {
  let auth: ReturnType<typeof fakeAuth>;
  let host: HTMLElement;

  beforeEach(() => {
    pendingStorage.save.mockClear();
    auth = fakeAuth();
    host = document.createElement('div');
    document.body.append(host);
    localStorage.clear();
  });

  afterEach(() => {
    host.remove();
    vi.useRealTimers();
  });

  const dialog = (): HTMLDialogElement => host.querySelector('dialog')!;
  const flush = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
  };

  it('shows the logged-out form and logs in with a PAT', async () => {
    const pending = requestGitHubLogin(host, { auth });
    await flush();
    expect(dialog().querySelector('input[type=password]')).not.toBeNull();
    expect(dialog().querySelector('button')).not.toBeNull();

    (dialog().querySelector('input') as HTMLInputElement).value = 'ghp_abc';
    const login = [...dialog().querySelectorAll('button')].find(button => button.textContent === '登录')!;
    login.click();
    await flush();
    expect(auth.loginWithPat).toHaveBeenCalledWith('ghp_abc');
    expect(dialog().querySelector('.wb-github-account-name')?.textContent).toBe('octo');
    [...dialog().querySelectorAll('button')].find(button => button.textContent === '关闭')!.click();
    await expect(pending).resolves.toBeUndefined();
  });

  it('嵌入环境说明 OAuth 限制，同时保留 PAT 登录', async () => {
    const pending = requestGitHubLogin(host, { auth, oauthUnavailable: '桌面窗口暂不支持 OAuth，请使用 PAT' });
    await flush();
    expect(dialog().textContent).toContain('桌面窗口暂不支持 OAuth');
    const oauth = [...dialog().querySelectorAll('button')].find(
      button => button.textContent === '使用 GitHub 账号登录'
    )!;
    expect(oauth.disabled).toBe(true);
    oauth.click();
    expect(auth.beginOAuth).not.toHaveBeenCalled();
    dialog().querySelector<HTMLInputElement>('input')!.value = 'ghp_abc';
    [...dialog().querySelectorAll('button')].find(button => button.textContent === '登录')!.click();
    await flush();
    expect(auth.loginWithPat).toHaveBeenCalledWith('ghp_abc');
    [...dialog().querySelectorAll('button')].find(button => button.textContent === '关闭')!.click();
    await pending;
  });

  it('桌面 OAuth 在授权按钮的点击中请宿主打开，并在原窗口交换授权码', async () => {
    const authorize = vi.fn(async () => 'returned-code');
    const open = vi.spyOn(window, 'open');
    auth.beginOAuth.mockResolvedValue(OAUTH);
    auth.completeOAuth.mockResolvedValue({ ...SESSION, provider: 'oauth' });
    const pending = requestGitHubLogin(host, { auth, desktopOAuth: { origin: DESKTOP, authorize } });
    const button = () => [...dialog().querySelectorAll('button')].find(b => b.textContent === '使用 GitHub 账号登录');
    await vi.waitFor(() => expect(button()?.disabled).toBe(false));
    expect(auth.beginOAuth).toHaveBeenCalledWith(DESKTOP);
    button()!.click();
    expect(authorize).toHaveBeenCalledWith(OAUTH.authorizeUrl, expect.any(AbortSignal));
    await vi.waitFor(() => expect(dialog().textContent).toContain('已连接 GitHub（OAuth）'));
    expect(auth.completeOAuth).toHaveBeenCalledWith('returned-code', OAUTH.verifier, expect.any(AbortSignal));
    expect(pendingStorage.save).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    dialog().querySelector<HTMLButtonElement>('.wb-dialog-actions button:last-child')!.click();
    await pending;
    open.mockRestore();
  });

  it('关闭登录框取消宿主请求，迟到的授权码不建立会话', async () => {
    const result = Promise.withResolvers<string>();
    const authorize = vi.fn((_url: string, _signal: AbortSignal) => result.promise);
    auth.beginOAuth.mockResolvedValue(OAUTH);
    const pending = requestGitHubLogin(host, { auth, desktopOAuth: { origin: DESKTOP, authorize } });
    const button = () => [...dialog().querySelectorAll('button')].find(b => b.textContent === '使用 GitHub 账号登录');
    await vi.waitFor(() => expect(button()?.disabled).toBe(false));
    button()!.click();
    dialog().querySelector<HTMLButtonElement>('.wb-dialog-actions button')!.click();
    await pending;
    expect(authorize.mock.calls[0][1].aborted).toBe(true);
    result.resolve('late-code');
    await flush();
    expect(auth.completeOAuth).not.toHaveBeenCalled();
  });

  it('shows login failures inside the dialog', async () => {
    auth.loginWithPat.mockRejectedValueOnce(Object.assign(new Error('登录凭据无效'), { code: 'auth_invalid' }));
    void requestGitHubLogin(host, { auth });
    await flush();
    (dialog().querySelector('input') as HTMLInputElement).value = 'bad';
    [...dialog().querySelectorAll('button')].find(button => button.textContent === '登录')!.click();
    await flush();
    expect(dialog().querySelector('.wb-github-error')?.textContent).toBe('登录凭据无效');
    expect(dialog().open).toBe(true);
  });

  it('shows the account and logs out back to the form', async () => {
    auth.getSession.mockResolvedValue(SESSION);
    void requestGitHubLogin(host, { auth });
    await flush();
    expect(dialog().querySelector('.wb-github-account-name')?.textContent).toBe('octo');
    [...dialog().querySelectorAll('button')].find(button => button.textContent === '登出')!.click();
    await flush();
    expect(auth.logout).toHaveBeenCalledOnce();
    expect(dialog().querySelector('input[type=password]')).not.toBeNull();
  });

  it('surfaces unconfigured OAuth instead of opening anything', async () => {
    auth.beginOAuth.mockRejectedValueOnce(new Error('尚未配置 clientId'));
    void requestGitHubLogin(host, { auth });
    await flush();
    [...dialog().querySelectorAll('button')].find(button => button.textContent === '使用 GitHub 账号登录')!.click();
    await flush();
    expect(dialog().querySelector('.wb-github-error')?.textContent).toBe('尚未配置 clientId');
  });

  it('persists OAuth before opening the popup and updates the account on storage events', async () => {
    const openAuthorize = vi.fn();
    auth.beginOAuth.mockResolvedValue({
      authorizeUrl: 'https://github.com/login/oauth/authorize?client_id=x',
      state: 'https://ide.example/github-callback?nonce=abcd1234abcd1234',
      verifier: 'verifier-1'
    });
    void requestGitHubLogin(host, { auth, openAuthorize });
    await flush();
    [...dialog().querySelectorAll('button')].find(button => button.textContent === '使用 GitHub 账号登录')!.click();
    await vi.waitFor(() =>
      expect(openAuthorize).toHaveBeenCalledWith('https://github.com/login/oauth/authorize?client_id=x')
    );
    expect(pendingStorage.save).toHaveBeenCalledWith(expect.objectContaining({ verifier: 'verifier-1' }));
    expect(dialog().querySelector('.wb-github-waiting')).not.toBeNull();

    auth.refresh.mockResolvedValue({ token: 'gho_oauth', login: 'octo', avatarUrl: null, provider: 'oauth' });
    window.dispatchEvent(new StorageEvent('storage', { key: oauthDoneKey() }));
    await flush();
    expect(auth.refresh).toHaveBeenCalledOnce();
    expect(dialog().querySelector('.wb-github-account-name')?.textContent).toBe('octo');
  });

  it('does not open an OAuth popup when sealed storage fails', async () => {
    const openAuthorize = vi.fn();
    auth.beginOAuth.mockResolvedValue({
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      state: 'https://ide.example/github-callback?nonce=x',
      verifier: 'private-verifier'
    });
    pendingStorage.save.mockRejectedValueOnce(new Error('storage unavailable'));
    void requestGitHubLogin(host, { auth, openAuthorize });
    await flush();
    [...dialog().querySelectorAll('button')].find(button => button.textContent === '使用 GitHub 账号登录')!.click();
    await vi.waitFor(() => expect(dialog().querySelector('.wb-github-error')?.textContent).toBe('storage unavailable'));
    expect(openAuthorize).not.toHaveBeenCalled();
  });

  it('polls for the OAuth result as a fallback channel', async () => {
    vi.useFakeTimers();
    auth.beginOAuth.mockResolvedValue({
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      state: 'https://ide.example/github-callback?nonce=x',
      verifier: 'v'
    });
    void requestGitHubLogin(host, { auth });
    await flush();
    [...dialog().querySelectorAll('button')].find(button => button.textContent === '使用 GitHub 账号登录')!.click();
    await flush();
    auth.refresh.mockResolvedValue(SESSION);
    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    expect(auth.refresh).toHaveBeenCalled();
    expect(dialog().querySelector('.wb-github-account-name')?.textContent).toBe('octo');
  });

  it('removes the dialog on close without resolving anything pending', async () => {
    const pending = requestGitHubLogin(host, { auth });
    await flush();
    dialog().querySelector<HTMLButtonElement>('.wb-dialog-actions button')!.click();
    await expect(pending).resolves.toBeUndefined();
    expect(host.querySelector('dialog')).toBeNull();
  });
});
