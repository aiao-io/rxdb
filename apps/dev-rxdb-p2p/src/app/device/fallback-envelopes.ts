/**
 * 回退加密信封的直连读写（POOL-US-101）：不经过同步实体，上传方直写、下载方直读。
 *
 * @remarks
 * 信封只在「服务器回退下载」这一条在线路径上消费，直连 PostgREST 没有同步收敛的时序问题；
 * 读只拿得到寄给本人设备的信封（RLS `envelope_select`），写对任何已认证用户开放
 * （信封只有收件私钥能解开，篡改会被 AEAD 检出）。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FallbackEnvelope } from '../p2p/fallback-crypto';

/** 上传方写回的信封行。 */
interface EnvelopeRow {
  readonly contentHash: string;
  readonly recipientDeviceId: string;
  readonly kid: string;
  readonly epk: string;
  readonly iv: string;
  readonly ct: string;
  readonly tag: string;
}

/** 给每台已登记公钥的设备封装并写入信封；同一（内容哈希, 设备）重复写时覆盖为最新信封。 */
export const writeEnvelopes = async (client: SupabaseClient, rows: readonly EnvelopeRow[]): Promise<void> => {
  if (rows.length === 0) return;
  const { error } = await client
    .schema('p2p')
    .from('p2p_fallback_envelope')
    .upsert(
      rows.map(row => ({ ...row, id: crypto.randomUUID() })),
      { onConflict: '"contentHash","recipientDeviceId"' }
    );
  if (error) throw error;
};

/** 取寄给本设备的一个信封；没有时为 null（RLS 只放行本人设备的信封）。 */
export const envelopeFor = async (
  client: SupabaseClient,
  contentHash: string,
  deviceId: string
): Promise<FallbackEnvelope | null> => {
  const { data, error } = await client
    .schema('p2p')
    .from('p2p_fallback_envelope')
    .select('kid,epk,iv,ct,tag')
    .eq('contentHash', contentHash)
    .eq('recipientDeviceId', deviceId)
    .maybeSingle<FallbackEnvelope>();
  if (error) throw error;
  return data;
};
