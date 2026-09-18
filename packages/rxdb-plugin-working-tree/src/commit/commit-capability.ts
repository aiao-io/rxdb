/**
 * @fileoverview 数据库级提交能力的启用与版本协商（FR-037，契约见 contracts/core-api.md §2）。
 *
 * @remarks
 * 这里有三个不相干的号：{@link COMMIT_PROTOCOL_VERSION}（命令层协议）、
 * {@link COMMIT_GRAPH_SCHEMA_VERSION}（提交图物理形状）、`RXDB_CHANGE_CODEC_VERSION`
 * （patch 编解码）。它们各自独立演进，因此比对逐个进行、报错也各报各的号——
 * 合成一句「版本不兼容」之后，用户无从判断该升客户端还是该跑迁移。
 *
 * 与 `assertSupportedRxDBSystemVersions()` 的**关键差异**：那边只拒「库比进程新」，
 * 因为系统 schema 有迁移阶梯能把落后的库补上来；能力三元组在 v1 **没有任何阶梯**，
 * 存着低于进程常量的值意味着这一行是旧库写的、而且永远不会有人更新它。继续跑就是
 * 拿新协议去写旧图。所以这里是**严格相等**。
 */

import type { EntityMetadata, RxDBCapabilityVersionKind, TransactionExecutor } from '@aiao/rxdb';
import {
  getEntityColumnName,
  getEntityMetadata,
  quoteSqlIdentifier,
  RXDB_CHANGE_CODEC_VERSION,
  RxDBError,
  sqlBooleanLiteral,
  sqlStringLiteral,
  sqlTimestampLiteral,
  UnsupportedRxDBSystemVersionError
} from '@aiao/rxdb';
import { WORKING_TREE_CAPABILITY } from '../capability-identity.js';
import {
  COMMIT_CAPABILITY_STATE_ID,
  COMMIT_GRAPH_SCHEMA_VERSION,
  COMMIT_PROTOCOL_VERSION,
  CommitCapabilityState
} from './commit-capability-state.entity.js';

/** 本进程支持的三个能力版本号。 */
export interface CommitCapabilityVersions {
  /** 命令层协议版本 */
  readonly protocolVersion: number;
  /** 提交图物理形状版本 */
  readonly schemaVersion: number;
  /** patch 编解码版本 */
  readonly codecVersion: number;
}

/** 库里那一行能力状态的只读视图。 */
export interface CommitCapabilityInfo extends CommitCapabilityVersions {
  /** 是否已启用提交能力 */
  readonly enabled: boolean;
  /** 启用时刻；未启用时为 `null` */
  readonly enabledAt: Date | null;
}

/**
 * 两个**本能力自有**号的归因标签。
 *
 * @remarks
 * 核心的 `RxDBSystemVersionKind` 只剩 `'system schema' | 'change codec'` 两支——提交概念随
 * 本包抽走之后，核心不再替插件枚举号名。于是这两个号改成自报归属：报错渲染成
 * `Unsupported RxDB workingTree commit protocol version: …`，用户一眼看得出该升哪个包。
 */
const COMMIT_PROTOCOL_KIND: RxDBCapabilityVersionKind = {
  capability: WORKING_TREE_CAPABILITY,
  kind: 'commit protocol'
};

const COMMIT_GRAPH_SCHEMA_KIND: RxDBCapabilityVersionKind = {
  capability: WORKING_TREE_CAPABILITY,
  kind: 'commit graph schema'
};

/**
 * 本进程支持的能力版本三元组。
 *
 * @remarks
 * 三个值一律**引用**各自的进程常量，不抄字面量：抄了之后，bump 常量的人不会在任何
 * 一处拿到编译失败，而 fail-closed 恰恰依赖这三个数和库里那行完全一致。
 */
export const SUPPORTED_COMMIT_CAPABILITY_VERSIONS: CommitCapabilityVersions = {
  protocolVersion: COMMIT_PROTOCOL_VERSION,
  schemaVersion: COMMIT_GRAPH_SCHEMA_VERSION,
  codecVersion: RXDB_CHANGE_CODEC_VERSION
};

/**
 * 表在、行不在时的错误文案。
 *
 * @remarks
 * 这是「`0004` 迁移没跑完」的现场，不是「未启用」。当成未启用会让 `enable()` 静默无效，
 * 用户看到的是「启用成功但什么都没发生」；文案里带上迁移名，是为了让人不必读代码就知道
 * 该去查哪一条迁移。
 */
