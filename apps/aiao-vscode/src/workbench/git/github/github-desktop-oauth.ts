import type { OrbitClient } from '@aiao/orbit/client';

/** 由桌面打开授权页；只返回授权码，不经过桌面交换或保存令牌。 */
export interface GitHubDesktopOAuth {
  readonly origin: string;
  authorize(url: string, signal: AbortSignal): Promise<string>;
}

/** 桌面声明自己代办 GitHub 授权的启动属性。值是桌面自报的来源，只用来确认桌面提供了授权桥，不当作身份。 */
const OAUTH_ORIGIN_PROP = 'aiao-code.github-oauth-origin';

/**
 * 受信的桌面宿主来源：Aiao Desktop 的生产与预览域名，以及本机任意端口的 `localhost` / `127.0.0.1`（开发与端到端测试）。
 * 同一份名单管三件事：握手时只接受这些来源的宿主（`bootstrapWithOrbit`）、GitHub 授权只交给这些来源的宿主
 * （`desktopGitHubOAuth`）、部署函数只向这些来源回跳授权结果（`deploy/functions`）。
 * 来源必须是浏览器给出的 `event.origin`（`OrbitClientContext.hostOrigin`），不能是宿主自报的值。
 */
export function isTrustedDesktopOrigin(origin: string): boolean {
  return (
    origin === 'https://desktop.aiao.io' ||
    origin === 'https://aiao-desktop.pages.dev' ||
    origin === 'https://preview.aiao-desktop.pages.dev' ||
    (/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(origin) &&
      URL.canParse(origin) &&
      new URL(origin).origin === origin)
  );
}

/**
 * 嵌入在受信桌面里且桌面代办授权时，返回桌面授权入口；否则返回 undefined（走独立页面的授权流程）。
 * 身份只认握手时浏览器给出的宿主来源：宿主自报的 `aiao-code.github-oauth-origin` 必须与它一致才算数，
 * 否则任何站点嵌入本应用后自称受信桌面，就能接管授权流程（例如回一个攻击者账号的授权码）。
 */
export function desktopGitHubOAuth(orbit: OrbitClient): GitHubDesktopOAuth | undefined {
  const { hostOrigin, props } = orbit.context;
  if (!isTrustedDesktopOrigin(hostOrigin) || props[OAUTH_ORIGIN_PROP] !== hostOrigin) return undefined;
  return {
    origin: hostOrigin,
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
