import { sha256Hex } from '@aiao/rxdb';
import { createP2PFileManifest, MAX_P2P_CHUNK_SIZE, type P2PFileManifest } from './chunking.js';

/** 同步层使用的文件清单实体名。 */
export const P2P_FILE_MANIFEST_ENTITY = 'P2PFileManifest' as const;

/**
 * 持有声明：认证宿主验证过的某台设备持有某个内容。
 *
 * @remarks
 * 声明只在获得文件或显式删除文件时变更，不带过期时间。设备是否在线由信令 presence、mDNS
 * 或连接探测回答，不写进这条同步记录（US-704）。
 */
export interface P2PManifestRecord extends P2PFileManifest {
  /** 由 `contentHash` 与 `holderId` 派生的主键，同一设备对同一内容的写入幂等。 */
  readonly id: string;
  /** 由认证主体与设备派生的持有者 ID。 */
  readonly holderId: string;
  /** 持有方写入时刻（epoch 毫秒，持有方时钟）；只用于同一持有者的新旧比较，不与本机时钟比较。 */
  readonly updatedAt: number;
}

/** 认证宿主验证过的用户与设备。 */
export interface P2PPrincipal {
  /** 认证主体（用户）标识。 */
  readonly principal: string;
  /** 认证宿主为该用户登记的设备标识；同一用户的不同设备各自持有、各自撤回。 */
  readonly deviceId: string;
}

type RecordFields = Partial<Record<keyof P2PManifestRecord, unknown>>;

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const HOLDER_PATTERN = /^holder_[0-9a-f]{64}$/;
const encoder = new TextEncoder();

const isHash = (value: unknown): boolean => typeof value === 'string' && HASH_PATTERN.test(value);
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isChunkSize = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= MAX_P2P_CHUNK_SIZE;
const hasChunkHashes = (record: RecordFields): boolean =>
  Array.isArray(record.chunkHashes) &&
  record.chunkHashes.length === Math.ceil((record.size as number) / (record.chunkSize as number)) &&
  record.chunkHashes.every(isHash);

/**
 * 由认证身份派生稳定的持有者 ID；不把凭据本身写入清单。
 *
 * @throws TypeError 主体或设备标识为空
 */
export const deriveHolderId = (principal: P2PPrincipal): string => {
  if (!principal.principal.trim()) throw new TypeError('principal must not be empty');
  if (!principal.deviceId.trim()) throw new TypeError('deviceId must not be empty');
  return `holder_${sha256Hex(encoder.encode(JSON.stringify([principal.principal, principal.deviceId])))}`;
};

/** 创建清单主键，保证同一内容和持有者的写入幂等。 */
export const manifestId = (contentHash: string, holderId: string): string => {
  if (!HASH_PATTERN.test(contentHash)) throw new TypeError('contentHash must be a lowercase SHA-256 hash');
  if (!holderId) throw new TypeError('holderId must not be empty');
  const digest = sha256Hex(encoder.encode(`${contentHash}:${holderId}`));
  const variant = (8 + (Number.parseInt(digest[16] ?? '0', 16) % 4)).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
};

/** 结构规则按序检查：前面的规则保证后面的规则能安全读取字段。 */
const RECORD_RULES: ReadonlyArray<readonly [(record: RecordFields) => boolean, string]> = [
  [record => isHash(record.contentHash), 'contentHash must be a lowercase SHA-256 hash'],
  [record => typeof record.fileName === 'string' && record.fileName.length > 0, 'fileName must not be empty'],
  [record => isCount(record.size), 'size must be a non-negative safe integer'],
  [record => isChunkSize(record.chunkSize), `chunkSize must be an integer between 1 and ${MAX_P2P_CHUNK_SIZE}`],
  [hasChunkHashes, 'chunkHashes must list one SHA-256 hash per chunk'],
  [record => record.sourceUrl === undefined || typeof record.sourceUrl === 'string', 'sourceUrl must be a string'],
  [
    record => typeof record.holderId === 'string' && HOLDER_PATTERN.test(record.holderId),
    'holderId must be derived from an authenticated principal'
  ],
  [record => isCount(record.updatedAt), 'updatedAt must be a non-negative safe integer'],
  [
    record => record.id === manifestId(record.contentHash as string, record.holderId as string),
    'manifest id does not match contentHash and holderId'
  ]
];

const manifestRecordIssue = (value: unknown): string | undefined => {
  if (typeof value !== 'object' || value === null) return 'record must be an object';
  return RECORD_RULES.find(([isValid]) => !isValid(value as RecordFields))?.[1];
};

const assertManifestRecord = (record: P2PManifestRecord): void => {
  const issue = manifestRecordIssue(record);
  if (issue) throw new TypeError(`invalid manifest record: ${issue}`);
};

const copyRecord = (record: P2PManifestRecord): P2PManifestRecord => ({
  ...record,
  chunkHashes: [...record.chunkHashes]
});

const byNewest = (records: P2PManifestRecord[]): P2PManifestRecord[] =>
  records.sort((left, right) => right.updatedAt - left.updatedAt);

