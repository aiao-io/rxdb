// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubAuth, GitHubSession } from './github-auth.js';
import { requestGitHubLogin } from './github-login.js';
import { oauthDoneKey } from './github-oauth-bridge.js';

const SESSION: GitHubSession = { token: 'ghp_abc', login: 'octo', avatarUrl: null, provider: 'pat' };

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
