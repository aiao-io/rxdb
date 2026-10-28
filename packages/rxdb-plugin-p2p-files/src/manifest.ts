import { sha256Hex as syncSha256Hex } from '@aiao/rxdb';
import { createP2PFileManifest, type P2PFileManifest } from './chunking.js';

/** 同步层使用的文件清单实体名。 */
export const P2P_FILE_MANIFEST_ENTITY = 'P2PFileManifest' as const;

/** 未显式配置 TTL 时的持有声明存活时间。 */
export const DEFAULT_P2P_MANIFEST_TTL_MS = 5 * 60 * 1000;

/** 清单的最小 JSON Schema，供 RxDB 实体注册和同步过滤复用。 */
export const P2P_FILE_MANIFEST_SCHEMA = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  additionalProperties: false,
  required: ['id', 'contentHash', 'fileName', 'size', 'chunkSize', 'chunkHashes', 'holderId', 'updatedAt'],
  properties: {
    id: { type: 'string', minLength: 36, maxLength: 36 },
    contentHash: { type: 'string', minLength: 64, maxLength: 64 },
    fileName: { type: 'string', minLength: 1, maxLength: 1024 },
    size: { type: 'number', minimum: 0 },
    chunkSize: { type: 'number', minimum: 1 },
    chunkHashes: { type: 'array', items: { type: 'string', minLength: 64, maxLength: 64 } },
    sourceUrl: { type: 'string', maxLength: 4096 },
    holderId: { type: 'string', minLength: 1, maxLength: 256 },
    updatedAt: { type: 'number', minimum: 0 },
    expiresAt: { type: 'number', minimum: 0 }
  },
  indexes: ['contentHash', ['contentHash', 'holderId'], 'updatedAt']
} as const;

/** 带持有声明生命周期的同步清单。 */
export interface P2PManifestRecord extends P2PFileManifest {
  readonly id: string;
  readonly holderId: string;
  readonly updatedAt: number;
  readonly expiresAt?: number;
}

/** 认证身份派生的稳定持有者 ID；不把 token 本身写入清单。 */
export interface P2PPrincipal {
  readonly principal: string;
}

export const deriveHolderId = (authenticatedSubject: string | P2PPrincipal): string => {
  const subject = typeof authenticatedSubject === 'string' ? authenticatedSubject : authenticatedSubject.principal;
  if (!subject.trim()) throw new TypeError('authenticatedSubject must not be empty');
  return `holder_${syncSha256Hex(new TextEncoder().encode(subject))}`;
};

/** 创建清单主键，保证同一内容和持有者的写入幂等。 */
export const manifestId = (contentHash: string, holderId: string): string => {
  if (!/^[0-9a-f]{64}$/.test(contentHash)) throw new TypeError('contentHash must be a lowercase SHA-256 hash');
  if (!holderId) throw new TypeError('holderId must not be empty');
  const digest = syncSha256Hex(new TextEncoder().encode(`${contentHash}:${holderId}`));
  const variant = (8 + (Number.parseInt(digest[16] ?? '0', 16) % 4)).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
};

/** 仅允许由认证身份生成持有者声明，调用方不能自报其它 holderId。 */
export const createManifestRecord = (
  manifest: P2PFileManifest,
  options: { readonly authenticatedSubject: string; readonly now?: number; readonly ttlMs?: number }
): P2PManifestRecord => {
  const holderId = deriveHolderId(options.authenticatedSubject);
  const now = options.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now < 0) throw new RangeError('now must be a non-negative safe integer');
  const ttlMs = options.ttlMs ?? DEFAULT_P2P_MANIFEST_TTL_MS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new RangeError('ttlMs must be a positive safe integer');
  }
  return {
    ...manifest,
    id: manifestId(manifest.contentHash, holderId),
    holderId,
    updatedAt: now,
    expiresAt: now + ttlMs
  };
};

/** 从已经认证的主体创建带持有声明的文件清单。 */
export const createAuthenticatedP2PFileManifest = async (options: {
  readonly principal: P2PPrincipal;
  readonly fileName: string;
  readonly size: number;
  readonly chunkSize?: number;
  readonly sourceUrl?: string;
  readonly readChunk: (offset: number, size: number) => Promise<Uint8Array>;
  readonly updatedAt?: number;
  readonly ttlMs?: number;
}): Promise<P2PManifestRecord> => {
  const manifest = await createP2PFileManifest(options);
  return createManifestRecord(manifest, {
    authenticatedSubject: options.principal.principal,
    now: options.updatedAt,
    ttlMs: options.ttlMs
  });
};

