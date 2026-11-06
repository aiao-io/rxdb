/**
 * 回退加密信封的直连读写（POOL-US-101）：不经过同步实体，上传方直写、下载方直读。
 *
 * @remarks
 * 信封只在「服务器回退下载」这一条在线路径上消费，直连 PostgREST 没有同步收敛的时序问题；
 * 已认证用户可读密文信封、可给任意设备寄信封；修改和删除仅允许发布者操作。
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FallbackEnvelope } from '../p2p/fallback-crypto';

/** 上传方写回的信封行。 */
interface EnvelopeRow {
  readonly contentHash: string;
  readonly encHash: string;
  readonly recipientDeviceId: string;
  readonly kid: string;
  readonly epk: string;
  readonly iv: string;
  readonly ct: string;
  readonly tag: string;
}

/** 给每台已登记公钥的设备封装并写入信封；同一（密文副本哈希, 设备）重复写时更新自己的信封。 */
export const writeEnvelopes = async (client: SupabaseClient, rows: readonly EnvelopeRow[]): Promise<void> => {
  if (rows.length === 0) return;
  const { error } = await client
    .schema('p2p')
    .from('p2p_fallback_envelope')
    .upsert(
      rows.map(row => ({ ...row, id: crypto.randomUUID() })),
      { onConflict: '"encHash","recipientDeviceId"' }
    );
  if (error) throw error;
};

/** 按密文副本取本设备的信封；兼容升级前以内容哈希保存的旧信封。 */
export const envelopeFor = async (
  client: SupabaseClient,
  contentHash: string,
  deviceId: string,
  encHash: string
): Promise<FallbackEnvelope | null> => {
  const find = () =>
    client
      .schema('p2p')
      .from('p2p_fallback_envelope')
      .select('kid,epk,iv,ct,tag')
      .eq('contentHash', contentHash)
      .eq('recipientDeviceId', deviceId);
  const current = await find().eq('encHash', encHash).maybeSingle<FallbackEnvelope>();
  if (current.error) throw current.error;
  if (current.data) return current.data;
  const legacy = await find().is('encHash', null).maybeSingle<FallbackEnvelope>();
  if (legacy.error) throw legacy.error;
  return legacy.data;
};
