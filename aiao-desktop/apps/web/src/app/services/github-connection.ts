import { Service } from '@angular/core';
import { GithubRemoteRepository } from './github-repository';
import { createGitHubApi, GitHubApi } from './github/github-api';
import { createGitHubAuth, GitHubAuth } from './github/github-auth';
import { createIndexedDbSessionStore, createMemorySessionStore } from './github/github-session-store';

/** 登录会话变化的跨窗口通知键：登录、登出与失效清理都写它，其他窗口据此重载会话。 */
export const GITHUB_SESSION_UPDATED_KEY = 'aiao-desktop-github-session-updated';

/** 让同一桌面的其他窗口重新读取持久化会话；广播失败不影响本窗口已经完成的清理。 */
function broadcastSessionUpdate(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(GITHUB_SESSION_UPDATED_KEY, String(Date.now()));
  } catch {
    // 存储被禁用时其他窗口只能等下一次刷新，本窗口的会话已经清除
  }
}

@Service({ autoProvided: false })
export class GithubConnection {
  private readonly githubOAuthOrigin = 'https://vscode.aiao.io';
  private readonly exchangeUrl = new URL('/api/github-token', this.githubOAuthOrigin).href;
  readonly auth: GitHubAuth = createGitHubAuth({
    clientId: signal => this.loadClientId(signal),
    exchangeUrl: this.exchangeUrl,
    redirectUri: new URL('/redirect', this.githubOAuthOrigin).href,
    origin: this.githubOAuthOrigin,
    desktopOrigin: location.origin,
    callbackPath: '/github-callback',
    sessionStore:
      typeof indexedDB === 'undefined' ? createMemorySessionStore() : (
        createIndexedDbSessionStore('aiao-desktop-github-auth')
      )
  });
  readonly api: GitHubApi = createGitHubApi({
    getToken: async () => (await this.auth.getSession())?.token ?? null,
    // GitHub 拒绝了这个 token：持久化会话已经不能再用，清除它并让界面回到登录入口。
    onUnauthorized: async token => {
      if (await this.auth.invalidate(token)) broadcastSessionUpdate();
    }
  });
  readonly remote = new GithubRemoteRepository(this.api);
  private async loadClientId(signal?: AbortSignal): Promise<string> {
    const response = await fetch(this.exchangeUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal
    });
    if (!response.ok) throw new Error(`GitHub 登录配置不可用（HTTP ${response.status}）`);
    const value = (await response.json()) as { readonly clientId?: unknown };
    if (typeof value.clientId !== 'string' || !value.clientId.trim()) throw new Error('GitHub 登录配置缺少 clientId');
    return value.clientId.trim();
  }
}
