/**
 * @fileoverview 变更单元模型与内容指纹（FR-003，契约见 data-model.md §2.4 / §2.7）。
 *
 * @remarks
 * **这是指纹的唯一口径。** NEW / UPDATE / DELETE 与完整事务都归一成同一种
 * {@link CommitChangeUnit}，于是「工作树里这个单元和已提交的那个是不是同一份内容」
 * 只有一个答案。`WorkingTreeEntry.fingerprint`（US-306）、`Commit.contentFingerprint`
 * （US-305）与 `commit-graph-guard.ts` 的重算（T038）三处**全部**走这里，
 * 各写各的那天不会有任何报错——遍历与校验各自自洽，只是看见的不是同一张图。
 *
 * ## 摘要的输入集合：恰好是 `CommitChangeSet` 落库的那九列
 *
 * 守卫只拿得到落库行，所以摘要必须能**只从落库行重算出来**。由此两边都被钉死：
 *
 * - **不能多。** {@link CommitChangeUnit.baseFingerprint} 在 §2.4 与 §2.7 两张表里都
 *   **不存在**——它是捕获期留在内存里、供 US-306 折叠与 US-308 冲突检测用的字段。
 *   把它算进摘要，守卫就永远重算不出原值，每一条自洽的链都会被判成损坏。
 * - **不能少。** 落库了却不进摘要的列，被外部改写后 `contentFingerprint` 纹丝不动，
 *   FR-022 的防篡改面上就多一个洞。
 *
 * ## 规范化取的是**落库形态**，不是内存形态
 *
 * `patch` / `inversePatch` 是 `PropertyType.json` 列，进出各走一次 `JSON.stringify` /
 * `JSON.parse`。摘要若按内存对象原样算，重算时就会在这三处分叉，所以
 * {@link canonicalize} 直接对齐 JSON 的语义：键序不进摘要（`jsonb` 会重排键）、
 * 值为 `undefined` 的键等同于不存在、`Date` 取其 ISO 串、非有限数取 `null`。
 *
 * 落不了库的值（函数、`Map`、`bigint`、`symbol`）一律**抛错**而不是近似成某个占位值：
 * 近似会给出一个确定但无意义的摘要——两份不同的内容拿到同一个指纹，而它们本来在落库
 * 那一步就会失败或变形。
 *
 * `Uint8Array` 是唯一一处**不**与 JSON 往返同形的值：加密列的密文由 codec 有意留成裸字节
 * （见 `system/change-codec.ts` 的 `encodeRxDBChangePatch`），此处按字节入摘要而不是按
 * `JSON.stringify` 出来的 `{"0":222,…}`。**T038 / T041 的前提**：守卫重算前必须把行经
 * 同一份 codec 解回裸字节，否则加密列的 commit 会被判成损坏。
 *
 * ## 两个摘要域互不相交
 *
 * 单元摘要与 commit 摘要各带一个域前缀（`UNIT_DOMAIN` / `COMMIT_DOMAIN`）。
 * 共用一个取值域时，一个单元的指纹可能恰好也是某个 commit 的合法指纹，篡改检测就多出
 * 一条可替换路径。域串里的 `v1` 同时是算法版本：将来换算法必须换这个串，让新旧值一眼
 * 不可比，而不是悄悄给出另一批同形的 hex。
 */

import { RxDBError } from '../RxDBError.js';
import { sha256Hex } from '../system/sha256.js';
import type { CommitKind } from './commit.entity.js';

/** 单元摘要的域分隔前缀；`v1` 是算法版本，换算法必须换它。 */
const UNIT_DOMAIN = 'rxdb.commit.change-unit.v1';

/** commit 摘要的域分隔前缀；`v1` 是算法版本，换算法必须换它。 */
const COMMIT_DOMAIN = 'rxdb.commit.content.v1';

/** 变更单元的操作类型，与 `CommitChangeSet.operation` 同一取值域。 */
export type CommitChangeUnitOperation = 'insert' | 'update' | 'delete';

/** 变更单元的来源，与 `CommitChangeSet.origin` 同一取值域。 */
export type CommitChangeUnitOrigin = 'local' | 'remote_sync';

/**
 * 进摘要的那部分单元内容——恰好是 `CommitChangeSet` 持久化的九列。
 *
 * @remarks
 * 单列成型是为了让 {@link computeChangeUnitFingerprint} 的形参说清楚「哪些字段进摘要」。
 * 往这个接口上加字段 = 改变全库已有指纹的口径，**必须**同时换 `UNIT_DOMAIN` 的版本号。
 */