/**
 * 判断一条同步行是否符合清单的内容寻址规则。
 *
 * @remarks
 * 同步来的行可能来自旧版本或被篡改；选源前必须先过这一关，否则一行畸形的 `chunkHashes`
 * 就能让整个文件下载不成。
 */
export const isP2PManifestRecord = (value: unknown): value is P2PManifestRecord =>
  manifestRecordIssue(value) === undefined;

/**
 * 由认证身份生成持有声明，调用方不能自报其它 holderId。
 *
 * @throws RangeError `now` 不是非负安全整数
 * @throws TypeError 清单不符合内容寻址规则
 */
export const createManifestRecord = (
  manifest: P2PFileManifest,
  options: { readonly principal: P2PPrincipal; readonly now?: number }
): P2PManifestRecord => {
  const holderId = deriveHolderId(options.principal);
  const now = options.now ?? Date.now();
  if (!isCount(now)) throw new RangeError('now must be a non-negative safe integer');
  const record = { ...manifest, id: manifestId(manifest.contentHash, holderId), holderId, updatedAt: now };
  assertManifestRecord(record);
  return record;
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
}): Promise<P2PManifestRecord> => {
  const manifest = await createP2PFileManifest(options);
  return createManifestRecord(manifest, { principal: options.principal, now: options.updatedAt });
};

/** 判断清单是否由指定认证主体在指定设备上持有。 */
export const isManifestOwnedBy = (manifest: Pick<P2PManifestRecord, 'holderId'>, principal: P2PPrincipal): boolean =>
  manifest.holderId === deriveHolderId(principal);

/**
 * 从同步结果中取出某内容的持有声明。
 *
 * @remarks
 * 跳过结构畸形的行；每个持有者只留 `updatedAt` 最新的一行，结果按 `updatedAt` 倒序。
 * 声明不按时间过期，也不拿本机时钟比较远端时间戳——是否在线由连接探测回答。
 */
export const findP2PFileHolders = (
  records: readonly P2PManifestRecord[],
  contentHash: string
): readonly P2PManifestRecord[] => {
  const latest = new Map<string, P2PManifestRecord>();
  for (const record of records) {
    if (record.contentHash !== contentHash || !isP2PManifestRecord(record)) continue;
    const previous = latest.get(record.holderId);
    if (!previous || previous.updatedAt < record.updatedAt) latest.set(record.holderId, record);
  }
  return byNewest([...latest.values()]);
};

/** 本地清单仓库；同步适配器可把 upsert/revoke 调用映射到 RxDB repository。 */
export class P2PManifestStore {
  readonly #records = new Map<string, P2PManifestRecord>();
  readonly #revokedAt = new Map<string, number>();

  /** 当前登记的持有声明条数。 */
  get size(): number {
    return this.#records.size;
  }

  /**
   * 写入已由同步服务认证过的记录。
   *
   * 应用本地发布清单必须调用 {@link P2PManifestStore.upsertForSubject}，
   * 以便在进入同步仓库前校验 holderId。旧于墓碑或已有版本的写入被忽略。
   *
   * @throws TypeError 记录不符合内容寻址规则
   */
  upsert(record: P2PManifestRecord): void {
    assertManifestRecord(record);
    if (record.updatedAt <= (this.#revokedAt.get(record.id) ?? -1)) return;
    this.#revokedAt.delete(record.id);
    const current = this.#records.get(record.id);
    if (current && current.updatedAt >= record.updatedAt) return;
    this.#records.set(record.id, copyRecord(record));
  }

  /**
   * 认证主体写入自己的持有声明，禁止伪造其它 holderId。
   *
   * @throws Error 记录的 holderId 不是由该主体与设备派生的
   */
  upsertForSubject(record: P2PManifestRecord, principal: P2PPrincipal): void {
    if (record.holderId !== deriveHolderId(principal))
      throw new Error('manifest holderId does not match authenticated identity');
    this.upsert(record);
  }

  /**
   * 撤回持有声明，并记下墓碑挡住同步晚到的旧版本。
   *
   * @param revokedAt - 持有方时钟上的撤回时刻；本地还没见过这条声明时用它挡旧重放
   * @returns 本地确有这条声明并已删除时为 true
   * @remarks 墓碑取被撤回声明自己的 `updatedAt` 与 `revokedAt` 中较大者，不用本机时钟。
   */
  revoke(contentHash: string, holderId: string, revokedAt?: number): boolean {
    if (revokedAt !== undefined && !isCount(revokedAt))
      throw new RangeError('revokedAt must be a non-negative safe integer');
    const id = manifestId(contentHash, holderId);
    this.#revokedAt.set(id, Math.max(this.#records.get(id)?.updatedAt ?? -1, revokedAt ?? -1));
    return this.#records.delete(id);
  }

  /** 某内容的全部持有声明（副本），按 `updatedAt` 倒序；不因时间流逝删除任何声明。 */
  findHolders(contentHash: string): readonly P2PManifestRecord[] {
    return byNewest([...this.#records.values()].filter(record => record.contentHash === contentHash).map(copyRecord));
  }
}
