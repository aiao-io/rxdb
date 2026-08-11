/**
 * @fileoverview writer lease 与升级 guard 的纯校验工具
 *
 * RxDB 用**双层协调**应对"多 tab 共享 SQLite + 偶发 schema 升级"的场景：
 *
 * 1. **upgrade guard**（`rxdb_upgrade_guard` 表）：持久化的升级协调锁，
 *    状态机 `open → draining → migrating → failed`，负责把"我在迁移"
 *    "我有排他升级权"这两个事实落盘，防止两个 tab 同时跑 `migrateSystemSchema`。
 * 2. **writer lease**（`rxdb_writer_lease` 表）：每个活跃 tab 在 lease 表里
 *    周期性刷心跳（`RXDB_WRITER_HEARTBEAT_INTERVAL_MS`），迁移流程读到
 *    `active: true` 的 lease 就拒绝进入 `migrating`，避免把别人正在写的表抢走。
 *
 * 本文件**不**维护后台心跳或自动迁移 —— 它只把"持久化的快照"翻译成
 * 类型安全的快照对象，所有拒绝/接受都在调用方。`epoch` 单调递增、
 * `minProtocol` 守住协议兼容，是这里的两个核心不变式。
 */

export const RXDB_WRITER_PROTOCOL_VERSION = 1 as const;
export const RXDB_WRITER_LEASE_TTL_MS = 30_000 as const;
export const RXDB_WRITER_HEARTBEAT_INTERVAL_MS = 10_000 as const;
export const RXDB_UPGRADE_OWNER_TTL_MS = 30_000 as const;
export const RXDB_UPGRADE_GUARD_TABLE_NAME = 'rxdb_upgrade_guard' as const;
export const RXDB_WRITER_LEASE_TABLE_NAME = 'rxdb_writer_lease' as const;

/**
 * 升级 guard 的状态机。
 *
 * - `open`：空闲，可被某个 writer 申请为所有者并执行升级
 * - `draining`：已有 owner 申请，其他 writer 必须等待 lease 自然过期
 * - `migrating`：owner 正在执行升级 schema，全部 writer 一律拒绝写入
 * - `failed`：上一次升级失败残留的终态，必须由人工恢复（无法自动回退）
 */
export type RxDBUpgradeGuardState = 'open' | 'draining' | 'migrating' | 'failed';

export interface RxDBUpgradeGuardSnapshot {
  epoch: number;
  state: RxDBUpgradeGuardState;
  minProtocol: number;
}

export type RxDBWriterLeaseErrorCode =
  | 'writer_guard_missing'
  | 'writer_guard_invalid'
  | 'writer_lease_invalid'
  | 'writer_protocol_unsupported'
  | 'writer_guard_draining'
  | 'writer_guard_migrating'
  | 'writer_guard_failed'
  | 'writer_fenced'
  | 'upgrade_protocol_unsupported'
  | 'upgrade_owner_active'
  | 'upgrade_writer_active';

/** 持久化的 writer guard 无法授权请求的写入。 */
export class RxDBWriterLeaseError extends Error {
  override readonly name = 'RxDBWriterLeaseError';

  constructor(
    public readonly code: RxDBWriterLeaseErrorCode,
    message: string
  ) {
    super(message);
  }
}

const isPositiveSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** 已通过持久化 guard 校验的 writer lease 快照。 */
export interface RxDBWriterLeaseSnapshot {
  writerId: string;
  protocolVersion: number;
  epoch: number;
  validTtl: boolean;
  active: boolean;
}

/** 解析持久化的 writer guard，并拒绝未知状态或格式错误的版本。 */
export const readRxDBUpgradeGuard = (value: unknown): RxDBUpgradeGuardSnapshot => {
  if (value === undefined || value === null) {
    throw new RxDBWriterLeaseError('writer_guard_missing', 'RxDB writer upgrade guard is missing.');
  }
  if (typeof value !== 'object') {
    throw new RxDBWriterLeaseError('writer_guard_invalid', 'RxDB writer upgrade guard is invalid.');
  }

  const guard = value as Record<string, unknown>;
  const validState =
    guard['state'] === 'open' ||
    guard['state'] === 'draining' ||
    guard['state'] === 'migrating' ||
    guard['state'] === 'failed';
  if (!isPositiveSafeInteger(guard['epoch']) || !isPositiveSafeInteger(guard['minProtocol']) || !validState) {
    throw new RxDBWriterLeaseError('writer_guard_invalid', 'RxDB writer upgrade guard is invalid.');
  }
  return guard as unknown as RxDBUpgradeGuardSnapshot;
};

