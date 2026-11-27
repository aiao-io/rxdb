import { expect, it, vi } from 'vitest';
import { GITHUB_SESSION_UPDATED_KEY, GithubConnection } from './github-connection';

it('GitHub Desktop 和终端共用宿主认证与 GitHub API 配置', async () => {
  vi.stubGlobal('location', { origin: 'https://desktop.example' });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({}, { status: 503 }))
    .mockResolvedValueOnce(Response.json({}))
    .mockResolvedValueOnce(Response.json({ clientId: 'test-client' }))
    .mockResolvedValueOnce(Response.json({ login: 'user', avatar_url: null }));
  vi.stubGlobal('fetch', fetch);
  const connection = new GithubConnection();
  await expect(connection.auth.beginOAuth()).rejects.toThrow('503');
  await expect(connection.auth.beginOAuth()).rejects.toThrow('clientId');
  expect((await connection.auth.beginOAuth()).authorizeUrl).toContain('client_id=test-client');
  expect(await connection.api.getAuthenticatedUser()).toEqual({ login: 'user', avatarUrl: null });
});

it('清除被 GitHub 拒绝的会话，并让其他窗口重新读取登录状态', async () => {
  vi.stubGlobal('location', { origin: 'https://desktop.example' });
  const storage = { setItem: vi.fn() };
  vi.stubGlobal('localStorage', storage);
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ login: 'user', avatar_url: null }))
    .mockResolvedValueOnce(Response.json({ message: 'Bad credentials' }, { status: 401 }));
  vi.stubGlobal('fetch', fetch);
  const connection = new GithubConnection();
  await connection.auth.loginWithPat('ghp_revoked');

  await expect(connection.api.getBranchSha('octo', 'repo', 'main')).rejects.toMatchObject({
    code: 'auth_required'
  });
  await expect(connection.auth.getSession()).resolves.toBeNull();
  expect(storage.setItem).toHaveBeenCalledWith(GITHUB_SESSION_UPDATED_KEY, expect.any(String));
});
