/**
 * @fileoverview 交换记录的 JSON 编解码（US-316）：纯函数，不读库。
 *
 * @remarks
 * 交换记录在两端之间走 JSON：客户端把 `exportCommits()` 的记录上传，服务端把它认可（或自己合成）的记录下发，
 * 另一台设备收下之后交给 `importCommits()`。JSON 形态与内存形态只差一处：`createdAt` 在内存里是 `Date`，JSON 没有日期类型，
 * 线上写成 `toISOString()` 的串。其余字段——包括单元的两份补丁——本来就是 JSON 值（`commit-exchange.ts` 的「落库形态」），
 * 过一遍 `JSON.stringify` / `JSON.parse` 原样不变，指纹也不变。
 *
 * ## 解析为什么严格
 *
 * 宽松的解析总是在「修正」，而每一种修正都是静默的——它改掉的恰恰是「两端对协议的理解一致不一致」这件事本身：
 *
 * - **多出来的字段**：丢掉它，发送方以为它被传达了。多出来的常常是协议漂移的第一个信号——新版本加了字段，或者把
 *   捕获期的 `fingerprint` / `baseFingerprint`、`CommitChangeSet` 的 `sequence` 一并带了过来——而它们都不进指纹，收下也核对不了。
 * - **缺了的字段**：没有能补的默认值。`authorId` 补成 `null` 就把一个普通提交变成了缺作者的提交，`transactionId` 补成 `null`
 *   就把一笔事务拆成了几笔独立写入——两者都改变指纹，补出来的是另一个提交。
 * - **`createdAt`**：只收 `toISOString()` 写得出来的那一种（`2026-11-18T03:04:05.678Z`，再写一遍逐字相同）。`Date` 的构造器
 *   还认得一大批别的写法，其中有的按本地时区解读（同一个串在两台机器上是两个时刻），有的把不存在的日子顺延（`2026-02-30`
 *   成了 3 月 2 日）。时间不进指纹，这里放过去的错，后面的指纹核对兜不住。
 *
 * 判的只是「JSON 形状对不对得上 {@link CommitExchangeRecord} 的类型」：字段齐不齐、类型与取值域、补丁是不是 JSON 值。
 * 平台对提交的形状要求——作者与消息、父的个数、补丁按操作的有无、拓扑序——是 `checkCommitExchangeBatch()` 的事。
 * 两步各管各的，顺序是先解析、再判形状：形状判定要的是 `Date`，拿 `JSON.parse` 的结果直接去判，报的是 `invalid_created_at`。
 *
 * ## 序列化挑字段，解析不收多余字段
 *
 * 两个方向看起来不对称，理由是入参的来路不同：序列化收的是内存里的记录，TypeScript 允许它是结构子类型——单元可以是带着
 * `baseFingerprint` / `fingerprint` 的 `CommitChangeUnit`——那两列不属于交换格式，逐字段挑出九列就是正确的投影，不是修正；
 * 解析收的是线上来的不可信输入，那里多一个键就是上面那条漂移信号。序列化挑完之后再按解析的规则把产物过一遍：
 * 交出去的东西，对面的解析一定收得下，两个方向不会一宽一严。
 *
 * 本文件在 `./exchange` 子路径的模块闭包里，值导入只能指向纯模块（`__tests__/exchange/exchange-entry-isolation.spec.ts` 守着）。
 */

import { RxDBError } from '@aiao/rxdb';
import {
  COMMIT_CHANGE_UNIT_OPERATIONS,
  COMMIT_CHANGE_UNIT_ORIGINS,
  COMMIT_KINDS
} from '../working-tree/import-batch.js';
import type { CommitChangeUnitContent, CommitChangeUnitOperation, CommitChangeUnitOrigin } from './change-unit.js';
import type { CommitExchangeRecord } from './commit-exchange.js';
import type { CommitKind } from './commit.entity.js';

/**
 * 一条交换记录在 JSON 里的样子：{@link CommitExchangeRecord} 把 `createdAt` 换成 ISO 串，其余字段一模一样。
 *
 * @remarks
 * 由 {@link serializeCommitExchangeRecord} 造出、{@link parseCommitExchangeRecord} 收回。它本身就是 JSON 值：
 * 交给 `JSON.stringify`、`fetch` 的请求体或 Supabase 客户端都不会再变形。
 *
 * @public
 */