/** 使用数据库时间上的所有者状态，校验升级器是否可以声明持久化 guard。 */
export const assertRxDBUpgradeClaimable = (
  persistedGuard: unknown,
  upgraderId: string,
  upgraderProtocol: number
): number => {
  const guard = readRxDBUpgradeGuard(persistedGuard);
  if (!isPositiveSafeInteger(upgraderProtocol) || guard.minProtocol !== upgraderProtocol) {
    throw new RxDBWriterLeaseError(
      'upgrade_protocol_unsupported',
      `RxDB upgrade protocol ${String(upgraderProtocol)} cannot migrate guard protocol ${String(guard.minProtocol)}.`
    );
  }
  if (
    typeof upgraderId !== 'string' ||
    upgraderId.length === 0 ||
    typeof persistedGuard !== 'object' ||
    persistedGuard === null
  ) {
    throw new RxDBWriterLeaseError('writer_guard_invalid', 'RxDB writer upgrade guard is invalid.');
  }

  const persisted = persistedGuard as Record<string, unknown>;
  const ownerId = persisted['ownerId'];
  const ownerExpiresAt = persisted['ownerExpiresAt'];
  const ownerActive = persisted['ownerActive'];
  if (guard.state === 'open') {
    if (ownerId !== null || ownerExpiresAt !== null || ownerActive !== false) {
      throw new RxDBWriterLeaseError('writer_guard_invalid', 'RxDB writer upgrade guard is invalid.');
    }
    return guard.epoch;
  }
  if (
    typeof ownerId !== 'string' ||
    ownerId.length === 0 ||
    ownerExpiresAt === undefined ||
    ownerExpiresAt === null ||
    typeof ownerActive !== 'boolean'
  ) {
    throw new RxDBWriterLeaseError('writer_guard_invalid', 'RxDB writer upgrade guard is invalid.');
  }
  if (ownerId !== upgraderId && ownerActive) {
    throw new RxDBWriterLeaseError(
      'upgrade_owner_active',
      'Cannot migrate RxDB system schema because another upgrader owns the non-expired guard.'
    );
  }
  return guard.epoch;
};

/** draining guard 观察到其他活动 writer 后创建快速失败错误。 */
export const createRxDBActiveWriterLeaseError = (): RxDBWriterLeaseError =>
  new RxDBWriterLeaseError(
    'upgrade_writer_active',
    'Cannot migrate RxDB system schema while an active writer lease remains.'
  );

/** 校验迁移阶段仍存在的 lease，拒绝不完整、跨 epoch 或未知协议的记录。 */
export const readRxDBWriterLease = (
  value: unknown,
  persistedGuard: unknown,
  writerProtocol: number
): RxDBWriterLeaseSnapshot => {
  const guard = readRxDBUpgradeGuard(persistedGuard);
  if (!isPositiveSafeInteger(writerProtocol)) {
    throw new RxDBWriterLeaseError('writer_protocol_unsupported', 'RxDB writer protocol version is invalid.');
  }
  if (typeof value !== 'object' || value === null) {
    throw new RxDBWriterLeaseError('writer_lease_invalid', 'RxDB writer lease is invalid.');
  }

  const lease = value as Record<string, unknown>;
  const writerId = lease['writerId'];
  const protocolVersion = lease['protocolVersion'];
  const epoch = lease['epoch'];
  const validTtl = lease['validTtl'];
  const active = lease['active'];
  if (typeof writerId !== 'string' || writerId.length === 0 || !isPositiveSafeInteger(epoch)) {
    throw new RxDBWriterLeaseError('writer_lease_invalid', 'RxDB writer lease is incomplete or malformed.');
  }
  if (!isPositiveSafeInteger(protocolVersion)) {
    throw new RxDBWriterLeaseError('writer_protocol_unsupported', 'RxDB writer lease protocol version is invalid.');
  }
  if (typeof validTtl !== 'boolean' || typeof active !== 'boolean') {
    throw new RxDBWriterLeaseError('writer_lease_invalid', 'RxDB writer lease timestamps are invalid.');
  }
  if (protocolVersion !== writerProtocol || protocolVersion < guard.minProtocol) {
    throw new RxDBWriterLeaseError(
      'writer_protocol_unsupported',
      `RxDB writer lease protocol ${String(protocolVersion)} is not supported by protocol ${String(writerProtocol)}.`
    );
  }
  if (epoch !== guard.epoch) {
    throw new RxDBWriterLeaseError(
      'writer_lease_invalid',
      `RxDB writer lease epoch ${String(epoch)} does not match guard epoch ${String(guard.epoch)}.`
    );
  }
  if (!validTtl) {
    throw new RxDBWriterLeaseError('writer_lease_invalid', 'RxDB writer lease timestamps are invalid.');
  }
  return { writerId, protocolVersion, epoch, validTtl, active };
};

/** 解析 writer 可以使用的 epoch；对于所有不安全的 guard 状态直接拒绝。 */
export const resolveRxDBWriterEpoch = (
  persistedGuard: unknown,
  writerProtocol: number,
  writerEpoch?: number
): number => {
  const guard = readRxDBUpgradeGuard(persistedGuard);
  if (!isPositiveSafeInteger(writerProtocol)) {
    throw new RxDBWriterLeaseError('writer_protocol_unsupported', 'RxDB writer protocol version is invalid.');
  }
  if (guard.minProtocol > writerProtocol) {
    throw new RxDBWriterLeaseError(
      'writer_protocol_unsupported',
      `RxDB writer protocol ${String(writerProtocol)} is below required version ${String(guard.minProtocol)}.`
    );
  }
  if (guard.state !== 'open') {
    throw new RxDBWriterLeaseError(`writer_guard_${guard.state}`, `RxDB writer guard is ${guard.state}.`);
  }
  if (writerEpoch !== undefined && writerEpoch !== guard.epoch) {
    throw new RxDBWriterLeaseError(
      'writer_fenced',
      `RxDB writer epoch ${String(writerEpoch)} was fenced by epoch ${String(guard.epoch)}.`
    );
  }
  return guard.epoch;
};
