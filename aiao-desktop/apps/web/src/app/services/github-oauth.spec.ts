import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_APP_MANIFESTS } from '../apps/app-manifests';
import { FakeOrbitInstance } from '../testing/fake-orbit';
import { serveGitHubOAuth, supportsGitHubOAuth } from './github-oauth';

const desktop = 'https://desktop.aiao.io';
const code = 'https://vscode.aiao.io';
const method = 'aiao-code:github-oauth';
const state = `${code}/github-callback?${new URLSearchParams({ nonce: 'a'.repeat(32), desktop })}`;
const authorize = `https://github.com/login/oauth/authorize?${new URLSearchParams({
  state,
  redirect_uri: `${code}/redirect`,
  code_challenge_method: 'S256',
  code_challenge: 'a'.repeat(43)
})}`;

describe('桌面的 GitHub 授权桥', () => {
  const replace = vi.fn();
  const popup = { opener: {}, location: { replace } };
  const open = vi.fn(() => popup);
  const channel = { onmessage: (_event: { data: unknown }) => undefined, close: vi.fn() };
  const broadcast = vi.fn(function () {
    return channel;
  });
  const focused = vi.fn(() => true);

  beforeEach(() => {
    vi.clearAllMocks();
    focused.mockReturnValue(true);
    vi.stubGlobal('location', { origin: desktop });
    vi.stubGlobal('navigator', { userActivation: { isActive: true } });
    vi.stubGlobal('window', { open });
    vi.stubGlobal('BroadcastChannel', broadcast);
  });

  function bridge() {
    const instance = new FakeOrbitInstance({ appId: 'vscode', instanceId: 'one', url: code, version: '1' });
    const handle = serveGitHubOAuth(instance, focused);
    return { instance, handle, request: instance.handlers.get(method)! };
  }

  it('只支持预装的 Aiao Code 和它登记的来源', () => {
    const app = DESKTOP_APP_MANIFESTS.vscode;
    expect(supportsGitHubOAuth(app)).toBe(true);
    expect(supportsGitHubOAuth({ ...app, id: 'notes' })).toBe(false);
    expect(supportsGitHubOAuth({ ...app, installScope: 'approved-catalog' })).toBe(false);
    expect(supportsGitHubOAuth({ ...app, web: { ...app.web, url: 'https://other.example' } })).toBe(false);
  });

  it('拒绝不相关的地址、回调或没有用户操作的请求，不打开窗口', () => {
    const { request } = bridge();
    const signal = new AbortController().signal;
    for (const forged of [
      null,
      'invalid URL',
      authorize.replace('github.com', 'example.com'),
      `${authorize}&state=x`,
      authorize.replace('desktop.aiao.io', 'example.com'),
      authorize.replace('S256', 'plain')
    ]) {
      expect(() => request(forged, signal)).toThrow('无效的 GitHub 授权请求');
    }
    vi.stubGlobal('navigator', { userActivation: { isActive: false } });
    expect(() => request(authorize, signal)).toThrow('请直接点击');
    focused.mockReturnValue(false);
    expect(() => request(authorize, signal)).toThrow('前台');
    expect(open).not.toHaveBeenCalled();
  });

  it('校验地址后断开 opener，只通过当前 state 的通道返回授权码', async () => {
    const { request } = bridge();
    const outcome = request(authorize, new AbortController().signal);
    expect(open).toHaveBeenCalledWith('about:blank', '_blank', expect.stringContaining('popup'));
    expect(popup.opener).toBeNull();
    expect(replace).toHaveBeenCalledWith(authorize);
    expect(broadcast).toHaveBeenCalledWith(`aiao-code.github-oauth:${state}`);
    channel.onmessage({ data: { token: 'not-a-code' } });
    expect(channel.close).not.toHaveBeenCalled();
    channel.onmessage({ data: { code: 'returned-code' } });
    await expect(outcome).resolves.toBe('returned-code');
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it('分别处理取消授权、弹窗拦截和窗口关闭', async () => {
    const { handle, request, instance } = bridge();
    const signal = new AbortController().signal;
    const denied = request(authorize, signal);
    channel.onmessage({ data: { error: 'access_denied' } });
    await expect(denied).rejects.toThrow('已取消 GitHub 授权');
    vi.stubGlobal('window', { open: () => null });
    await expect(request(authorize, signal)).rejects.toThrow('未能打开');
    vi.stubGlobal('window', { open });
    const pending = request(authorize, signal);
    handle.dispose();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(instance.handlers.has(method)).toBe(false);
    expect(channel.close).toHaveBeenCalledTimes(3);
  });
});
