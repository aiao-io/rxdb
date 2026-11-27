import type { OrbitInstance, OrbitValue } from '@aiao/orbit';
import type { WebAppManifest } from './desktop-apps';

const CODE_ORIGIN = 'https://vscode.aiao.io';
const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize';

/** 不为第三方或目录安装的应用注册 OAuth 操作。 */
export function supportsGitHubOAuth(app: WebAppManifest): boolean {
  return app.id === 'vscode' && app.installScope === 'preinstalled' && new URL(app.web.url).origin === CODE_ORIGIN;
}

function readAuthorizeURL(payload: OrbitValue): { url: URL; state: string } {
  const invalid = new Error('无效的 GitHub 授权请求');
  if (typeof payload !== 'string' || payload.length > 4096 || !URL.canParse(payload)) throw invalid;
  const url = new URL(payload);
  if (`${url.origin}${url.pathname}` !== GITHUB_AUTHORIZE || url.username || url.password || url.hash) throw invalid;
  const params = url.searchParams;
  const state = params.get('state');
  if (
    !state ||
    !URL.canParse(state) ||
    params.getAll('state').length !== 1 ||
    params.getAll('redirect_uri').length !== 1 ||
    params.get('redirect_uri') !== `${CODE_ORIGIN}/redirect` ||
    params.get('code_challenge_method') !== 'S256' ||
    !/^[\w-]{43}$/.test(params.get('code_challenge') ?? '')
  )
    throw invalid;
  const callback = new URL(state);
  if (
    callback.origin !== CODE_ORIGIN ||
    callback.pathname !== '/github-callback' ||
    callback.username ||
    callback.password ||
    callback.hash ||
    callback.searchParams.getAll('desktop').length !== 1 ||
    callback.searchParams.get('desktop') !== location.origin ||
    !/^[0-9a-f]{32}$/.test(callback.searchParams.get('nonce') ?? '')
  )
    throw invalid;
  return { url, state };
}

/** 只打开 GitHub 授权端点；回跳页与桌面同源，不需要 opener 或跨站存储。 */
function authorize(payload: OrbitValue, signal: AbortSignal): Promise<string> {
  const { url, state } = readAuthorizeURL(payload);
  signal.throwIfAborted();
  if (navigator.userActivation && !navigator.userActivation.isActive) {
    throw new Error('请直接点击「使用 GitHub 账号登录」打开授权页');
  }
  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel(`aiao-code.github-oauth:${state}`);
    const cleanup = (): void => {
      channel.close();
      signal.removeEventListener('abort', cancel);
    };
    const cancel = (): void => {
      cleanup();
      reject(signal.reason);
    };
    channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!data || typeof data !== 'object') return;
      if ('code' in data && typeof data.code === 'string' && data.code) {
        cleanup();
        resolve(data.code);
      } else if ('error' in data) {
        cleanup();
        reject(new Error(data.error === 'access_denied' ? '已取消 GitHub 授权' : 'GitHub 授权失败，请重试'));
      }
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const popup = window.open('about:blank', '_blank', 'popup,width=600,height=750');
      if (!popup) throw new Error('浏览器未能打开 GitHub 授权页，请重试');
      popup.opener = null;
      popup.location.replace(url.href);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export function serveGitHubOAuth(instance: OrbitInstance, isFocused: () => boolean): { dispose(): void } {
  const lifetime = new AbortController();
  const unregister = instance.onRequest('aiao-code:github-oauth', (payload, signal) => {
    if (!isFocused()) throw new Error('请先将 Aiao Code 切换到前台');
    return authorize(payload, AbortSignal.any([signal, lifetime.signal]));
  });
  return {
    dispose() {
      unregister();
      lifetime.abort();
    }
  };
}
