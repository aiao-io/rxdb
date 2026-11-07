// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubSession } from './github-auth.js';
import {
  clearPendingOAuth,
  completeOAuthCallback,
  loadPendingOAuth,
  oauthDoneKey,
  savePendingOAuth
} from './github-oauth-bridge.js';

const storage = vi.hoisted(() => {
  let value: unknown = null;
  return {
    load: vi.fn(async () => value),
    save: vi.fn(async (next: unknown) => {
      value = next;
    }),
    clear: vi.fn(async () => {
      value = null;
    })
  };
});
vi.mock('./github-session-store.js', () => ({ createIndexedDbSecretStore: () => storage }));

const PENDING = {
  verifier: 'verifier-1',
  nonce: 'abcd1234abcd1234',
  state: 'https://ide.example/github-callback?nonce=abcd1234abcd1234',
  at: Date.now()
};

const SESSION: GitHubSession = { token: 'gho_abc', login: 'octo', avatarUrl: null, provider: 'oauth' };

function fakeAuth() {
  return {
    getSession: vi.fn(async () => null),
    loginWithPat: vi.fn(),
    beginOAuth: vi.fn(),
    completeOAuth: vi.fn(async () => SESSION),
    refresh: vi.fn(async () => null),
    logout: vi.fn(async () => undefined),
    subscribe: vi.fn(() => () => undefined)
  };
}

describe('GitHub OAuth bridge', () => {
  beforeEach(async () => {
    localStorage.clear();
    await storage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses sealed storage with a TTL and removes legacy plaintext credentials', async () => {
    expect(await loadPendingOAuth()).toBeNull();
    localStorage.setItem('aiao-vscode.github-oauth-pending', JSON.stringify(PENDING));
    await savePendingOAuth(PENDING);
    expect(localStorage.getItem('aiao-vscode.github-oauth-pending')).toBeNull();
    expect(await loadPendingOAuth()).toEqual(PENDING);
    await savePendingOAuth({ ...PENDING, at: Date.now() - 11 * 60 * 1000 });
    expect(await loadPendingOAuth()).toBeNull();
    await storage.save('not-json');
    expect(await loadPendingOAuth()).toBeNull();
    await storage.save({ verifier: 1 });
    expect(await loadPendingOAuth()).toBeNull();
    await clearPendingOAuth();
    expect(await loadPendingOAuth()).toBeNull();
  });

  it('completes the callback when the state matches and notifies other tabs', async () => {
    const auth = fakeAuth();
    await savePendingOAuth(PENDING);
    const session = await completeOAuthCallback(auth, 'code-1', PENDING.state);
    expect(session).toBe(SESSION);
    expect(auth.completeOAuth).toHaveBeenCalledWith('code-1', 'verifier-1');
    expect(await loadPendingOAuth()).toBeNull();
    expect(localStorage.getItem(oauthDoneKey())).toMatch(/^\d+$/);
    expect(localStorage.getItem(oauthDoneKey())).not.toContain('octo');
  });

  it('rejects mismatched states and expired requests without touching the auth provider', async () => {
    const auth = fakeAuth();
    await savePendingOAuth(PENDING);
    await expect(
      completeOAuthCallback(auth, 'code-1', 'https://ide.example/github-callback?nonce=other')
    ).rejects.toMatchObject({
      code: 'auth_invalid'
    });
    expect(auth.completeOAuth).not.toHaveBeenCalled();
    expect(await loadPendingOAuth()).toBeNull();

    await expect(completeOAuthCallback(auth, 'code-1', PENDING.state)).rejects.toMatchObject({ code: 'auth_invalid' });
  });

  it('clears the pending request when the exchange fails', async () => {
    const auth = fakeAuth();
    auth.completeOAuth.mockRejectedValueOnce(Object.assign(new Error('exchange failed'), { code: 'auth_invalid' }));
    await savePendingOAuth(PENDING);
    await expect(completeOAuthCallback(auth, 'code-1', PENDING.state)).rejects.toMatchObject({ code: 'auth_invalid' });
    expect(await loadPendingOAuth()).toBeNull();
    expect(localStorage.getItem(oauthDoneKey())).toBeNull();
  });
});
