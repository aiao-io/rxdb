import type { OrbitClient } from '@aiao/orbit/client';
import { describe, expect, it, vi } from 'vitest';
import { desktopGitHubOAuth, isTrustedDesktopOrigin } from './github-desktop-oauth.js';

const PROP = 'aiao-code.github-oauth-origin';
const DESKTOP = 'https://desktop.aiao.io';

/** 桌面连接：`hostOrigin` 是握手时浏览器给出的宿主来源，`props` 是宿主自报的启动属性。 */
function connection(hostOrigin: string, props: Record<string, unknown> = {}) {
  const request = vi.fn<(method: string, payload?: unknown, options?: unknown) => Promise<unknown>>(
    async () => 'code-1'
  );
  const orbit = { context: { hostOrigin, props }, request } as unknown as OrbitClient;
  return { orbit, request };
}

describe('受信桌面来源', () => {
  it('Aiao Desktop 的生产与预览域名，以及任意端口的本机地址', () => {
    for (const origin of [
      DESKTOP,
      'https://aiao-desktop.pages.dev',
      'https://preview.aiao-desktop.pages.dev',
      'http://localhost',
      'http://localhost:4200',
      'http://127.0.0.1:65535'
    ])
      expect(isTrustedDesktopOrigin(origin), origin).toBe(true);
  });

  it('其余来源一律不受信：别的站点、仿冒的主机名、错误的协议与端口、带路径或凭据的写法', () => {
    for (const origin of [
      '',
      'null',
      'https://evil.example',
      'https://desktop.aiao.io.evil.example',
      'https://evil-desktop.aiao.io',
      'http://desktop.aiao.io',
      'https://desktop.aiao.io:8443',
      'https://desktop.aiao.io/',
      'https://user@desktop.aiao.io',
      'https://localhost:4200',
      'http://localhost.evil.example',
      'http://localhost:99999x',
      'http://127.0.0.1.evil.example:80',
      'http://[::1]:4200'
    ])
      expect(isTrustedDesktopOrigin(origin), origin).toBe(false);
    expect(isTrustedDesktopOrigin(undefined as unknown as string)).toBe(false);
  });
});

describe('桌面代办 GitHub 授权', () => {
  it('宿主来源受信、桌面声明代办（属性与浏览器给出的来源一致）：交给桌面换授权码', async () => {
    const { orbit, request } = connection(DESKTOP, { [PROP]: DESKTOP });
    const oauth = desktopGitHubOAuth(orbit)!;
    expect(oauth.origin).toBe(DESKTOP);
    const signal = new AbortController().signal;
    expect(await oauth.authorize('https://github.com/login/oauth/authorize?x=1', signal)).toBe('code-1');
    expect(request).toHaveBeenCalledWith('aiao-code:github-oauth', 'https://github.com/login/oauth/authorize?x=1', {
      signal,
      timeout: 120_000
    });
  });

  it('桌面自报受信来源也没用：宿主的来源本身不受信（恶意页面嵌入应用后自称桌面），不接管授权', () => {
    for (const hostOrigin of ['https://evil.example', 'null', 'http://localhost.evil.example']) {
      const { orbit, request } = connection(hostOrigin, { [PROP]: 'https://aiao-desktop.pages.dev' });
      expect(desktopGitHubOAuth(orbit), hostOrigin).toBeUndefined();
      expect(request).not.toHaveBeenCalled();
    }
    /* 自报的来源和宿主自己一样不受信时同样不行。 */
    expect(
      desktopGitHubOAuth(connection('https://evil.example', { [PROP]: 'https://evil.example' }).orbit)
    ).toBeUndefined();
  });

  it('自报来源与浏览器给出的宿主来源不一致：不信，授权只发给真正嵌入应用的那个桌面', () => {
    const { orbit } = connection(DESKTOP, { [PROP]: 'https://aiao-desktop.pages.dev' });
    expect(desktopGitHubOAuth(orbit)).toBeUndefined();
    expect(desktopGitHubOAuth(connection(DESKTOP, { [PROP]: 42 }).orbit)).toBeUndefined();
  });

  it('桌面没有声明代办（没有该属性）：不提供桌面授权，应用走独立页面的授权流程', () => {
    expect(desktopGitHubOAuth(connection(DESKTOP).orbit)).toBeUndefined();
  });

  it('桌面没有返回授权码是错误；授权超时给出可读的提示并保留原因', async () => {
    const { orbit, request } = connection('http://localhost:4200', { [PROP]: 'http://localhost:4200' });
    const oauth = desktopGitHubOAuth(orbit)!;
    const signal = new AbortController().signal;
    request.mockResolvedValueOnce('');
    await expect(oauth.authorize('https://github.com/x', signal)).rejects.toThrow('桌面未返回 GitHub 授权码');
    const timeout = Object.assign(new Error('请求超时'), { code: 'TIMEOUT' });
    request.mockRejectedValueOnce(timeout);
    await expect(oauth.authorize('https://github.com/x', signal)).rejects.toMatchObject({
      message: 'GitHub 授权已超时，请重新登录',
      cause: timeout
    });
    const other = new Error('桌面拒绝');
    request.mockRejectedValueOnce(other);
    await expect(oauth.authorize('https://github.com/x', signal)).rejects.toBe(other);
  });
});