export interface CommitChangeUnitContent {
  /** 单元 id；完整事务的多行共享同一个值——拆散它等于把原子写入拆成多笔独立变更 */
  readonly unitId: string;
  /** 所属事务 id；非事务写入为 `null` */
  readonly transactionId: string | null;
  /** 实体命名空间 */
  readonly namespace: string;
  /** 实体名 */
  readonly entity: string;
  /** 实体主键 */
  readonly entityId: string;
  /** 操作类型 */
  readonly operation: CommitChangeUnitOperation;
  /** 正向字段变更包；DELETE 无正向内容时为 `null` */
  readonly patch: Record<string, unknown> | null;
  /** 反向字段变更包，用于恢复；NEW 无反向内容时为 `null` */
  readonly inversePatch: Record<string, unknown> | null;
  /** 变更来源；远端同步产生的未提交变化是 `remote_sync` */
  readonly origin: CommitChangeUnitOrigin;
}

/**
 * 一个可比较的变更单元（FR-003）。
 *
 * @remarks
 * NEW / UPDATE / DELETE 与完整事务共用这一种形状：各自保留实体身份
 * （`namespace` / `entity` / `entityId`）、操作类型（`operation`）、基线版本指纹
 * （{@link CommitChangeUnit.baseFingerprint}）与当前版本指纹
 * （{@link CommitChangeUnit.fingerprint}）。
 */
export interface CommitChangeUnit extends CommitChangeUnitContent {
  /**
   * 捕获这条变更时实体所处版本的指纹；该实体此前没有版本（NEW）时为 `null`。
   *
   * @remarks
   * **不进摘要。** 没有任何一张表持久化它（§2.4 与 §2.7 都没有这一列），
   * 而 `commit-graph-guard.ts` 只能从落库行重算摘要。它是内存内的字段，
   * 供 US-306 的折叠与 US-308 的冲突检测判断「我这条变更是基于哪个版本写的」。
   */
  readonly baseFingerprint: string | null;
  /** 当前版本指纹，由 {@link computeChangeUnitFingerprint} 算出 */
  readonly fingerprint: string;
}

/** {@link computeCommitContentFingerprint} 的输入：进 commit 摘要的全部内容。 */
export interface CommitContentFingerprintInput {
  /** 提交类型 */
  readonly kind: CommitKind;
  /** 父 commit id，**有序**：第 0 个就是 `firstParentId` */
  readonly parentIds: readonly string[];
  /** **最终落库**的提交消息，不是调用方原始入参；见 {@link computeCommitContentFingerprint} */
  readonly message: string | null;
  /** **最终落库**的作者，不是调用方原始入参；见 {@link computeCommitContentFingerprint} */
  readonly author: string | null;
  /** 变更单元，**有序**：`sequence` 按此顺序发放，恢复也按此顺序重放 */
  readonly units: readonly CommitChangeUnitContent[];
}

/** 规范化时报错要指出出错的位置，否则一个深层非法值只能靠二分查出来。 */
const rejectValue = (path: string, value: unknown): never => {
  const kind = typeof value === 'object' ? (value?.constructor?.name ?? 'object') : typeof value;
  throw new RxDBError(`变更单元的 ${path} 是 ${kind}，它落不进 JSON 列，不能参与内容指纹。`);
};

/** 带长度前缀的原子，让拼接是单射的：没有它，`{ab:'c'}` 与 `{a:'bc'}` 是同一串字节。 */
const atom = (tag: string, text: string): string => `${tag}${text.length}:${text}`;

/** 空位标记：`null`、`undefined` 与非有限数落库都是 `null`，摘要里也只有这一个形态。 */
const NOTHING = 'z';

const canonicalizeBytes = (value: Uint8Array): string => {
  let hex = '';
  for (const byte of value) hex += byte.toString(16).padStart(2, '0');
  return atom('x', hex);
};

const canonicalizeNumber = (value: number): string =>
  // JSON.stringify(NaN) 与 (Infinity) 都是 `null`，`-0` 落库成 `0`：摘要取的是落库形态。
  Number.isFinite(value) ? atom('d', String(value === 0 ? 0 : value)) : NOTHING;

