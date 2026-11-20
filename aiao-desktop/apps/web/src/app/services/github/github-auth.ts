import { GitWorkbenchError } from '../git/git-protocol';
import { GitHubApiError, createGitHubApi } from './github-api.js';
import { GitHubSessionStore, GitHubStoredSession } from './github-session-store.js';
import { GitHubSession, GitHubUser } from './github-types.js';

export type { GitHubSession } from './github-types.js';

const DEFAULT_SCOPES = ['repo', 'workflow', 'user:email', 'read:user'] as const;
const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';

export interface GitHubAuthOptions {
  readonly clientId: string | (() => Promise<string>);
  /** 同源 Pages Function：POST 交换 code，POST /delete 撤销 token。 */
  readonly exchangeUrl: string;
  /** GitHub OAuth App 注册的回调地址（部署域 /redirect）。 */
  readonly redirectUri: string;
  /** 授权桥 origin，用于构造回调 state。 */
  readonly origin: string;
  /** 桌面 origin。设置后 state 使用授权桥可验证的回调 URL。 */
  readonly desktopOrigin?: string;
  /** SPA 完成回调的路由，默认 /github-callback。 */
  readonly callbackPath?: string;
  readonly scopes?: readonly string[];
  readonly sessionStore: GitHubSessionStore;
  readonly fetchFn?: typeof fetch;
  readonly apiBase?: string;
}

export interface GitHubOAuthRequest {
  readonly authorizeUrl: string;
  /** 一次性随机状态，回调时必须逐字匹配。 */
  readonly state: string;
  /** 独立随机数，编码进 state 并在完成授权时再次校验。 */
  readonly nonce: string;
  /** PKCE verifier，仅内存持有，completeOAuth 时传回。 */
  readonly verifier: string;
}

export interface GitHubAuth {
  getSession(): Promise<GitHubSession | null>;
  loginWithPat(token: string): Promise<GitHubSession>;
  beginOAuth(): Promise<GitHubOAuthRequest>;
  completeOAuth(code: string, verifier: string, state: string, signal?: AbortSignal): Promise<GitHubSession>;
  /** 丢弃内存会话缓存并从持久化存储重载；用于其他标签页完成登录后的同步。 */
  refresh(): Promise<GitHubSession | null>;
  logout(): Promise<void>;
  subscribe(listener: (session: GitHubSession | null) => void): () => void;
}

function randomHex(bytes: number): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return [...values].map(value => value.toString(16).padStart(2, '0')).join('');
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function callbackState(origin: string, callbackPath: string, desktopOrigin: string, nonce: string): string {
  const callback = new URL(callbackPath, origin);
  callback.searchParams.set('nonce', nonce);
  callback.searchParams.set('desktop', desktopOrigin);
  return callback.href;
}

function validStateNonce(
  state: string,
  nonce: string,
  origin: string,
  callbackPath: string,
  desktopOrigin: string | undefined
): boolean {
  if (state.startsWith(nonce) && /^[A-Za-z0-9._~-]{32,256}$/.test(state)) return true;
  if (!desktopOrigin) return false;
  try {
    const callback = new URL(state);
    return (
      callback.origin === origin &&
      callback.pathname === callbackPath &&
      !callback.username &&
      !callback.password &&
      !callback.hash &&
      callback.searchParams.getAll('nonce').length === 1 &&
      callback.searchParams.get('nonce') === nonce &&
      callback.searchParams.getAll('desktop').length === 1 &&
      callback.searchParams.get('desktop') === desktopOrigin
    );
  } catch {
    return false;
  }
}

function loginError(cause: GitHubApiError): GitWorkbenchError {
  switch (cause.code) {
    case 'auth_required':
      return new GitWorkbenchError('auth_invalid', '登录凭据无效', { cause });
    case 'rate_limited':
      return new GitWorkbenchError('rate_limited', 'GitHub 请求超出限额，请稍后重试', { cause });
    case 'network_failed':
      return new GitWorkbenchError('network_failed', '无法连接 GitHub', { cause });
    default:
      return new GitWorkbenchError('git_failed', cause.message, { cause });
  }
}

