import { apiEndpoint } from '../platform/local-backend';

/** 一键授权入口的状态：确认中、可以使用、部署方没有开通。 */
export type OAuthStatus = 'checking' | 'available' | 'unavailable';

/**
 * 向 Worker 确认 Supabase 一键授权是否已开通。只有明确回答 `available: true` 才算可用；
 * 部署方没有开通、没有 Worker 的静态托管、网络失败和超时都视为不可用，界面据此引导到手动连接。
 */
export async function readOAuthAvailability(): Promise<boolean> {
  try {
    const response = await fetch(apiEndpoint('/api/supabase/oauth/status'), {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return false;
    return ((await response.json()) as { available?: unknown }).available === true;
  } catch {
    return false;
  }
}
