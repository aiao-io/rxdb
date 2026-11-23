import { Service } from '@angular/core';
import { GithubRemoteRepository } from './github-repository';
import { createGitHubApi, GitHubApi } from './github/github-api';
import { createGitHubAuth, GitHubAuth } from './github/github-auth';
import { createIndexedDbSessionStore, createMemorySessionStore } from './github/github-session-store';

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
    getToken: async () => (await this.auth.getSession())?.token ?? null
  });
  readonly remote = new GithubRemoteRepository(this.api);
  private async loadClientId(signal?: AbortSignal): Promise<string> {
    const response = await fetch(this.exchangeUrl, { headers: { Accept: 'application/json' }, cache: 'no-store', signal });
    if (!response.ok) throw new Error(`GitHub 登录配置不可用（HTTP ${response.status}）`);
    const value = (await response.json()) as { readonly clientId?: unknown };
    if (typeof value.clientId !== 'string' || !value.clientId.trim()) throw new Error('GitHub 登录配置缺少 clientId');
    return value.clientId.trim();
  }
}