/** 工作台的 GitHub 认证服务：PKCE 授权码流 + PAT 兜底，会话持久化到注入的存储。 */
export function createGitHubAuth(options: GitHubAuthOptions): GitHubAuth {
  const scopes = [...(options.scopes ?? DEFAULT_SCOPES)];
  const fetchFn = options.fetchFn ?? fetch;
  const listeners = new Set<(session: GitHubSession | null) => void>();
  let session: GitHubSession | null = null;
  let restoring: Promise<void> | null = null;
  let overrideToken: string | null = null;
  const pendingOAuth = new Map<string, { readonly nonce: string; readonly verifier: string; readonly createdAt: number }>();

  const api = createGitHubApi({
    getToken: async () => overrideToken ?? (await restoreSession())?.token ?? null,
    fetchFn: options.fetchFn,
    apiBase: options.apiBase
  });

  function restoreSession(): Promise<GitHubSession | null> {
    if (session) return Promise.resolve(session);
    if (restoring) return restoring.then(() => session);
    restoring = options.sessionStore
      .load()
      .then(stored => {
        session = stored ? toSession(stored) : null;
      })
      .catch(error => {
        restoring = null;
        throw error;
      });
    return restoring.then(() => session);
  }

  function toSession(stored: GitHubStoredSession): GitHubSession {
    return { token: stored.token, login: stored.login, avatarUrl: stored.avatarUrl, provider: stored.provider };
  }

  async function setSession(next: GitHubSession | null): Promise<void> {
    if (next) {
      await options.sessionStore.save({ ...next, createdAt: Date.now() });
    } else {
      await options.sessionStore.clear();
    }
    api.clearCache();
    session = next;
    for (const listener of listeners) listener(next);
  }

  /** 用指定 token 校验并读取用户；期间覆盖 API 的默认 token 来源。 */
  async function fetchUser(token: string, signal?: AbortSignal): Promise<GitHubUser> {
    api.clearCache();
    overrideToken = token;
    try {
      return await api.getAuthenticatedUser(signal);
    } catch (cause) {
      if (cause instanceof GitHubApiError) throw loginError(cause);
      throw cause;
    } finally {
      overrideToken = null;
    }
  }

  return {
    async getSession(): Promise<GitHubSession | null> {
      return restoreSession();
    },

    async loginWithPat(token: string): Promise<GitHubSession> {
      const user = await fetchUser(token);
      const next: GitHubSession = { token, login: user.login, avatarUrl: user.avatarUrl, provider: 'pat' };
      await setSession(next);
      return next;
    },

    async beginOAuth(): Promise<GitHubOAuthRequest> {
      const clientId = typeof options.clientId === 'function' ? await options.clientId() : options.clientId;
      if (!clientId.trim()) throw new GitWorkbenchError('auth_required', 'GitHub OAuth client ID 未配置');
      const now = Date.now();
      for (const [state, pending] of pendingOAuth)
        if (now - pending.createdAt > 10 * 60_000) pendingOAuth.delete(state);
      const verifier = randomHex(32);
      const nonce = randomHex(16);
      const challenge = await pkceChallenge(verifier);
      const state = options.desktopOrigin ?
          callbackState(options.origin, options.callbackPath ?? '/github-callback', options.desktopOrigin, nonce)
        : `${nonce}${randomHex(16)}`;
      pendingOAuth.set(state, { nonce, verifier, createdAt: now });
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: options.redirectUri,
        scope: scopes.join(' '),
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'select_account'
      });
      return { authorizeUrl: `${AUTHORIZE_URL}?${params.toString()}`, state, nonce, verifier };
    },

    async completeOAuth(code, verifier, state, signal): Promise<GitHubSession> {
      if (!code || code.length > 4096 || state.length > 2048)
        throw new GitWorkbenchError('auth_invalid', 'GitHub 授权回调无效');
      const pending = pendingOAuth.get(state);
      pendingOAuth.delete(state);
      signal?.throwIfAborted();
      if (!pending || Date.now() - pending.createdAt > 10 * 60_000 || pending.verifier !== verifier)
        throw new GitWorkbenchError('auth_invalid', 'GitHub 授权状态已失效，请重新登录');
      if (
        !validStateNonce(
          state,
          pending.nonce,
          options.origin,
          options.callbackPath ?? '/github-callback',
          options.desktopOrigin
        )
      )
        throw new GitWorkbenchError('auth_invalid', 'GitHub 授权 nonce 校验失败');
      let token: string;
      try {
        const response = await fetchFn(options.exchangeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: options.redirectUri }),
          signal
        });
        if (!response.ok) {
          const code =
            response.status === 400 || response.status === 401 ? 'auth_required'
            : response.status === 429 ? 'rate_limited'
            : 'invalid_response';
          throw new GitHubApiError(code, `登录服务返回 ${response.status}`, response.status);
        }
        let json: { access_token?: unknown };
        try {
          json = (await response.json()) as { access_token?: unknown };
        } catch (cause) {
          throw new GitWorkbenchError('git_failed', '登录服务返回无法解析的内容', { cause });
        }
        if (typeof json.access_token !== 'string' || !json.access_token) {
          throw new GitHubApiError('invalid_response', '登录服务未返回 access_token', response.status);
        }
        token = json.access_token;
      } catch (cause) {
        if (cause instanceof GitHubApiError) throw loginError(cause);
        if (cause instanceof GitWorkbenchError || cause instanceof DOMException && cause.name === 'AbortError') throw cause;
        throw new GitWorkbenchError('network_failed', '无法连接 GitHub 登录服务', { cause });
      }
      signal?.throwIfAborted();
      const user = await fetchUser(token, signal);
      signal?.throwIfAborted();
      const next: GitHubSession = { token, login: user.login, avatarUrl: user.avatarUrl, provider: 'oauth' };
      await setSession(next);
      return next;
    },

    async refresh(): Promise<GitHubSession | null> {
      api.clearCache();
      session = null;
      restoring = null;
      return restoreSession();
    },

    async logout(): Promise<void> {
      const current = await restoreSession();
      if (current?.provider === 'oauth') {
        // 服务端撤销是尽力而为；本地清除才是登出的保证。
        try {
          await fetchFn(`${options.exchangeUrl}/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: current.token })
          });
        } catch {
          // 网络失败不阻止本地登出
        }
      }
      await setSession(null);
    },

    subscribe(listener: (session: GitHubSession | null) => void): () => void {
      listeners.add(listener);
      void restoreSession().then(current => listener(current));
      return () => listeners.delete(listener);
    }
  };
}
