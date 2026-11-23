import { expect, it, vi } from 'vitest';
import { GithubConnection } from './github-connection';

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
