import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitWorkbenchError } from '../git-protocol.js';
import { createGitHubAuth } from './github-auth.js';
import { createMemorySessionStore, type GitHubSessionStore } from './github-session-store.js';

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers }
  });
}

const CONFIG = {
  clientId: 'client-1',
  exchangeUrl: 'https://ide.example/api/github-token',
  redirectUri: 'https://ide.example/redirect',
  origin: 'https://ide.example'
};

type FetchMock = ReturnType<typeof vi.fn> & typeof fetch;

describe('GitHub authentication', () => {
  let fetchMock: FetchMock;
  let store: GitHubSessionStore;
  let auth: ReturnType<typeof createGitHubAuth>;

  beforeEach(() => {
    fetchMock = vi.fn() as FetchMock;
    store = createMemorySessionStore();
    auth = createGitHubAuth({ ...CONFIG, sessionStore: store, fetchFn: fetchMock });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs in with a PAT after validating it and persists the session', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { login: 'octo', avatar_url: 'https://a.example/a.png' },
        { headers: { 'x-oauth-scopes': 'repo, user' } }
      )
    );
    const session = await auth.loginWithPat('ghp_abc');
    expect(session).toEqual({ token: 'ghp_abc', login: 'octo', avatarUrl: 'https://a.example/a.png', provider: 'pat' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/user');
    await expect(store.load()).resolves.toEqual({
      token: 'ghp_abc',
      login: 'octo',
      avatarUrl: 'https://a.example/a.png',
      provider: 'pat',
      createdAt: expect.any(Number)
    });
    await expect(auth.getSession()).resolves.toEqual(session);
  });

  it('rejects an invalid PAT without persisting anything', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Bad credentials' }, { status: 401 }));
    const pending = auth.loginWithPat('bad');
    await expect(pending).rejects.toBeInstanceOf(GitWorkbenchError);
    await expect(pending).rejects.toMatchObject({ code: 'auth_invalid' });
    await expect(store.load()).resolves.toBeNull();
    await expect(auth.getSession()).resolves.toBeNull();
  });

  it('builds a PKCE authorize URL with state carrying the callback URI', async () => {
    const request = await auth.beginOAuth();
    const url = new URL(request.authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('redirect_uri')).toBe('https://ide.example/redirect');
    expect(url.searchParams.get('scope')).toBe('repo workflow user:email read:user');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('prompt')).toBe('select_account');

    const state = new URL(request.state);
    expect(state.origin).toBe('https://ide.example');
    expect(state.searchParams.get('nonce')).toMatch(/^[0-9a-f]{16}$/);

    const challenge = url.searchParams.get('code_challenge')!;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(request.verifier));
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(challenge).toBe(expected);
    expect(request.verifier).toMatch(/^[0-9a-f]{64}$/);
  });

  it('exchanges the code through the same-origin endpoint and persists the session', async () => {
    const { verifier } = await auth.beginOAuth();
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'gho_oauth' }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ login: 'octo', avatar_url: null }));

    const session = await auth.completeOAuth('code-abc', verifier);
    expect(session).toEqual({ token: 'gho_oauth', login: 'octo', avatarUrl: null, provider: 'oauth' });

    const [exchangeUrl, exchangeInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(exchangeUrl).toBe('https://ide.example/api/github-token');
    expect(JSON.parse(String(exchangeInit.body))).toEqual({
      code: 'code-abc',
      code_verifier: verifier,
      redirect_uri: 'https://ide.example/redirect'
    });
    await expect(store.load()).resolves.toMatchObject({ provider: 'oauth', token: 'gho_oauth' });
  });

  it('rejects a failed exchange without persisting', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'invalid' }, { status: 400 }));
    await expect(auth.completeOAuth('code-abc', 'verifier-abc')).rejects.toMatchObject({ code: 'auth_invalid' });
    await expect(store.load()).resolves.toBeNull();
  });

  it('logs out an OAuth session through the exchange endpoint and clears storage', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'gho_oauth' }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ login: 'octo', avatar_url: null }));
    await auth.completeOAuth('code-abc', 'verifier');
    fetchMock.mockClear();

    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await auth.logout();
    await expect(store.load()).resolves.toBeNull();
    await expect(auth.getSession()).resolves.toBeNull();

    const [deleteUrl, deleteInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(deleteUrl).toBe('https://ide.example/api/github-token/delete');
    expect(deleteInit.method).toBe('POST');
    expect(JSON.parse(String(deleteInit.body))).toEqual({ token: 'gho_oauth' });
  });

  it('logs out a PAT session locally without calling the server', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ login: 'octo' }));
    await auth.loginWithPat('ghp_abc');
    fetchMock.mockClear();

    await auth.logout();
    await expect(store.load()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('always clears the local session even when server-side revocation fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: 'gho_oauth' }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ login: 'octo' }));
    await auth.completeOAuth('code-abc', 'verifier');
    fetchMock.mockClear();

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await auth.logout();
    await expect(store.load()).resolves.toBeNull();
  });

  it('notifies subscribers on login and logout', async () => {
    const seen: (string | null)[] = [];
    auth.subscribe(session => seen.push(session?.login ?? null));
    fetchMock.mockResolvedValue(jsonResponse({ login: 'octo' }));
    await auth.loginWithPat('ghp_abc');
    fetchMock.mockClear();
    await auth.logout();
    expect(seen).toEqual([null, 'octo', null]);
  });

  it('restores the persisted session on a fresh instance', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ login: 'octo' }));
    await auth.loginWithPat('ghp_abc');
    const restored = createGitHubAuth({ ...CONFIG, sessionStore: store, fetchFn: fetchMock });
    await expect(restored.getSession()).resolves.toMatchObject({ login: 'octo', token: 'ghp_abc' });
  });

  it('refreshes the session from storage for cross-tab logins', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ login: 'octo' }));
    await auth.loginWithPat('ghp_abc');
    await store.save({ token: 'ghp_new', login: 'other', avatarUrl: null, provider: 'pat', createdAt: Date.now() });
    await expect(auth.refresh()).resolves.toMatchObject({ login: 'other', token: 'ghp_new' });
    await store.clear();
    await expect(auth.refresh()).resolves.toBeNull();
  });
});