export type CommitExchangeRecordJson = Omit<CommitExchangeRecord, 'createdAt'> & {
  /** `Date.prototype.toISOString()` 的写法，如 `2026-11-18T03:04:05.678Z` */
  readonly createdAt: string;
};

/**
 * 交换记录在 JSON 编解码上的毛病（{@link CommitExchangeJsonError.problem}）。
 *
 * @remarks
 * 一种毛病一个取值，与 `CommitImportBatchProblem` 同一个理由：调用方据此判断是哪一侧的协议写错了，文案会改，枚举不会。
 *
 * - `not_object`：记录本身或某个单元不是 JSON 对象
 * - `missing_field`：少了一个字段
 * - `unknown_field`：多了一个字段（{@link CommitExchangeJsonError.path} 指着它）
 * - `invalid_field`：字段的类型或取值不对——字符串字段不是字符串、`authorId` / `transactionId` 不是字符串也不是 `null`、
 *   `parentIds` / `units` 不是数组、`kind` / `operation` / `origin` 不在取值域里、补丁不是 JSON 对象也不是 `null`
 * - `invalid_created_at`：解析时 `createdAt` 不是 `toISOString()` 写出的那种串；序列化时不是有效的 `Date`
 * - `not_json_value`：补丁里有 JSON 表示不了的值：`undefined`、`NaN` 与无穷、`bigint`、函数、`symbol`、`Date`、`Map`、
 *   字节数组、类实例、循环引用、稀疏数组的空位——`JSON.stringify` 会把它们丢掉、改写成别的值，或者直接抛
 *
 * @public
 */
export type CommitExchangeJsonProblem =
  'not_object' | 'missing_field' | 'unknown_field' | 'invalid_field' | 'invalid_created_at' | 'not_json_value';

/**
 * 交换记录过不了 JSON 编解码：{@link parseCommitExchangeRecord} 与 {@link serializeCommitExchangeRecord} 的唯一失败出口。
 *
 * @remarks
 * 只带枚举、位置与提交 id，**不带记录里的任何内容**（消息、作者、补丁的值）：服务端常把它整个打进日志、或者回给上传方，
 * 而补丁里可能有加密列的信封（FR-043）。`path` 里会出现补丁的键名——那是列名，不是内容。
 *
 * @public
 */
export class CommitExchangeJsonError extends RxDBError {
  /**
   * 只由本文件构造。
   *
   * @remarks
   * 三个实参都是诊断位，没有一个装着记录的内容——这就是类注释那条「不带任何内容」在签名上的落点。
   */
  constructor(
    /** 哪一种毛病 */
    readonly problem: CommitExchangeJsonProblem,
    /** 出毛病的位置：`$` 是记录本身，往下如 `$.createdAt`、`$.units[0].patch.title` */
    readonly path: string,
    /** 这条记录的 id；记录不是 JSON 对象、或 `commitId` 本身不是字符串时为 `null` */
    readonly commitId: string | null
  ) {
    super(`Commit exchange record rejected: ${problem} at ${path}${commitId === null ? '' : ` (commit ${commitId})`}.`);
    this.name = 'CommitExchangeJsonError';
    Object.setPrototypeOf(this, CommitExchangeJsonError.prototype);
  }
}

/** 读到哪儿了：出错时报给调用方的位置，与这条记录认得出的 id。 */
interface Cursor {
  /** 从记录本身（`$`）往下的路径 */
  readonly path: string;
  /** 这条记录的 id；认不出时为 `null` */
  readonly commitId: string | null;
}

/** 往下走一层：对象按键（`.key`），数组按下标（`[0]`）。 */
const at = (cursor: Cursor, key: string | number): Cursor => ({
  path: typeof key === 'number' ? `${cursor.path}[${key}]` : `${cursor.path}.${key}`,
  commitId: cursor.commitId
});

/** 在这个位置报一种毛病。 */
const fail = (problem: CommitExchangeJsonProblem, cursor: Cursor): never => {
  throw new CommitExchangeJsonError(problem, cursor.path, cursor.commitId);
};