const isPlainObject = (value: object): boolean => {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const canonicalizeArray = (value: readonly unknown[], path: string): string => {
  let encoded = `a${value.length}:`;
  for (const [index, item] of value.entries()) encoded += canonicalize(item, `${path}[${index}]`);
  return encoded;
};

const canonicalizeObject = (value: Record<string, unknown>, path: string): string => {
  // 键序排序不是洁癖：`jsonb` 会重排键，JSON 往返也不保证顺序，按原序入摘要会让重算随机失败。
  // 值为 `undefined` 的键被丢掉，与 `JSON.stringify` 的行为一致。
  const keys = Object.keys(value)
    .filter(key => value[key] !== undefined)
    .sort();
  let encoded = `o${keys.length}:`;
  for (const key of keys) encoded += atom('k', key) + canonicalize(value[key], `${path}.${key}`);
  return encoded;
};

/**
 * 把任意值编码成自定界的规范串。
 *
 * @param value - 待编码的值
 * @param path - 出错时用于定位的路径，如 `patch.outer.list[1]`
 * @returns 自定界的规范串
 * @throws {@link RxDBError} 值落不进 JSON 列时
 */
function canonicalize(value: unknown, path: string): string {
  if (value === null || value === undefined) return NOTHING;
  if (typeof value === 'string') return atom('s', value);
  if (typeof value === 'number') return canonicalizeNumber(value);
  if (typeof value === 'boolean') return value ? 'b1' : 'b0';
  if (typeof value !== 'object') return rejectValue(path, value);
  if (value instanceof Uint8Array) return canonicalizeBytes(value);
  // Date 落进 JSON 列就是它的 ISO 串——摘要与之同形，重算才对得上。
  if (value instanceof Date) return atom('s', value.toISOString());
  if (Array.isArray(value)) return canonicalizeArray(value, path);
  if (!isPlainObject(value)) return rejectValue(path, value);
  return canonicalizeObject(value as Record<string, unknown>, path);
}

/** 定死文本编码：同一段文本在任何调用点都必须按同一种编码入摘要。 */
const textEncoder = new TextEncoder();

const digest = (domain: string, payload: string): string => sha256Hex(textEncoder.encode(`${domain} ${payload}`));

/**
 * 算一个变更单元的内容指纹（FR-003）。
 *
 * @param content - 单元内容；只有 `CommitChangeSet` 落库的那九列参与
 * @returns 64 位小写 hex
 * @throws {@link RxDBError} `patch` / `inversePatch` 里有落不进 JSON 列的值时
 *
 * @remarks
 * 形参刻意收窄成 {@link CommitChangeUnitContent}：传一个完整的 {@link CommitChangeUnit}
 * 进来照常可用（结构子类型），但 `baseFingerprint` 与 `fingerprint` 都读不到，
 * 也就不可能被误算进摘要。理由见本文件 `@fileoverview`。
 */
export const computeChangeUnitFingerprint = (content: CommitChangeUnitContent): string =>
  digest(
    UNIT_DOMAIN,
    [
      atom('s', content.unitId),
      content.transactionId === null ? NOTHING : atom('s', content.transactionId),
      atom('s', content.namespace),
      atom('s', content.entity),
      atom('s', content.entityId),
      atom('s', content.operation),
      canonicalize(content.patch, 'patch'),
      canonicalize(content.inversePatch, 'inversePatch'),
      atom('s', content.origin)
    ].join('')
  );

/**
 * 算一个 commit 的内容指纹（FR-027），由单元指纹合成。
 *
 * @param input - commit 的内容；`id` / `operationId` / `createdAt` **不在其中**
 * @returns 64 位小写 hex
 * @throws {@link RxDBError} 任一单元的 patch 里有落不进 JSON 列的值时
 *
 * @remarks
 * **`message` / `author` 必须是最终落库值。** `writeCommit()` 会把普通 commit 的消息
 * trim、把两种系统根节点的消息换成 `SYSTEM_COMMIT_MESSAGES[kind]`；传原始入参进来，
 * 落库的是一个值、摘要算的是另一个值，`assertCommitGraphIntact()` 会把每一个系统根节点
 * 判成损坏。
 *
 * **单元指纹现算，不采信 `unit.fingerprint`。** 守卫只能从 `CommitChangeSet` 行重建单元，
 * 那里没有 `fingerprint` 列；写入侧若采信入参，一个伪造的 fingerprint 就能让两条内容不同
 * 的 commit 得到相同的指纹。
 *
 * 排除的三个字段各有理由：`id` 与 `operationId` 是**身份**不是内容（一次重试会换掉 `id`，
 * 但它仍是同一次提交）；`createdAt` 由数据库时钟给，构造期根本不知道它的值。
 */
export const computeCommitContentFingerprint = (input: CommitContentFingerprintInput): string => {
  const parents = `p${input.parentIds.length}:${input.parentIds.map(id => atom('s', id)).join('')}`;
  const fingerprints = input.units.map(unit => atom('f', computeChangeUnitFingerprint(unit)));
  return digest(
    COMMIT_DOMAIN,
    [
      atom('s', input.kind),
      parents,
      input.message === null ? NOTHING : atom('s', input.message),
      input.author === null ? NOTHING : atom('s', input.author),
      `u${input.units.length}:${fingerprints.join('')}`
    ].join('')
  );
};
