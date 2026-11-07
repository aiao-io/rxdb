/** 全团队已登记设备的公钥列表（POOL-US-101）：上传方给每台设备各封装一个信封。 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** 一台设备的回退加密公钥（SPKI base64url）；设备还没登记公钥时 `publicKeyBase64` 为 null。 */
export interface TeamDeviceKey {
  readonly deviceId: string;
  readonly publicKeyBase64: string | null;
}

/**
 * 读全团队设备公钥：`p2p.devices` 的 RLS 只放行本人设备，公钥交换走
 * SECURITY DEFINER 的 `p2p.team_device_keys()`（只暴露设备 id 与公钥，不暴露账号）。
 */
export const teamDeviceKeys = async (client: SupabaseClient): Promise<readonly TeamDeviceKey[]> => {
  const response = (await client.schema('p2p').rpc('team_device_keys')) as unknown as {
    readonly data: readonly { readonly device_id: string; readonly public_key: string | null }[] | null;
    readonly error: unknown;
  };
  if (response.error) throw response.error;
  return (response.data ?? []).map(row => ({ deviceId: row.device_id, publicKeyBase64: row.public_key }));
};
