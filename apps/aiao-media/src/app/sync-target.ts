import type { ProductAuthorization } from './supabase-auth';
import { validateSupabaseAuthConfig, type SupabaseAuthConfig } from './supabase-auth-config';

export type SyncTarget =
  { kind: 'platform' | 'custom'; config: SupabaseAuthConfig } | { kind: 'disconnected'; config: null };
const key = 'aiao-media-sync-target-v1';
type TargetStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** 目标选择只保留公开配置，断开后不会自动改用其他项目。 */
export function readSyncTarget(storage: TargetStorage, platform: SupabaseAuthConfig | null): SyncTarget {
  const saved = storage.getItem(key);
  if (saved === null) return platform ? { kind: 'platform', config: platform } : { kind: 'disconnected', config: null };
  const value: unknown = JSON.parse(saved);
  if (!value || typeof value !== 'object') throw new Error('同步目标配置损坏，请重新选择。');
  const target = value as Record<string, unknown>;
  if (target['kind'] === 'disconnected') return { kind: 'disconnected', config: null };
  if (target['kind'] === 'platform' && platform) return { kind: 'platform', config: platform };
  if (target['kind'] === 'custom') return { kind: 'custom', config: validateSupabaseAuthConfig(target['config']) };
  throw new Error('同步目标不可用，请重新选择。');
}

/** 保存目标不产生上传，登录和首次绑定由各自流程确认。 */
export function saveSyncTarget(storage: TargetStorage, target: SyncTarget): void {
  const config = target.kind === 'custom' ? validateSupabaseAuthConfig(target.config) : null;
  storage.setItem(key, JSON.stringify({ kind: target.kind, ...(config ? { config } : {}) }));
}

/** 检查所选项目的协议与 RLS；不执行远端初始化或放宽权限。 */
export async function verifySyncTarget(access: ProductAuthorization, request: typeof fetch = fetch): Promise<void> {
  const result = await request(`${access.config.url}/rest/v1/rpc/media_sync_capabilities`, {
    method: 'POST',
    headers: {
      apikey: access.config.anonKey,
      authorization: `Bearer ${access.session.access_token}`,
      'content-type': 'application/json'
    },
    body: '{}',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(15000)
  });
  if (!result.ok) throw new Error('同步项目未初始化、无访问权限或无法连接。请由项目所有者审阅并执行初始化 SQL。');
  const data = (await result.json()) as Record<string, unknown>;
  if (data['protocol'] !== 1 || data['rls'] !== true || data['metadataOnly'] !== true)
    throw new Error('同步项目版本或 RLS 不兼容，未上传数据。');
}
