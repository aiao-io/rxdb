// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubAuth, GitHubSession } from './github-auth.js';
import {
  clearPendingOAuth,
  completeOAuthCallback,
  loadPendingOAuth,
  oauthDoneKey,
  savePendingOAuth
} from './github-oauth-bridge.js';

const PENDING = {
  verifier: 'verifier-1',
  nonce: 'abcd1234abcd1234',
  state: 'https://ide.example/github-callback?nonce=abcd1234abcd1234',
  at: Date.now()
};

const SESSION: GitHubSession = { token: 'gho_abc', login: 'octo', avatarUrl: null, provider: 'oauth' };

function fakeAuth(): GitHubAuth {
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
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips pending requests through localStorage with a TTL', () => {
    expect(loadPendingOAuth()).toBeNull();
    savePendingOAuth(PENDING);
    expect(loadPendingOAuth()).toEqual(PENDING);
    savePendingOAuth({ ...PENDING, at: Date.now() - 11 * 60 * 1000 });
    expect(loadPendingOAuth()).toBeNull();
    localStorage.setItem('aiao-vscode.github-oauth-pending', 'not-json');
    expect(loadPendingOAuth()).toBeNull();
    localStorage.setItem('aiao-vscode.github-oauth-pending', '{"verifier":1}');
    expect(loadPendingOAuth()).toBeNull();
    clearPendingOAuth();
    expect(loadPendingOAuth()).toBeNull();
  });

  it('completes the callback when the state matches and notifies other tabs', async () => {
    const auth = fakeAuth();
    savePendingOAuth(PENDING);
    const session = await completeOAuthCallback(auth, 'code-1', PENDING.state);
    expect(session).toBe(SESSION);
    expect(auth.completeOAuth).toHaveBeenCalledWith('code-1', 'verifier-1');
    expect(loadPendingOAuth()).toBeNull();
    expect(localStorage.getItem(oauthDoneKey())).toContain('octo');
  });

  it('rejects mismatched states and expired requests without touching the auth provider', async () => {
    const auth = fakeAuth();
    savePendingOAuth(PENDING);
    await expect(
      completeOAuthCallback(auth, 'code-1', 'https://ide.example/github-callback?nonce=other')
    ).rejects.toMatchObject({
      code: 'auth_invalid'
    });
    expect(auth.completeOAuth).not.toHaveBeenCalled();
    expect(loadPendingOAuth()).toBeNull();

    await expect(completeOAuthCallback(auth, 'code-1', PENDING.state)).rejects.toMatchObject({ code: 'auth_invalid' });
  });

  it('clears the pending request when the exchange fails', async () => {
    const auth = fakeAuth();
    auth.completeOAuth.mockRejectedValueOnce(Object.assign(new Error('exchange failed'), { code: 'auth_invalid' }));
    savePendingOAuth(PENDING);
    await expect(completeOAuthCallback(auth, 'code-1', PENDING.state)).rejects.toMatchObject({ code: 'auth_invalid' });
    expect(loadPendingOAuth()).toBeNull();
    expect(localStorage.getItem(oauthDoneKey())).toBeNull();
  });
});
