import { GitWorkbenchError } from '../git-protocol.js';
import type { GitHubAuth, GitHubSession } from './github-auth.js';
import { createIndexedDbSecretStore, type GitHubSecretStore } from './github-session-store.js';

const PENDING_KEY = 'aiao-vscode.github-oauth-pending';
const DONE_KEY = 'aiao-vscode.github-oauth-done';
const PENDING_TTL_MS = 10 * 60 * 1000;

export interface PendingOAuth {
  readonly verifier: string;
  readonly nonce: string;
  readonly state: string;
  readonly at: number;
}

let pendingStore: GitHubSecretStore<PendingOAuth> | undefined;

function store(): GitHubSecretStore<PendingOAuth> {
  return (pendingStore ??= createIndexedDbSecretStore<PendingOAuth>('aiao-vscode-github-oauth'));
}

/** 登录完成通知的 localStorage 键；其他标签页监听 storage 事件据此刷新会话。 */
export function oauthDoneKey(): string {
  return DONE_KEY;
}

/** 密封未完成的 PKCE 请求，供 OAuth 弹窗回调时取回；旧明文请求直接作废。 */
export async function savePendingOAuth(pending: PendingOAuth): Promise<void> {
  localStorage.removeItem(PENDING_KEY);
  await store().save(pending);
}

export async function loadPendingOAuth(): Promise<PendingOAuth | null> {
  localStorage.removeItem(PENDING_KEY);
  const value = await store().load();
  if (!value) return null;
  if (
    typeof value.verifier !== 'string' ||
    typeof value.nonce !== 'string' ||
    typeof value.state !== 'string' ||
    typeof value.at !== 'number' ||
    Date.now() - value.at > PENDING_TTL_MS
  ) {
    await clearPendingOAuth();
    return null;
  }
  return value;
}

export async function clearPendingOAuth(): Promise<void> {
  localStorage.removeItem(PENDING_KEY);
  await store().clear();
}

function notifyOAuthDone(): void {
  localStorage.setItem(DONE_KEY, String(Date.now()));
}

/**
 * OAuth 回调落地处理：校验 state 与 pending 请求一致后交换 code 并通知其他标签页。
 * 在回调路由（/github-callback）的应用启动路径上调用。
 */
export async function completeOAuthCallback(auth: GitHubAuth, code: string, state: string): Promise<GitHubSession> {
  const pending = await loadPendingOAuth();
  if (!pending) {
    throw new GitWorkbenchError('auth_invalid', 'OAuth 会话不存在或已过期，请重新发起登录');
  }
  try {
    if (state !== pending.state) {
      throw new GitWorkbenchError('auth_invalid', 'OAuth state 不匹配，请重新发起登录');
    }
    const session = await auth.completeOAuth(code, pending.verifier);
    notifyOAuthDone();
    return session;
  } finally {
    // 任何完成尝试都作废 pending 请求，防重放
    await clearPendingOAuth();
  }
}