const MISSING_CAPABILITY_ROW =
  `提交能力状态行缺失（id='${COMMIT_CAPABILITY_STATE_ID}'）：` +
  '迁移 0004-working-tree-commits 建了表但没写入这一行，或它被外部删除了。' +
  '这不是「未启用」，不能按未启用继续。';

/** 取列名，取不到就抛——拼 SQL 时拿到 `undefined` 会安静地产出一条语法错误的语句。 */
const columnOf = (metadata: EntityMetadata, field: keyof CommitCapabilityState): string => {
  const columnName = getEntityColumnName(metadata, field);
  if (!columnName) throw new RxDBError(`CommitCapabilityState 元数据里没有 '${field}' 对应的列`);
  return quoteSqlIdentifier(columnName);
};

/**
 * 拼一条启用 CAS。
 *
 * @param tableRef - 本后端的物理表引用，由 `executor.tableRef()` 解析
 * @param enabledAt - 本次调用想写入的启用时刻
 * @returns 单条 `UPDATE … SET … WHERE …`
 *
 * @remarks
 * 判据与写入必须落在**同一条**语句里：拆成「先查再写」就有了查与写之间的窗口，
 * 另一个 writer 的首次启用会被本次调用覆盖，而 `enabledAt` 是唯一能回答
 * 「这个库什么时候进的 v1 语义」的字段。命中 0 行 = 数据库自己说的「你不是第一个」。
 *
 * `SET` 里**只有** `enabled` 与 `enabledAt`。三个版本字段启用后只读——把手边的进程常量
 * 顺手写回去，在版本没变的那天完全看不出来，要到某个新客户端把旧库的版本行悄悄改成
 * 新版本时才炸，那时 fail-closed 已经失效了。
 */
const buildEnableCas = (tableRef: string, enabledAt: Date): string => {
  const metadata = getEntityMetadata(CommitCapabilityState);
  return [
    `UPDATE ${tableRef}`,
    `SET ${columnOf(metadata, 'enabled')} = ${sqlBooleanLiteral(true)},`,
    `${columnOf(metadata, 'enabledAt')} = ${sqlTimestampLiteral(enabledAt)}`,
    `WHERE ${columnOf(metadata, 'id')} = ${sqlStringLiteral(COMMIT_CAPABILITY_STATE_ID)}`,
    `AND ${columnOf(metadata, 'enabled')} = ${sqlBooleanLiteral(false)}`
  ].join(' ');
};

/**
 * 读库里那一行能力状态。
 *
 * @param executor - 当前事务执行器
 * @returns 能力状态视图
 * @throws {@link RxDBError} 能力行缺失时
 *
 * @remarks
 * **不做版本比对。** `isEnabled()` 与 `enable()` 是未启用库上仅有的两个可用成员
 * （core-api.md §1）；让读取也跟着 fail-closed，调用方连「这个库到底启没启用」都问不出来，
 * 只能靠 catch 猜。版本比对由 {@link assertSupportedCommitCapability} 在**要写**之前做。
 */
export const readCommitCapability = async (executor: TransactionExecutor): Promise<CommitCapabilityInfo> => {
  const [row] = await executor.getRepository(CommitCapabilityState).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: COMMIT_CAPABILITY_STATE_ID }] },
    limit: 1
  });
  if (!row) throw new RxDBError(MISSING_CAPABILITY_ROW);
  return {
    enabled: row.enabled,
    protocolVersion: row.protocolVersion,
    schemaVersion: row.schemaVersion,
    codecVersion: row.codecVersion,
    enabledAt: row.enabledAt
  };
};

/**
 * 这个库启用提交能力了吗。
 *
 * @param executor - 当前事务执行器
 * @returns 已启用返回 `true`
 *
 * @remarks
 * 只读，一条 CAS 都不发；版本不匹配也照常回答，理由同 {@link readCommitCapability}。
 */
export const isCommitCapabilityEnabled = async (executor: TransactionExecutor): Promise<boolean> =>
  (await readCommitCapability(executor)).enabled;

/**
 * 比对能力版本三元组，任一不匹配即 fail-closed。
 *
 * @param info - 库里读到的能力状态
 * @throws {@link UnsupportedRxDBSystemVersionError} 任一号与进程常量不相等时
 *
 * @remarks
 * 逐字段比对、各报各的号。用**严格相等**而不是 `>`：见本文件 `@fileoverview`。
 */
