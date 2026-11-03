import { GitWorkbenchError } from '../git-protocol.js';
import type { GitHubAuth, GitHubSession } from './github-auth.js';

const PENDING_KEY = 'aiao-vscode.github-oauth-pending';
const DONE_KEY = 'aiao-vscode.github-oauth-done';
const PENDING_TTL_MS = 10 * 60 * 1000;

export interface PendingOAuth {
  readonly verifier: string;
  readonly nonce: string;
  readonly state: string;
  readonly at: number;
}

/** 登录完成通知的 localStorage 键；其他标签页监听 storage 事件据此刷新会话。 */
export function oauthDoneKey(): string {
  return DONE_KEY;
}

/** 把未完成的 PKCE 请求放进 localStorage，供 OAuth 弹窗（独立标签页）回调时取回。 */
export function savePendingOAuth(pending: PendingOAuth): void {
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
}

export function loadPendingOAuth(): PendingOAuth | null {
  const raw = localStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingOAuth>;
    if (
      typeof value.verifier !== 'string' ||
      typeof value.nonce !== 'string' ||
      typeof value.state !== 'string' ||
      typeof value.at !== 'number'
    ) {
      return null;
    }
    if (Date.now() - value.at > PENDING_TTL_MS) return null;
    return value as PendingOAuth;
  } catch {
    return null;
  }
}

export function clearPendingOAuth(): void {
  localStorage.removeItem(PENDING_KEY);
}

function notifyOAuthDone(login: string): void {
  localStorage.setItem(DONE_KEY, JSON.stringify({ login, at: Date.now() }));
}

/**
 * OAuth 回调落地处理：校验 state 与 pending 请求一致后交换 code 并通知其他标签页。
 * 在回调路由（/github-callback）的应用启动路径上调用。
 */
export async function completeOAuthCallback(auth: GitHubAuth, code: string, state: string): Promise<GitHubSession> {
  const pending = loadPendingOAuth();
  if (!pending) {
    throw new GitWorkbenchError('auth_invalid', 'OAuth 会话不存在或已过期，请重新发起登录');
  }
  try {
    if (state !== pending.state) {
      throw new GitWorkbenchError('auth_invalid', 'OAuth state 不匹配，请重新发起登录');
    }
    const session = await auth.completeOAuth(code, pending.verifier);
    notifyOAuthDone(session.login);
    return session;
  } finally {
    // 任何完成尝试都作废 pending 请求，防重放
    clearPendingOAuth();
  }
}
