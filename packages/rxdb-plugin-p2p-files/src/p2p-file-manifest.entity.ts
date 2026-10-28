import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/** 经同步复制的 P2P 文件清单；文件字节仍由 P2P 通道传输。 */
@Entity({
  namespace: 'p2p',
  name: 'P2PFileManifest',
  tableName: 'p2p_file_manifest',
  // 省略 sync 让数据库级 local/remote 配置生效；清单属于同步集合，不能固定某一种适配器。
  properties: [
    { name: 'contentHash', type: PropertyType.string, required: true },
    { name: 'fileName', type: PropertyType.string, required: true },
    { name: 'size', type: PropertyType.number, required: true },
    { name: 'chunkSize', type: PropertyType.integer, required: true },
    { name: 'chunkHashes', type: PropertyType.stringArray, required: true },
    { name: 'sourceUrl', type: PropertyType.string },
    { name: 'holderId', type: PropertyType.string, required: true },
    { name: 'expiresAt', type: PropertyType.number }
  ],
  indexes: [
    { name: 'content_hash', properties: ['contentHash'] },
    { name: 'content_holder', properties: ['contentHash', 'holderId'], unique: true },
    { name: 'updated_at', properties: ['updatedAt'] }
  ]
})
export class P2PFileManifestEntity extends EntityBase {
  contentHash!: string;
  fileName!: string;
  size!: number;
  chunkSize!: number;
  chunkHashes!: string[];
  sourceUrl?: string;
  holderId!: string;
  /** EntityBase 的 Date 时间戳是清单 wire `updatedAt` 的本地时间源。 */
  declare readonly updatedAt: Date;
  expiresAt?: number;
}