/**
 * JSON 对象：原型是 `Object.prototype` 或 `null`。
 *
 * @remarks
 * 只判 `typeof === 'object'` 不够：`Date`、`Map`、字节数组与类实例都是对象，`JSON.stringify` 却会把它们写成串、`{}` 或
 * 按下标展开的对象——收下它们，对面解析出来的就不是这一份了。数组的原型是 `Array.prototype`，在这里同样不算。
 */
const isJsonObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** 记录本身那一层：认得出 id 就带上，后面每一处毛病都报得出是哪个提交。 */
const rootOf = (value: unknown): Cursor => ({
  path: '$',
  commitId: isJsonObject(value) && typeof value['commitId'] === 'string' ? value['commitId'] : null
});

/** 读一个字段：核对 JSON 形状，交出内存形态的值；对不上就抛。 */
type FieldReader<T> = (raw: unknown, cursor: Cursor) => T;

/**
 * 一种对象的全部字段与各自的读法。
 *
 * @remarks
 * **键集就是白名单**：多一个键是 `unknown_field`、少一个是 `missing_field`，不另列一份字段清单——两份清单迟早一份先改。
 * `-?` 让 {@link CommitExchangeRecord} 或 {@link CommitChangeUnitContent} 每多一个字段，这里就编译不过，直到给它配上读法。
 */
type FieldReaders<T> = { readonly [K in keyof T]-?: FieldReader<T[K]> };

/** 字符串字段。只判类型：非空白之类是平台规则，归 `checkCommitExchangeBatch()`。 */
const readString: FieldReader<string> = (raw, cursor) =>
  typeof raw === 'string' ? raw : fail('invalid_field', cursor);

/** 可空的字符串字段（`authorId`、`transactionId`）：`null` 是取值，不是「缺」。 */
const readNullableString: FieldReader<string | null> = (raw, cursor) => (raw === null ? null : readString(raw, cursor));

/** 字符串数组（`parentIds`），交出新数组。 */
const readStringList: FieldReader<readonly string[]> = (raw, cursor) =>
  // `Array.from` 而不是 `map`：`map` 跳过稀疏数组的空位，空位就带着 `undefined` 混进结果
  Array.isArray(raw) ?
    Array.from(raw, (item: unknown, index) => readString(item, at(cursor, index)))
  : fail('invalid_field', cursor);

/** 取值域里的一个字符串；取值域与 `checkCommitExchangeBatch()` 共用同一份（`import-batch.ts`）。 */
const readMember =
  <T extends string>(domain: ReadonlySet<string>): FieldReader<T> =>
  (raw, cursor) =>
    typeof raw === 'string' && domain.has(raw) ? (raw as T) : fail('invalid_field', cursor);

/** 一个容器的直接子项：数组按下标（空位读成 `undefined`，随即判掉），JSON 对象按自有键；别的对象都不是 JSON 值。 */
const childrenOf = (container: object, cursor: Cursor): readonly (readonly [string | number, unknown])[] => {
  if (Array.isArray(container)) return Array.from(container, (item: unknown, index) => [index, item] as const);
  return isJsonObject(container) ? Object.entries(container) : fail('not_json_value', cursor);
};

/**
 * 断言一个值是 JSON 值：字符串、有限数、布尔、`null`、数组、JSON 对象，层层如此。
 *
 * @param ancestors - 当前递归路径上的容器；**是路径而不是已访问集合**：`{ a: shared, b: shared }` 里同一个对象出现两次不是环
 *
 * @remarks
 * 不交给 `JSON.stringify` 去兜：它对 `undefined` 与函数是丢掉、对 `NaN` 是写成 `null`、对 `Date` 是写成串、对 `Map` 是写成 `{}`，
 * 每一种都悄悄换了内容；循环引用要拦在这里，否则抛出来的是栈溢出，而不是本文件承诺的 {@link CommitExchangeJsonError}。
 */
const assertJsonValue = (value: unknown, cursor: Cursor, ancestors: ReadonlySet<object> = new Set()): void => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || ancestors.has(value)) return fail('not_json_value', cursor);
  const path = new Set(ancestors).add(value);
  for (const [key, child] of childrenOf(value, cursor)) assertJsonValue(child, at(cursor, key), path);
};

