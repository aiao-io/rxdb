import type { WorkbenchBackend } from '../../session.js';
import type { GitHubApi } from './github-api.js';
import { createGitHubApi } from './github-api.js';
import type { GitHubAuth, GitHubOAuthRequest } from './github-auth.js';
import { createGitHubAuth } from './github-auth.js';
import { createGitHubBackend } from './github-backend.js';
import type { GitHubSessionStore } from './github-session-store.js';
import { createIndexedDbSessionStore, createMemorySessionStore } from './github-session-store.js';
import type { GitHubSession } from './github-types.js';

/** 应用级 GitHub 配置；OAuth App 注册前 clientId 为占位值，OAuth 登录会明确报错而不是静默降级。 */
export interface GitHubAppConfig {
  readonly clientId: string;
  /** 同源 Pages Function：POST 交换 code，POST /delete 撤销 token。 */
  readonly exchangeUrl: string;
  /** GitHub OAuth App 注册的回调地址（部署域 /redirect）。 */
  readonly redirectUri: string;
  readonly origin: string;
  readonly callbackPath: string;
}

/** 未注册 OAuth App 时的占位 clientId。 */
export const PENDING_GITHUB_CLIENT_ID = 'pending-aiao-vscode-oauth-app';

export function resolveGitHubConfig(overrides: Partial<GitHubAppConfig> = {}): GitHubAppConfig {
  const origin = overrides.origin ?? location.origin;
  return {
    clientId: overrides.clientId ?? PENDING_GITHUB_CLIENT_ID,
    exchangeUrl: overrides.exchangeUrl ?? `${origin}/api/github-token`,
    redirectUri: overrides.redirectUri ?? `${origin}/redirect`,
    origin,
    callbackPath: overrides.callbackPath ?? '/github-callback'
  };
}

export interface GitHubServiceOptions {
  readonly config?: Partial<GitHubAppConfig>;
  readonly sessionStore?: GitHubSessionStore;
  readonly fetchFn?: typeof fetch;
}

export interface GitHubService {
  readonly auth: GitHubAuth;
  readonly api: GitHubApi;
  createBackend(): WorkbenchBackend;
  getSession(): Promise<GitHubSession | null>;
  beginOAuth(): Promise<GitHubOAuthRequest>;
}

/** 装配认证、API 客户端与虚拟仓库后端；token 自动注入所有 API 请求。 */
export function createGitHubService(options: GitHubServiceOptions = {}): GitHubService {
  const config = resolveGitHubConfig(options.config);
  const sessionStore =
    options.sessionStore ??
    (typeof indexedDB !== 'undefined' ? createIndexedDbSessionStore() : createMemorySessionStore());
  const fetchFn = options.fetchFn;
  const auth = createGitHubAuth({
    clientId: config.clientId,
    exchangeUrl: config.exchangeUrl,
    redirectUri: config.redirectUri,
    origin: config.origin,
    callbackPath: config.callbackPath,
    sessionStore,
    fetchFn
  });
  const api = createGitHubApi({
    getToken: async () => (await auth.getSession())?.token ?? null,
    fetchFn
  });
  return {
    auth,
    api,
    createBackend: () => createGitHubBackend({ api }),
    getSession: () => auth.getSession(),
    async beginOAuth() {
      if (config.clientId === PENDING_GITHUB_CLIENT_ID) {
        throw new Error('GitHub OAuth 尚未配置 clientId：请先注册 OAuth 应用并把 clientId 填入部署配置');
      }
      return auth.beginOAuth();
    }
  };
}