export const assertSupportedCommitCapability = (info: CommitCapabilityInfo): void => {
  const supported = SUPPORTED_COMMIT_CAPABILITY_VERSIONS;
  if (info.protocolVersion !== supported.protocolVersion) {
    throw new UnsupportedRxDBSystemVersionError(COMMIT_PROTOCOL_KIND, info.protocolVersion, supported.protocolVersion);
  }
  if (info.schemaVersion !== supported.schemaVersion) {
    throw new UnsupportedRxDBSystemVersionError(COMMIT_GRAPH_SCHEMA_KIND, info.schemaVersion, supported.schemaVersion);
  }
  // 第三个号是**核心的**（`RXDB_CHANGE_CODEC_VERSION`），所以报的是核心号名、不带能力归因：
  // codec 对不上时该升的是 `@aiao/rxdb` 本身，指向本插件只会把人带偏。
  if (info.codecVersion !== supported.codecVersion) {
    throw new UnsupportedRxDBSystemVersionError('change codec', info.codecVersion, supported.codecVersion);
  }
};

/**
 * 启用这个库的提交能力（幂等）。
 *
 * @param executor - 当前事务执行器
 * @returns 启用后的能力状态
 * @throws {@link RxDBError} 能力行缺失时
 * @throws {@link UnsupportedRxDBSystemVersionError} 版本三元组不匹配时
 *
 * @remarks
 * 顺序是**先比对、后写**：比对排在 CAS 之后的话，一个版本不兼容的客户端会先把库改成
 * 启用态再报错，fail-closed 就只剩下一个名字。
 *
 * 幂等不是「查到已启用就 return」——那把仲裁权从数据库挪回了进程。这里的幂等判据是
 * CAS **命中 0 行**：数据库自己说的「你不是第一个」。0 行之后重新读，而不是复用 CAS 之前
 * 那次读的结果：并发首次启用里，输的那一方手里的 `enabledAt` 还是 `null`，赢家写进去的
 * 时刻只能重新读回来。
 *
 * **`enabledAt` 取客户端时钟而不是 `CURRENT_TIMESTAMP`，这是有意的。** CAS 是一条手拼的
 * UPDATE，时刻只能作为字面量嵌进去，而 `CURRENT_TIMESTAMP` 在 SQLite 上求值成
 * `'YYYY-MM-DD HH:MM:SS'`，与本仓日期列的 ISO 存储形态对不上——`sqlTimestampLiteral` 存在
 * 的理由就是这个（`working-tree/branch-materialization.ts` 的
 * `buildActiveBranchSwitchStatements` 写明了同一条）。与之对照，不可变历史列走的是另一档：
 * `Commit.createdAt` 声明 `default: 'CURRENT_TIMESTAMP'` + `readonly`，由库自己填（FR-010）。
 * 两档的分界见 `commit-graph-guard.ts` 的 `markBranchCorrupted`。
 *
 * 代价是这个时刻的偏差上限等于客户端时钟漂移。可接受：`enabledAt` 只作为能力状态的展示值
 * 回给调用方，不参与任何比较——**幂等的仲裁位是 CAS 的 `rowsAffected`，不是它**。
 */
export const enableCommitCapability = async (executor: TransactionExecutor): Promise<CommitCapabilityInfo> => {
  const current = await readCommitCapability(executor);
  assertSupportedCommitCapability(current);

  const enabledAt = new Date();
  const { rowsAffected } = await executor.query(buildEnableCas(executor.tableRef(CommitCapabilityState), enabledAt));
  if (rowsAffected > 0) return { ...current, enabled: true, enabledAt };

  const stored = await readCommitCapability(executor);
  // 命中 0 行只有一个合法解释：这一行早就是启用态。读回来还是 false 的话，
  // 要么驱动谎报了 rowsAffected，要么这条 CAS 打在了别的行上——两种都不能
  // 当作「启用成功」返回，否则调用方会拿着一个 enabled=false 的「启用结果」继续跑。
  if (!stored.enabled) {
    throw new RxDBError('启用提交能力的 CAS 命中 0 行，但能力行仍是未启用态：这一次启用既没成功也没失败。');
  }
  return stored;
};
