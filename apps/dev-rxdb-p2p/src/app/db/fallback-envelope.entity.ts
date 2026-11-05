/** 回退内容加密的信封实体（POOL-US-101）：内容密钥对每台接收设备分别封装，经同步盲传。 */
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/** 同步实体名（与 `p2p-schema.sql` 的 `rxdb_enable_sync_for_table` 一致）。 */
export const P2P_FALLBACK_ENVELOPE_ENTITY = 'P2PFallbackEnvelope';

@Entity({
  namespace: 'p2p',
  name: P2P_FALLBACK_ENVELOPE_ENTITY,
  tableName: 'p2p_fallback_envelope',
  // 省略 sync 让数据库级 local/remote 配置生效；信封属于同步集合。
  properties: [
    { name: 'contentHash', type: PropertyType.string, required: true },
    { name: 'recipientDeviceId', type: PropertyType.string, required: true },
    { name: 'kid', type: PropertyType.string, required: true },
    { name: 'epk', type: PropertyType.string, required: true },
    { name: 'iv', type: PropertyType.string, required: true },
    { name: 'ct', type: PropertyType.string, required: true },
    { name: 'tag', type: PropertyType.string, required: true }
  ],
  indexes: [
    { name: 'content_hash', properties: ['contentHash'] },
    { name: 'content_recipient', properties: ['contentHash', 'recipientDeviceId'], unique: true },
    { name: 'recipient_device', properties: ['recipientDeviceId'] }
  ]
})
export class P2PFallbackEnvelopeEntity extends EntityBase {
  /** 明文内容哈希（对应清单行的 `contentHash`）。 */
  contentHash!: string;
  /** 收件设备的登记 id（`p2p.devices.id`）。 */
  recipientDeviceId!: string;
  /** 设备密钥对的算法标识（`p256-1`）。 */
  kid!: string;
  /** 发送方一次性 ECDH 公钥（SPKI base64url）。 */
  epk!: string;
  /** 包封密钥的 GCM IV（base64）。 */
  iv!: string;
  /** 内容密钥密文（base64）。 */
  ct!: string;
  /** 包封密钥的 GCM tag（base64）。 */
  tag!: string;
}
