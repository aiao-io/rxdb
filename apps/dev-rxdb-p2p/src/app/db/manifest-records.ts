/**
 * 清单实体行与线上记录（`P2PManifestRecord`）之间的转换，以及按内容归并成界面上的「共享文件」。
 *
 * @remarks
 * 同步来的行可能来自旧版本或被篡改，先过 `isP2PManifestRecord` 再用于选源；
 * 实体的 `updatedAt` 是 Date，记录里是 epoch 毫秒，`sourceUrl` 在库里是 null、在记录里是缺省。
 */
import { findP2PFileHolders, isP2PManifestRecord, type P2PManifestRecord } from '@aiao/rxdb-plugin-p2p';

/** 清单实体行里用到的字段。 */
export interface ManifestRow {
  readonly id: string;
  readonly contentHash: string;
  readonly fileName: string;
  readonly size: number;
  readonly chunkSize: number;
  readonly chunkHashes: readonly string[];
  readonly sourceUrl: string | null;
  readonly holderId: string;
  readonly updatedAt: Date;
}

/** 界面上的一个共享文件：同一内容的全部持有声明。 */
export interface SharedFile {
  readonly contentHash: string;
  /** 最新那条声明，下载按它的块划分取数与校验。 */
  readonly manifest: P2PManifestRecord;
  /** 每个持有者最新的一条声明，按 `updatedAt` 倒序。 */
  readonly holders: readonly P2PManifestRecord[];
  /** 有持有者把文件传到了服务器，可以回退下载。 */
  readonly serverCopy: boolean;
}

/** 实体行转线上记录；不符合内容寻址规则的行返回 null。 */
export const recordOf = (row: ManifestRow): P2PManifestRecord | null => {
  const record = {
    id: row.id,
    contentHash: row.contentHash,
    fileName: row.fileName,
    size: row.size,
    chunkSize: row.chunkSize,
    chunkHashes: [...row.chunkHashes],
    ...(row.sourceUrl ? { sourceUrl: row.sourceUrl } : {}),
    holderId: row.holderId,
    updatedAt: row.updatedAt.getTime()
  };
  return isP2PManifestRecord(record) ? record : null;
};

/** 按内容归并持有声明，最新的文件排在前面。 */
export const groupSharedFiles = (records: readonly P2PManifestRecord[]): SharedFile[] =>
  [...new Set(records.map(record => record.contentHash))]
    .map(contentHash => {
      const holders = findP2PFileHolders(records, contentHash);
      return {
        contentHash,
        manifest: holders[0] as P2PManifestRecord,
        holders,
        serverCopy: holders.some(record => record.sourceUrl !== undefined)
      };
    })
    .sort((left, right) => right.manifest.updatedAt - left.manifest.updatedAt);
