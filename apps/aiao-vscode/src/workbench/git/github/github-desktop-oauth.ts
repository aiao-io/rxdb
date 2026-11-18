import type { OrbitClient } from '@aiao/orbit/client';

/** 由桌面打开授权页；只返回授权码，不经过桌面交换或保存令牌。 */
export interface GitHubDesktopOAuth {
  readonly origin: string;
  authorize(url: string, signal: AbortSignal): Promise<string>;
}

export function isGitHubOAuthDesktopOrigin(origin: string): boolean {
  return (
    origin === 'https://desktop.aiao.io' ||
    origin === 'https://aiao-desktop.pages.dev' ||
    origin === 'https://preview.aiao-desktop.pages.dev' ||
    (/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(origin) &&
      URL.canParse(origin) &&
      new URL(origin).origin === origin)
  );
}

export function desktopGitHubOAuth(orbit: OrbitClient): GitHubDesktopOAuth | undefined {
  const origin = orbit.context.props['aiao-code.github-oauth-origin'];
  if (typeof origin !== 'string' || !isGitHubOAuthDesktopOrigin(origin)) return undefined;
  return {
    origin,
    async authorize(url, signal) {
      try {
        const code = await orbit.request('aiao-code:github-oauth', url, { signal, timeout: 120_000 });
        if (typeof code !== 'string' || !code) throw new Error('桌面未返回 GitHub 授权码');
        return code;
      } catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'TIMEOUT') {
          throw new Error('GitHub 授权已超时，请重新登录', { cause });
        }
        throw cause;
      }
    }
  };
}
