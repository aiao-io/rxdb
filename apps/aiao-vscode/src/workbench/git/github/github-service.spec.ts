import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGitHubService, PENDING_GITHUB_CLIENT_ID } from './github-service.js';
import { createMemorySessionStore } from './github-session-store.js';

type FetchMock = ReturnType<typeof vi.fn> & typeof fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('GitHub service', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn() as FetchMock;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const service = (overrides: Parameters<typeof createGitHubService>[0] = {}) =>
    createGitHubService({
      config: { clientId: 'client-1', origin: 'https://ide.example' },
      sessionStore: createMemorySessionStore(),
      fetchFn: fetchMock,
      ...overrides
    });

  it('refuses OAuth sign-in until a client id is configured', async () => {
    const pending = service({ config: { origin: 'https://ide.example' } });
    await expect(pending.beginOAuth()).rejects.toThrow('尚未配置 clientId');

    const configured = service();
    const request = await configured.beginOAuth();
    expect(request.authorizeUrl).toContain('client_id=client-1');
    expect(request.state).toContain('https://ide.example/github-callback');
  });

  it('injects the authenticated session token into API requests', async () => {
    const github = service();
    fetchMock.mockResolvedValue(jsonResponse({ login: 'octo', avatar_url: null }));
    await github.auth.loginWithPat('ghp_abc');
    fetchMock.mockClear();

    fetchMock.mockResolvedValue(jsonResponse({ login: 'octo', avatar_url: null }));
    await github.api.getAuthenticatedUser();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ Authorization: 'Bearer ghp_abc' });
  });

  it('exposes the session through getSession', async () => {
    const github = service();
    await expect(github.getSession()).resolves.toBeNull();
    fetchMock.mockResolvedValue(jsonResponse({ login: 'octo' }));
    await github.auth.loginWithPat('ghp_abc');
    await expect(github.getSession()).resolves.toMatchObject({ login: 'octo' });
  });

  it('creates a backend that reads through the shared API', async () => {
    const github = service();
    const backend = github.createBackend();
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: 'head-1', commit: { sha: 'head-1' } }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        sha: 'head-1',
        tree: { sha: 'tree-1' },
        parents: [],
        commit: { message: 'x', tree: { sha: 'tree-1' } }
      })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ truncated: false, tree: [] }));
    const snapshot = await backend.open('github:octo/repo@main');
    expect(snapshot.projectId).toBe('github:octo/repo@main');
    expect(snapshot.revision).toBe('head-1');
  });

  it('keeps the placeholder client id constant stable for config checks', () => {
    expect(PENDING_GITHUB_CLIENT_ID).toBe('pending-aiao-vscode-oauth-app');
  });
});
