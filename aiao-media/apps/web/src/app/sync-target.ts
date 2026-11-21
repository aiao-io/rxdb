import type { ProductAuthorization } from './supabase-auth';
import { validateSupabaseAuthConfig, type SupabaseAuthConfig } from './supabase-auth-config';

export type SyncTarget = { kind: 'platform'; config: SupabaseAuthConfig } | { kind: 'disconnected'; config: null };
const key = 'aiao-media-sync-target-v1';
type TargetStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** 平台配置只由部署方提供，用户只保存是否连接平台账号。 */
export function readSyncTarget(storage: TargetStorage, platform: SupabaseAuthConfig | null): SyncTarget {
  const saved = storage.getItem(key);
  if (saved === null) return platform ? { kind: 'platform', config: platform } : { kind: 'disconnected', config: null };
  const value: unknown = JSON.parse(saved);
  if (!value || typeof value !== 'object') throw new Error('同步目标配置损坏，请重新选择。');
  const target = value as Record<string, unknown>;
  if (target['kind'] === 'disconnected') return { kind: 'disconnected', config: null };
  if (target['kind'] === 'platform')
    return platform ? { kind: 'platform', config: platform } : { kind: 'disconnected', config: null };
  throw new Error('同步设置无效，请重新连接平台账号。');
}

/** 保存目标不产生上传，登录和首次绑定由各自流程确认。 */
export function saveSyncTarget(storage: TargetStorage, target: SyncTarget): void {
  if (target.kind !== 'platform' && target.kind !== 'disconnected') throw new Error('同步仅支持平台账号。');
  if (target.kind === 'platform') validateSupabaseAuthConfig(target.config);
  storage.setItem(key, JSON.stringify({ kind: target.kind }));
}

/** 检查平台同步协议与 RLS；不执行远端初始化或放宽权限。 */
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
  if (!result.ok) throw new Error('平台同步服务暂不可用，请稍后重试或联系服务方。');
  const data = (await result.json()) as Record<string, unknown>;
  if (data['protocol'] !== 1 || data['rls'] !== true || data['metadataOnly'] !== true)
    throw new Error('平台同步服务版本或权限不兼容，未上传数据，请联系服务方。');
}

/** 图片传输单独检查私有 bucket、版本和续传能力，metadata-only 项目不能伪装成文件备份。 */
export async function verifyImageSyncTarget(
  access: ProductAuthorization,
  request: typeof fetch = fetch
): Promise<void> {
  const result = await request(`${access.config.url}/rest/v1/rpc/media_file_capabilities`, {
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
  if (!result.ok) throw new Error('平台图片同步服务暂不可用，请稍后重试或联系服务方。');
  const data = (await result.json()) as Record<string, unknown>;
  if (
    data['protocol'] !== 1 ||
    data['privateBucket'] !== 'aiao-media-images' ||
    data['maxBytes'] !== 16777216 ||
    data['resumable'] !== true ||
    data['lifecycle'] !== 1 ||
    data['metadataOnly'] !== false
  )
    throw new Error('平台图片同步协议或私有存储不兼容，未上传原图，请联系服务方。');
}
