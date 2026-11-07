import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubApiError, createGitHubApi } from './github-api.js';

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers }
  });
}

function textResponse(body: string, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(body, { status: init.status ?? 200, headers: init.headers });
}

type FetchMock = ReturnType<typeof vi.fn> & typeof fetch;

describe('GitHub API client', () => {
  let fetchMock: FetchMock;
  let api: ReturnType<typeof createGitHubApi>;

  beforeEach(() => {
    fetchMock = vi.fn() as FetchMock;
    api = createGitHubApi({ getToken: async () => null, fetchFn: fetchMock });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function calledUrl(callIndex = 0): { url: string; init: RequestInit } {
    const [url, init] = fetchMock.mock.calls[callIndex] as [string, RequestInit];
    return { url, init: init ?? {} };
  }

  it('sends required headers and Bearer token on every request', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ login: 'octo', avatar_url: 'https://a.example/a.png' }));
    const tokenApi = createGitHubApi({ getToken: async () => 'token-1', fetchFn: fetchMock });
    await tokenApi.getAuthenticatedUser();
    const { url, init } = calledUrl();
    expect(url).toBe('https://api.github.com/user');
    expect(init.headers).toMatchObject({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: 'Bearer token-1',
      'User-Agent': 'aiao-vscode'
    });
  });

  it('parses the authenticated user', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ login: 'octo', avatar_url: 'https://a.example/a.png' }));
    await expect(api.getAuthenticatedUser()).resolves.toEqual({ login: 'octo', avatarUrl: 'https://a.example/a.png' });
  });

  it('maps HTTP failures to typed errors', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Bad credentials' }, { status: 401 }));
    await expect(api.getAuthenticatedUser()).rejects.toMatchObject({ code: 'auth_required', status: 401 });

    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Not Found' }, { status: 404 }));
    await expect(api.getRepository('octo', 'missing')).rejects.toMatchObject({ code: 'not_found', status: 404 });

    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Forbidden' }, { status: 403 }));
    await expect(api.getRepository('octo', 'blocked')).rejects.toMatchObject({ code: 'forbidden', status: 403 });

    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Reference update failed' }, { status: 422 }));
    await expect(api.updateRef('octo', 'r', 'heads/main', 'sha-1')).rejects.toMatchObject({
      code: 'conflict',
      status: 422
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Conflict' }, { status: 409 }));
    await expect(api.updateRef('octo', 'r', 'heads/main', 'sha-1')).rejects.toMatchObject({
      code: 'conflict',
      status: 409
    });

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api.getAuthenticatedUser()).rejects.toMatchObject({ code: 'network_failed' });
  });

  it('treats 403 with exhausted quota as rate_limited and tracks quota headers', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { message: 'API rate limit exceeded' },
        {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-limit': '60', 'x-ratelimit-reset': '1700000000' }
        }
      )
    );
    await expect(api.getAuthenticatedUser()).rejects.toMatchObject({ code: 'rate_limited' });
    expect(api.quota()).toEqual({ remaining: 0, limit: 60, resetAt: 1_700_000_000 });

    fetchMock.mockResolvedValueOnce(jsonResponse({ login: 'octo' }, { headers: { 'x-ratelimit-remaining': '59' } }));
    await api.getAuthenticatedUser();
    expect(api.quota().remaining).toBe(59);
  });

  it('reuses cached responses via ETag and serves 304 from cache', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ login: 'octo' }, { headers: { ETag: '"etag-1"' } }));
    await expect(api.getAuthenticatedUser()).resolves.toEqual({ login: 'octo', avatarUrl: null });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
    await expect(api.getAuthenticatedUser()).resolves.toEqual({ login: 'octo', avatarUrl: null });

    const second = calledUrl(1);
    expect(second.init.headers).toMatchObject({ 'If-None-Match': '"etag-1"' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('searches repositories with fork:true and parses summaries', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        items: [
          {
            full_name: 'octo/hello',
            description: 'demo',
            stargazers_count: 12,
            clone_url: 'https://github.com/octo/hello.git',
            private: false
          }
        ]
      })
    );
    await expect(api.searchRepositories('hello')).resolves.toEqual([
      {
        fullName: 'octo/hello',
        description: 'demo',
        stars: 12,
        cloneUrl: 'https://github.com/octo/hello.git',
        isPrivate: false
      }
    ]);
    expect(calledUrl().url).toBe(
      'https://api.github.com/search/repositories?q=hello+fork%3Atrue&sort=stars&per_page=30'
    );
  });

  it('follows Link rel=next pagination for my repositories and branches', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ full_name: 'octo/one', clone_url: 'https://github.com/octo/one.git', private: false }], {
        headers: { Link: '<https://api.github.com/user/repos?page=2>; rel="next"' }
      })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ full_name: 'octo/two', clone_url: 'https://github.com/octo/two.git', private: true }])
    );
    const repos = await api.listMyRepositories();
    expect(repos.map(repo => repo.fullName)).toEqual(['octo/one', 'octo/two']);
    expect(calledUrl(0).url).toBe('https://api.github.com/user/repos?sort=updated&per_page=100&page=1');
    expect(calledUrl(1).url).toBe('https://api.github.com/user/repos?page=2');

    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ name: 'main', commit: { sha: 'sha-main' } }], {
        headers: { Link: '<https://api.github.com/repos/octo/one/branches?page=2>; rel="next"' }
      })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse([{ name: 'develop', commit: { sha: 'sha-develop' } }]));
    await expect(api.listBranches('octo', 'one')).resolves.toEqual([
      { name: 'main', sha: 'sha-main' },
      { name: 'develop', sha: 'sha-develop' }
    ]);
    expect(calledUrl(3).url).toBe('https://api.github.com/repos/octo/one/branches?page=2');
  });

  it('preserves the configured API base path and follows absolute pagination links', async () => {
    const custom = createGitHubApi({
      getToken: async () => 'test-token',
      apiBase: 'https://github.example/api/v3/',
      fetchFn: fetchMock
    });
    fetchMock.mockResolvedValueOnce(
      jsonResponse([], { headers: { Link: '<https://github.example/api/v3/user/repos?page=2>; rel="next"' } })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse([]));

    await expect(custom.listMyRepositories()).resolves.toEqual([]);

    expect(calledUrl(0).url).toBe('https://github.example/api/v3/user/repos?sort=updated&per_page=100&page=1');
    expect(calledUrl(1).url).toBe('https://github.example/api/v3/user/repos?page=2');
    expect(calledUrl(1).init.headers).toMatchObject({ Authorization: 'Bearer test-token' });
  });

  it('walks truncated trees by fetching subtree trees and merges blob paths', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        sha: 'root-sha',
        truncated: true,
        tree: [
          { path: 'a.ts', mode: '100644', type: 'blob', sha: 'blob-a' },
          { path: 'sub', mode: '040000', type: 'tree', sha: 'tree-sub' }
        ]
      })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        sha: 'tree-sub',
        truncated: false,
        tree: [{ path: 'b.ts', mode: '100755', type: 'blob', sha: 'blob-b' }]
      })
    );
    await expect(api.getTreeFiles('octo', 'one', 'root-sha')).resolves.toEqual([
      { path: 'a.ts', sha: 'blob-a', mode: '100644' },
      { path: 'sub/b.ts', sha: 'blob-b', mode: '100755' }
    ]);
    expect(calledUrl(1).url).toContain('/git/trees/tree-sub');
  });

  it('decodes base64 file contents including embedded newlines', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ content: 'aGVs\nbG8=\n', encoding: 'base64', type: 'file' }));
    await expect(api.getFileContents('octo', 'one', 'src/a.ts', 'main')).resolves.toEqual(
      new Uint8Array([104, 101, 108, 108, 111])
    );
  });

  it('builds git database requests with inline content, blob sha and deletion entries', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: 'new-tree' }));
    const treeSha = await api.createTree('octo', 'one', 'base-tree', [
      { path: 'a.ts', mode: '100644', content: 'hello' },
      { path: 'logo.png', mode: '100644', sha: 'blob-logo' },
      { path: 'gone.ts', sha: null }
    ]);
    expect(treeSha).toBe('new-tree');
    const { init } = calledUrl();
    expect(JSON.parse(String(init.body))).toEqual({
      base_tree: 'base-tree',
      tree: [
        { path: 'a.ts', mode: '100644', content: 'hello' },
        { path: 'logo.png', mode: '100644', sha: 'blob-logo' },
        { path: 'gone.ts', sha: null }
      ]
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: 'blob-new' }));
    await expect(api.createBlob('octo', 'one', new Uint8Array([0, 255, 1]))).resolves.toBe('blob-new');
    expect(JSON.parse(String(calledUrl(1).init.body))).toEqual({ content: 'AP8B', encoding: 'base64' });

    fetchMock.mockResolvedValueOnce(jsonResponse({ sha: 'commit-1' }));
    await expect(api.createCommit('octo', 'one', 'msg', 'new-tree', ['head-sha'])).resolves.toBe('commit-1');
    expect(JSON.parse(String(calledUrl(2).init.body))).toEqual({
      message: 'msg',
      tree: 'new-tree',
      parents: ['head-sha']
    });
  });

  it('updates refs with optional force and lists commits', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ref: 'refs/heads/main' }));
    await api.updateRef('octo', 'one', 'heads/main', 'new-sha');
    expect(calledUrl().url).toContain('/git/refs/heads/main');
    fetchMock.mockResolvedValueOnce(jsonResponse({ ref: 'refs/heads/main' }));
    await api.updateRef('octo', 'one', 'heads/main', 'new-sha', true);
    expect(JSON.parse(String(calledUrl(1).init.body))).toEqual({ sha: 'new-sha', force: true });

    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { sha: 'c-2', commit: { message: 'second' } },
        { sha: 'c-1', commit: { message: 'first' } }
      ])
    );
    await expect(api.listCommits('octo', 'one', 'main')).resolves.toEqual([
      { oid: 'c-2', message: 'second' },
      { oid: 'c-1', message: 'first' }
    ]);
  });

  it('creates a repository for the authenticated user', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ full_name: 'octo/new-repo', clone_url: 'https://github.com/octo/new-repo.git', private: true })
    );
    await expect(api.createRepository('new-repo', true)).resolves.toMatchObject({
      fullName: 'octo/new-repo',
      isPrivate: true
    });
    const { url, init } = calledUrl();
    expect(url).toBe('https://api.github.com/user/repos');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ name: 'new-repo', private: true });
  });

  it('fetches zipballs with the raw accept header', async () => {
    fetchMock.mockResolvedValue(textResponse('zip-bytes', { headers: { 'Content-Type': 'application/zip' } }));
    const bytes = await api.getZipball('octo', 'one', 'main');
    expect(new TextDecoder().decode(bytes)).toBe('zip-bytes');
    const { init } = calledUrl();
    expect(init.headers).toMatchObject({ Accept: 'application/vnd.github+raw' });
  });

  it('rejects malformed responses with invalid_response', async () => {
    fetchMock.mockResolvedValue(jsonResponse('not-an-object'));
    const pending = api.getAuthenticatedUser();
    await expect(pending).rejects.toBeInstanceOf(GitHubApiError);
    await expect(pending).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('clears the cache', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ login: 'octo' }, { headers: { ETag: '"e"' } }));
    await api.getAuthenticatedUser();
    api.clearCache();
    fetchMock.mockResolvedValueOnce(jsonResponse({ login: 'octo' }));
    await api.getAuthenticatedUser();
    expect(calledUrl(1).init.headers).not.toMatchObject({ 'If-None-Match': '"e"' });
  });
});