/**
 * 一份补丁：JSON 对象或 `null`。
 *
 * @remarks
 * 交出的是输入里的那个对象本身，不深拷贝：补丁可能很大，而解析出来的记录接着就交给指纹复算与形状判定，不再回头改它。
 * 有无（插入只有 `patch`、删除只有 `inversePatch`）按操作判，是 `checkCommitExchangeBatch()` 的事。
 */
const readPatch: FieldReader<Record<string, unknown> | null> = (raw, cursor) => {
  if (raw === null) return null;
  if (!isJsonObject(raw)) return fail('invalid_field', cursor);
  assertJsonValue(raw, cursor);
  return raw;
};

/**
 * `createdAt`：只收 `toISOString()` 写得出来的串——按它造出 `Date`、再写一遍，必须逐字相同。
 *
 * @remarks
 * 判据是往返而不是正则：`toISOString()` 的写法不止四位年份一种（`+275760-09-13T00:00:00.000Z` 也是它写的），往返把「它写得出」
 * 原样当成判据，而不是另写一份迟早与它不一致的格式说明。不存在的日子（`2026-02-30`）与别的写法在这一步都对不上。
 */
const readCreatedAt: FieldReader<Date> = (raw, cursor) => {
  const instant = typeof raw === 'string' ? new Date(raw) : null;
  const canonical = instant !== null && !Number.isNaN(instant.getTime()) && instant.toISOString() === raw;
  return canonical ? instant : fail('invalid_created_at', cursor);
};

/**
 * 按字段表读一个 JSON 对象：先判是不是对象，再判缺字段、多字段，最后逐字段读。
 *
 * @remarks
 * 缺字段排在多字段之前：缺了的那个读不出来，记录就造不出来；多出来的那个只是收不下。逐字段读的顺序就是字段表的顺序，
 * 报出来的总是第一处毛病。
 */
const readObject = <T>(raw: unknown, cursor: Cursor, readers: FieldReaders<T>): T => {
  if (!isJsonObject(raw)) return fail('not_object', cursor);
  const fields = Object.entries(readers) as [string, FieldReader<unknown>][];
  const missing = fields.find(([key]) => !Object.hasOwn(raw, key));
  if (missing) return fail('missing_field', at(cursor, missing[0]));
  const extra = Object.keys(raw).find(key => !Object.hasOwn(readers, key));
  if (extra !== undefined) return fail('unknown_field', at(cursor, extra));
  return Object.fromEntries(fields.map(([key, read]) => [key, read(raw[key], at(cursor, key))])) as T;
};

/** 单元的九列：恰好是 `CommitChangeSet` 落库、进单元指纹的那九列。 */
const UNIT_READERS: FieldReaders<CommitChangeUnitContent> = {
  unitId: readString,
  transactionId: readNullableString,
  namespace: readString,
  entity: readString,
  entityId: readString,
  operation: readMember<CommitChangeUnitOperation>(COMMIT_CHANGE_UNIT_OPERATIONS),
  patch: readPatch,
  inversePatch: readPatch,
  origin: readMember<CommitChangeUnitOrigin>(COMMIT_CHANGE_UNIT_ORIGINS)
};

/** 单元数组，交出新数组、新单元；空位读成 `undefined`，报 `not_object`。 */
const readUnits: FieldReader<readonly CommitChangeUnitContent[]> = (raw, cursor) =>
  Array.isArray(raw) ?
    Array.from(raw, (item: unknown, index) => readObject(item, at(cursor, index), UNIT_READERS))
  : fail('invalid_field', cursor);

/** 记录的八个字段；`createdAt` 是唯一一处要换形态的。 */
const RECORD_READERS: FieldReaders<CommitExchangeRecord> = {
  commitId: readString,
  parentIds: readStringList,
  kind: readMember<CommitKind>(COMMIT_KINDS),
  message: readString,
  authorId: readNullableString,
  createdAt: readCreatedAt,
  contentFingerprint: readString,
  units: readUnits
};

