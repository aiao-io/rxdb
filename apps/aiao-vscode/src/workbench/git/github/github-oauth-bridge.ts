import { GitWorkbenchError } from '../git-protocol.js';
import type { GitHubAuth, GitHubSession } from './github-auth.js';
import { createIndexedDbSecretStore, type GitHubSecretStore } from './github-session-store.js';

const PENDING_KEY = 'aiao-vscode.github-oauth-pending';
const DONE_KEY = 'aiao-vscode.github-oauth-done';
const FAILED_KEY = 'aiao-vscode.github-oauth-failed';
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

/** 授权失败通知的 localStorage 键；值是 `<时间戳>:<错误码>`，用 {@link readOAuthFailure} 读出错误码。 */
export function oauthFailedKey(): string {
  return FAILED_KEY;
}

/** 从失败通知的值里取错误码（`access_denied` 是用户取消，其余记为 `oauth_failed`）；不是失败通知时为 null。 */
export function readOAuthFailure(value: string | null): string | null {
  const match = /^\d+:(access_denied|oauth_failed)$/.exec(value ?? '');
  return match ? match[1]! : null;
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

/** GitHub 带回授权失败：state 与 pending 请求一致时通知等待中的标签页；与成功路径一样，任何尝试都作废 pending。 */
async function failOAuthCallback(state: string, error: string): Promise<void> {
  const pending = await loadPendingOAuth();
  if (!pending) {
    throw new GitWorkbenchError('auth_invalid', 'OAuth 会话不存在或已过期，请重新发起登录');
  }
  try {
    if (state !== pending.state) {
      throw new GitWorkbenchError('auth_invalid', 'OAuth state 不匹配，请重新发起登录');
    }
    localStorage.setItem(FAILED_KEY, `${Date.now()}:${error === 'access_denied' ? error : 'oauth_failed'}`);
  } finally {
    await clearPendingOAuth();
  }
}

/**
 * 回调路由（/github-callback）的落地处理：带 code 时换取会话，带 error（用户取消或授权失败）时作废 pending 并通知
 * 等待中的标签页。两者必须恰有其一且带 state，否则拒绝。
 */
export async function settleOAuthCallback(auth: GitHubAuth, params: URLSearchParams): Promise<void> {
  const state = params.get('state');
  const code = params.get('code');
  const error = params.get('error');
  if (state && code && error === null) {
    await completeOAuthCallback(auth, code, state);
    return;
  }
  if (state && code === null && error) {
    await failOAuthCallback(state, error);
    return;
  }
  throw new GitWorkbenchError('auth_invalid', 'OAuth 回调缺少 code 或 state');
}