/** 判断清单是否由指定认证主体持有。 */
export const isManifestOwnedBy = (manifest: Pick<P2PManifestRecord, 'holderId'>, principal: P2PPrincipal): boolean =>
  manifest.holderId === deriveHolderId(principal);

/** 从同步结果中筛出仍活跃的持有者，并按 holder 保留最新行。 */
export const findP2PFileHolders = (
  records: readonly P2PManifestRecord[],
  contentHash: string,
  options: { readonly now?: number; readonly ttlMs?: number } = {}
): readonly P2PManifestRecord[] => {
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? DEFAULT_P2P_MANIFEST_TTL_MS;
  const latest = new Map<string, P2PManifestRecord>();
  for (const record of records) {
    if (record.contentHash !== contentHash || record.updatedAt > now) continue;
    const expiresAt = Math.min(record.expiresAt ?? Number.POSITIVE_INFINITY, record.updatedAt + ttlMs);
    if (expiresAt <= now) continue;
    const previous = latest.get(record.holderId);
    if (!previous || previous.updatedAt < record.updatedAt) latest.set(record.holderId, record);
  }
  return [...latest.values()].sort((left, right) => right.updatedAt - left.updatedAt);
};

/** 本地清单仓库；同步适配器可把 upsert/revoke 调用映射到 RxDB repository。 */
export class P2PManifestStore {
  readonly #records = new Map<string, P2PManifestRecord>();
  readonly #revokedAt = new Map<string, number>();

  get size(): number {
    return this.#records.size;
  }

  /**
   * 写入已由同步服务认证过的记录。
   *
   * 应用本地发布清单必须调用 {@link P2PManifestStore.upsertForSubject}，
   * 以便在进入同步仓库前校验 holderId。
   */
  upsert(record: P2PManifestRecord): void {
    const expectedId = manifestId(record.contentHash, record.holderId);
    if (record.id !== expectedId) throw new Error('manifest id does not match contentHash and holderId');
    const revokedAt = this.#revokedAt.get(record.id);
    if (revokedAt !== undefined && record.updatedAt <= revokedAt) return;
    if (revokedAt !== undefined) this.#revokedAt.delete(record.id);
    const current = this.#records.get(record.id);
    if (current && current.updatedAt >= record.updatedAt) return;
    this.#records.set(record.id, { ...record, chunkHashes: [...record.chunkHashes] });
  }

  /** 认证主体写入自己的持有声明，禁止伪造其它 holderId。 */
  upsertForSubject(record: P2PManifestRecord, authenticatedSubject: string | P2PPrincipal): void {
    if (record.holderId !== deriveHolderId(authenticatedSubject))
      throw new Error('manifest holderId does not match authenticated identity');
    this.upsert(record);
  }

  revoke(contentHash: string, holderId: string): boolean {
    const id = manifestId(contentHash, holderId);
    const current = this.#records.get(id);
    const revokedAt = Math.max(Date.now(), current?.updatedAt ?? 0);
    this.#revokedAt.set(id, revokedAt);
    return this.#records.delete(id);
  }

  heartbeat(contentHash: string, holderId: string, now = Date.now(), ttlMs?: number): P2PManifestRecord {
    const id = manifestId(contentHash, holderId);
    const current = this.#records.get(id);
    if (!current) throw new Error('manifest holder is not registered');
    const next: P2PManifestRecord = {
      ...current,
      updatedAt: now,
      expiresAt: now + (ttlMs ?? DEFAULT_P2P_MANIFEST_TTL_MS)
    };
    this.#records.set(id, next);
    return next;
  }

  pruneExpired(now = Date.now()): number {
    let removed = 0;
    for (const [id, record] of this.#records) {
      if (
        (record.expiresAt !== undefined && record.expiresAt <= now) ||
        (record.expiresAt === undefined && record.updatedAt + DEFAULT_P2P_MANIFEST_TTL_MS <= now)
      ) {
        this.#records.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  findHolders(contentHash: string, now = Date.now()): readonly P2PManifestRecord[] {
    this.pruneExpired(now);
    return [...this.#records.values()]
      .filter(record => record.contentHash === contentHash && record.updatedAt <= now)
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(record => ({ ...record, chunkHashes: [...record.chunkHashes] }));
  }
}