/**
 * 把一个 JSON 值严格解析成交换记录。
 *
 * @param json - `JSON.parse` 的结果（`await request.json()` 的那个值），**不是** JSON 文本
 * @returns 新造的记录：`createdAt` 是新的 `Date`，`parentIds` 与 `units` 是新数组、单元是新对象；补丁原样引用输入
 * @throws {@link CommitExchangeJsonError} 字段缺了、多了、类型或取值不对，`createdAt` 不是 `toISOString()` 的写法，补丁里有
 *   JSON 表示不了的值——报第一处，不修正
 *
 * @remarks
 * 只判 JSON 形状，不判平台的提交形状：解析之后还要过 `checkCommitExchangeBatch()`，再复算指纹核对 `contentFingerprint`。
 * 解析不读库、不碰时钟，同一份输入恒得同一个结果。
 *
 * @example
 * ```ts
 * const commits = body.commits.map((json: unknown) => parseCommitExchangeRecord(json));
 * ```
 *
 * @public
 */
export const parseCommitExchangeRecord = (json: unknown): CommitExchangeRecord =>
  readObject(json, rootOf(json), RECORD_READERS);

/** 序列化：`createdAt` 必须是有效的 `Date`；入参按 `unknown` 读，类型只是调用方的一句承诺。 */
const isoInstantOf = (value: unknown, cursor: Cursor): string =>
  value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : fail('invalid_created_at', cursor);

/** 单元的九列，逐字段挑：传进来的可能是带 `baseFingerprint` / `fingerprint` 的 `CommitChangeUnit`，那两列不属于交换格式。 */
const unitJsonOf = (unit: CommitChangeUnitContent): CommitChangeUnitContent => ({
  unitId: unit.unitId,
  transactionId: unit.transactionId,
  namespace: unit.namespace,
  entity: unit.entity,
  entityId: unit.entityId,
  operation: unit.operation,
  patch: unit.patch,
  inversePatch: unit.inversePatch,
  origin: unit.origin
});

/**
 * 把交换记录写成 JSON 值：`createdAt` 换成 ISO 串，其余字段逐字段挑出、原样保留。
 *
 * @param record - 内存里的记录，如 `exportCommits()` 的 `commits` 或服务端自己合成的合并提交
 * @returns 一个 JSON 值（不是 JSON 文本）：交给 `JSON.stringify` 或任何会自己序列化的客户端
 * @throws {@link CommitExchangeJsonError} `createdAt` 不是有效的 `Date`（`invalid_created_at`），补丁里有 JSON 表示不了的值
 *   （`not_json_value`），或别的字段过不了 {@link parseCommitExchangeRecord}
 *
 * @remarks
 * 产物交出去之前按解析的规则过一遍：`serializeCommitExchangeRecord()` 交得出来的，`parseCommitExchangeRecord()` 一定收得下，
 * 且过一遍 JSON 文本收回来与原记录逐字段相等（唯一的例外是补丁里的 `-0`：`JSON.stringify` 把它写成 `0`，而指纹本来就把两者
 * 当成同一个值）。`parentIds` 与补丁不拷贝，与输入共用同一个对象——拷贝 `parentIds` 用的展开会把一个误传的串
 * 拆成一个个字符、悄悄变成合法的字符串数组，原样交给解析去判，它报的是 `invalid_field`。
 *
 * @example
 * ```ts
 * const page = await db.workingTree.exportCommits({ afterCommitId });
 * await fetch(url, { method: 'POST', body: JSON.stringify({ commits: page.commits.map(serializeCommitExchangeRecord) }) });
 * ```
 *
 * @public
 */
export const serializeCommitExchangeRecord = (record: CommitExchangeRecord): CommitExchangeRecordJson => {
  const json: CommitExchangeRecordJson = {
    commitId: record.commitId,
    parentIds: record.parentIds,
    kind: record.kind,
    message: record.message,
    authorId: record.authorId,
    createdAt: isoInstantOf(record.createdAt, at(rootOf(record), 'createdAt')),
    contentFingerprint: record.contentFingerprint,
    units: record.units.map(unitJsonOf)
  };
  parseCommitExchangeRecord(json);
  return json;
};
