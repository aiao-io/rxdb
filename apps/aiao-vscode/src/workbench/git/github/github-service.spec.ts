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

  it('uses an explicit client id without fetching deployment config', async () => {
    const configured = service();
    const request = await configured.beginOAuth();
    expect(request.authorizeUrl).toContain('client_id=client-1');
    expect(request.state).toContain('https://ide.example/github-callback');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads the deployment client id through the auth entry point used by the login dialog', async () => {
    const github = service({ config: { origin: 'https://ide.example' } });
    fetchMock.mockResolvedValue(jsonResponse({ clientId: 'deployed-client' }));

    const request = await github.auth.beginOAuth();

    expect(new URL(request.authorizeUrl).searchParams.get('client_id')).toBe('deployed-client');
    expect(fetchMock).toHaveBeenCalledWith('https://ide.example/api/github-token', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
  });

  it('uses the same deployment config through the service OAuth entry point', async () => {
    const github = service({ config: { origin: 'https://ide.example' } });
    fetchMock.mockResolvedValue(jsonResponse({ clientId: 'deployed-client' }));
    const request = await github.beginOAuth();
    expect(new URL(request.authorizeUrl).searchParams.get('client_id')).toBe('deployed-client');
  });

  it('reports missing server config instead of authorizing the placeholder', async () => {
    const github = service({ config: { origin: 'https://ide.example' } });
    fetchMock.mockResolvedValue(jsonResponse({ error: 'not configured' }, 503));
    await expect(github.auth.beginOAuth()).rejects.toThrow('GITHUB_CLIENT_ID');
    await expect(github.beginOAuth()).rejects.toThrow('GITHUB_CLIENT_ID');
  });

  it.each([{}, null, { clientId: '' }, { clientId: '   ' }, { clientId: PENDING_GITHUB_CLIENT_ID }])(
    'rejects invalid deployment config %j',
    async config => {
      const github = service({ config: { origin: 'https://ide.example' } });
      fetchMock.mockResolvedValue(jsonResponse(config));
      await expect(github.auth.beginOAuth()).rejects.toThrow('GITHUB_CLIENT_ID');
    }
  );

  it('reports missing Pages Functions when the endpoint returns the SPA HTML', async () => {
    const github = service({ config: { origin: 'https://ide.example' } });
    fetchMock.mockResolvedValue(new Response('<!doctype html><title>Workbench</title>'));
    await expect(github.auth.beginOAuth()).rejects.toThrow('Pages Functions');
  });

  it('reports deployment config network failures without starting OAuth', async () => {
    const github = service({ config: { origin: 'https://ide.example' } });
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(github.auth.beginOAuth()).rejects.toThrow('无法读取 GitHub 登录配置');
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
