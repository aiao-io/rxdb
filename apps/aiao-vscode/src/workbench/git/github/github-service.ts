import type { WorkbenchBackend } from '../../session.js';
import type { GitHubApi } from './github-api.js';
import { createGitHubApi } from './github-api.js';
import type { GitHubAuth, GitHubOAuthRequest } from './github-auth.js';
import { createGitHubAuth } from './github-auth.js';
import { createGitHubBackend } from './github-backend.js';
import type { GitHubSessionStore } from './github-session-store.js';
import { createIndexedDbSessionStore, createMemorySessionStore } from './github-session-store.js';
import type { GitHubSession } from './github-types.js';

/** 应用级 GitHub 配置；未显式指定 clientId 时从同源 Pages Function 读取。 */
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

async function loadDeploymentClientId(exchangeUrl: string, fetchFn: typeof fetch): Promise<string> {
  let response: Response;
  try {
    response = await fetchFn(exchangeUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });
  } catch (cause) {
    throw new Error('无法读取 GitHub 登录配置，请检查网络连接后重试', { cause });
  }
  if (response.status === 503) throw new Error('请在 Cloudflare Pages 配置 GITHUB_CLIENT_ID 后重新部署');
  if (!response.ok) throw new Error(`无法读取 GitHub 登录配置：HTTP ${response.status}`);
  let config: { clientId?: unknown } | null;
  try {
    config = (await response.json()) as typeof config;
  } catch (cause) {
    throw new Error('GitHub 登录配置接口未返回 JSON，请确认 Pages Functions 已部署', { cause });
  }
  const clientId = typeof config?.clientId === 'string' ? config.clientId.trim() : '';
  if (!clientId || clientId === PENDING_GITHUB_CLIENT_ID) {
    throw new Error('GitHub 登录配置缺少有效的 GITHUB_CLIENT_ID');
  }
  return clientId;
}

/** 装配认证、API 客户端与虚拟仓库后端；token 自动注入所有 API 请求。 */
export function createGitHubService(options: GitHubServiceOptions = {}): GitHubService {
  const config = resolveGitHubConfig(options.config);
  const sessionStore =
    options.sessionStore ??
    (typeof indexedDB !== 'undefined' ? createIndexedDbSessionStore() : createMemorySessionStore());
  const fetchFn = options.fetchFn ?? fetch;
  const auth = createGitHubAuth({
    clientId: async () =>
      config.clientId === PENDING_GITHUB_CLIENT_ID ?
        loadDeploymentClientId(config.exchangeUrl, fetchFn)
      : config.clientId,
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
    beginOAuth: () => auth.beginOAuth()
  };
}
