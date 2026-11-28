/**
 * @fileoverview 导入的前像核对（US-319）：叠业务表之前，按第一父链的顺序逐个单元核对「它写之前的那一行」。
 *
 * @remarks
 * 每个提交的 ChangeSet 是相对第一父的增量，单元的 `inversePatch` 记着这一行在写之前的样子。服务端按一份与本机不同的
 * 数据算了增量（或增量本身写错了）时，叠上去并不报错：UPDATE / DELETE 打在不存在的行上是静默的空写，UPDATE 打在一个值
 * 已经不一样的行上会把本机的值换成一个谁都没见过的组合。两台设备从此分叉，而它们的提交历史逐字相同——出错却不显式，
 * 正是要堵的形态。所以叠任何一行之前，先按第一父链的顺序把整段批次在内存里走一遍：
 *
 * - **insert**：这一行此刻必须不存在；
 * - **update**：这一行此刻必须存在，`inversePatch` 覆盖的每个参与比对的列都与此刻的值相等；
 * - **delete**：与 update 相同——这一行必须存在，且与 `inversePatch` 一致。
 *
 * 「此刻」是叠到这个单元时的业务行：导入之前的业务表，叠上批次里排在它前面的那些单元之后的样子——第二个提交的前像
 * 对的是第一个提交叠完之后的那一行。核对只读不写、全部排在第一条写语句之前；任一单元对不上，整批拒绝，持久状态零变化。
 *
 * ## 哪些列参与比对（{@link preImageFieldOf}）
 *
 * - **簿记字段与派生索引列不比**：与捕获层判 untracked 是同一个口径（`versioned-domain.ts` 的 `isUntrackedField`），
 *   它们本就不进版本控制。
 * - **readonly 列不比**：`mergeChanges` 的 UPDATE 经核心 `normalizeUpdateEntity` 去掉 readonly 列，审计列 `createdBy` /
 *   `updatedBy` 与用户声明的只读列从不被导入的修改改写，于是它们在导入设备上本就不随远端收敛（远端换了 `updatedBy`，
 *   本机这一行还是旧值）。拿它们核对，正常的回传会被判成对不上。插入时它们原样写入，行在不在照查。
 * - **加密列不比**：信封是带随机数的密文，同一明文每次加密都不同，而叠业务表时适配器会把信封解开再重新加密写回——本机行上的
 *   密文与远端单元里的信封逐字节永不相等。比明文就得先解密：跨设备的信封本就解不开（密钥环身份按库生成），那种导入在叠
 *   业务表时抛 `EncryptedDecryptError`、整笔回滚，不会静默分叉；同一台设备上的信封解得开，可恢复路径不解密（FR-043），
 *   前像核对不为了比对把明文带进内存。行在不在照查，同一行的其余列照比。
 * - **认不出的列判成对不上**：既不是属性也不是外键的列核对不了，而叠上去时 `normalizeUpdateEntity` 会把它静默丢掉——
 *   核对不了的不能当成对得上。
 *
 * ## 业务行怎么读
 *
 * 每个实体一条 `SELECT <主键>, <要比的列> FROM <表> WHERE <主键> IN (…)`（{@link readCurrentRows}），走 `executor.query()`
 * 裸读而不走仓库：仓库的读经实体缓存，命中缓存的实体按内存里的值交回（含用户还没保存的编辑），还会顺手把它标成未修改——
 * 前像核对要的是库里那一行，也不能动任何实体的状态。驱动交回的是各后端的原始形态，按列类型与单元放到同一个刻度上
 * 再比（{@link comparablePreImageValue}）；`json` / `keyValue` 列读成 JSON 文本（`CAST(… AS TEXT)`），两类后端交回的都是文本，
 * 不必猜一个字符串是 JSON 文本还是 JSON 里的字符串。
 */

import type { EntityMetadata, RxDBEntityId, TransactionExecutor } from '@aiao/rxdb';
import {
  decodeRxDBChangeEntityId,
  getEntityColumnName,
  getEntityType,
  PropertyType,
  quoteSqlIdentifier,
  RxDBError,
  sqlIntegerLiteral,
  sqlStringLiteral
} from '@aiao/rxdb';
import { isEqual } from '@aiao/utils';
import type { CommitChangeUnitContent, CommitChangeUnitOperation } from '../commit/change-unit.js';
import { decodeCommitChangeSetUnit } from '../commit/commit-codec.js';
import type { CommitWriteContext } from '../commit/commit-context.js';
import type { VersionedDomain } from './versioned-domain.js';
import type { WorkingTreePatchCodecContext } from './working-tree-patch-codec.js';

/** 一个要叠到业务表上的提交：id 与它的落库形态单元。 */
export interface ImportApplyingCommit {
  /** 提交 id */
  readonly commitId: string;
  /** 单元，按 `sequence` 升序，落库形态 */
  readonly units: readonly CommitChangeUnitContent[];
}

/**
 * 前像对不上的那个单元：只有身份与操作，不带任何字段值（FR-043：诊断里不出现内容）。
 *
 * @remarks
 * `entityId` 是单元里原样的那一份（落库形态），与 `commitChanges()` / 导出记录里看到的同一个值。
 */
export interface CommitImportPreconditionMismatch {
  /** 单元所在的提交 */
  readonly commitId: string;
  /** 单元 id */
  readonly unitId: string;
  /** 实体命名空间 */
  readonly namespace: string;
  /** 实体名 */
  readonly entity: string;
  /** 行的主键 */
  readonly entityId: string;
  /** 单元的操作：`insert` 时这一行已经在，`update` / `delete` 时这一行不在或与 `inversePatch` 不一致 */
  readonly operation: CommitChangeUnitOperation;
}

/**
 * 列类型：属性元数据上可以是 `PropertyType` 的成员，也可以是它的字面量（`'boolean'`、`'date'`……）。
 *
 * @remarks
 * 两种写法运行时是同一个字符串，按值比较即可；收窄成只认枚举成员的话，用字面量声明属性的实体在类型上就进不来。
 */
export type PreImageColumnType = PropertyType | `${PropertyType}`;

/**
 * 一列在前像比对里的去留（{@link preImageFieldOf}）。
 *
 * @remarks
 * `compare` 带上物理列名与列类型：前者拼 `SELECT`，后者定比较刻度；外键列的类型是对端主键的类型，对端解析不到时为 `undefined`
 * （按原样比，与捕获触发器对这种外键列的处理一致）。
 */
export type PreImageField =
  | {
      /** 判别位：参与比对 */
      readonly kind: 'compare';
      /** 物理列名，未加引号 */
      readonly column: string;
      /** 列类型 */
      readonly type: PreImageColumnType | undefined;
    }
  | {
      /** 判别位：不比 */
      readonly kind: 'skip';
      /** 为什么不比，见本文件头「哪些列参与比对」 */
      readonly because: 'untracked' | 'readonly' | 'encrypted';
    }
  | {
      /** 判别位：既不是属性也不是外键——核对不了，调用方判成对不上 */
      readonly kind: 'unknown';
    };

/** {@link PreImageField} 里参与比对的那一支：物理列名与列类型。 */
export type PreImageCompareField = Extract<PreImageField, { kind: 'compare' }>;

/** 外键列的类型：对端实体主键的类型（与捕获触发器给外键列定类型的口径一致）。 */
const foreignKeyTypeOf = (
  codec: WorkingTreePatchCodecContext,
  metadata: EntityMetadata,
  field: string
): PreImageColumnType | undefined => {
  const relation = metadata.foreignKeyRelationMap.get(field);
  if (!relation) return undefined;
  const target = codec.resolveEntityMetadata?.(relation.mappedEntity, relation.mappedNamespace ?? metadata.namespace);
  return target?.propertyMap.get('id')?.type;
};

/**
 * 一列在前像比对里的去留。
 *
 * @param domain - 版本化域；判 untracked 与捕获层同一份
 * @param codec - 解析外键对端实体的上下文
 * @param metadata - 单元所属实体
 * @param field - `inversePatch` 里的一个键
 * @returns 见 {@link PreImageField}
 *
 * @remarks
 * 判定的先后就是理由的先后：untracked 先于 readonly（`createdAt` / `updatedAt` 两样都是，归到簿记那一边），
 * 加密列排在认不认得之前——它认得，只是不比。
 */
export const preImageFieldOf = (
  domain: VersionedDomain,
  codec: WorkingTreePatchCodecContext,
  metadata: EntityMetadata,
  field: string
): PreImageField => {
  if (domain.isUntrackedField(metadata.name, field, metadata.namespace)) return { kind: 'skip', because: 'untracked' };
  const property = metadata.propertyMap.get(field);
  if (property?.readonly === true) return { kind: 'skip', because: 'readonly' };
  if (property?.encrypted === true) return { kind: 'skip', because: 'encrypted' };
  const column = getEntityColumnName(metadata, field);
  if (column === undefined) return { kind: 'unknown' };
  return { kind: 'compare', column, type: property ? property.type : foreignKeyTypeOf(codec, metadata, field) };
};

/**
 * 业务行那一侧（驱动交回的原始形态）还是单元那一侧（解码之后的落库形态）。
 *
 * @remarks
 * 只有 JSON 一族要分：业务行上它是 JSON 文本，单元里它是嵌入的 JSON 值——同一个字符串在两侧的意思不一样。
 */
export type PreImageSide = 'row' | 'unit';

/** 读成 JSON 文本的列类型：SQLite 原样是文本，PGlite 的 `jsonb` 经 `CAST(… AS TEXT)` 也是文本。 */
const JSON_TEXT_TYPES: ReadonlySet<PreImageColumnType | undefined> = new Set<PreImageColumnType | undefined>([
  PropertyType.json,
  PropertyType.keyValue
]);

/** 数组列：SQLite 是 JSON 文本，PGlite 是原生数组（`text[]` / `double precision[]`，转不成 JSON 文本）。 */
const ARRAY_TYPES: ReadonlySet<PreImageColumnType | undefined> = new Set<PreImageColumnType | undefined>([
  PropertyType.stringArray,
  PropertyType.numberArray
]);

/** 十进制整数的文本形态。 */
const DECIMAL_INTEGER = /^-?\d+$/;

/**
 * 解析一段 JSON 文本；不是文本的原样交回。
 *
 * @remarks
 * 解析不了时交回一个新造的 `Symbol`：它与任何值都不等（连另一次解析失败交回的也不等）——库里那一列已经坏了，
 * 不能被当成「对得上」。
 */
const parsedJsonOf = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return Symbol('unparsable-json-text');
  }
};

/** 时刻归到 ISO 串（毫秒、UTC）；认不出的原样交回，于是它只与一模一样的原值相等。 */
const instantOf = (value: unknown): unknown => {
  if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') return value;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

/** bigint 归到十进制文本：驱动可能交回 `bigint`、安全整数或十进制串，比文本不丢精度。 */
const bigintTextOf = (value: unknown): unknown => {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value).toString();
  if (typeof value === 'string' && DECIMAL_INTEGER.test(value)) return BigInt(value).toString();
  return value;
};

/**
 * 字节归到 `{ hex }`：小写 hex 包一层对象；`Buffer` 是 `Uint8Array` 的子类，一并认。
 *
 * @remarks
 * 包一层而不是交回裸串：裸串会与一个恰好长得像 hex 的字符串值相等（`'0102'` 对上字节 `[1, 2]`），而那是两个不同的值。
 */
const hexOf = (value: unknown): unknown => {
  if (!(value instanceof Uint8Array)) return value;
  return { hex: [...value].map(byte => byte.toString(16).padStart(2, '0')).join('') };
};

/**
 * 把一个值放到前像比对的刻度上：两侧各自归一之后，用 `isEqual` 深比较。
 *
 * @param type - 列类型；外键对端解析不到时为 `undefined`，按原样比
 * @param value - 业务行上的原始值，或单元里解码之后的值
 * @param side - 见 {@link PreImageSide}
 * @returns 归一之后的值
 *
 * @remarks
 * 归一只动表示形式，不放宽相等：`null` 与 `undefined` 是同一个「没有值」；布尔认 `0` / `1`（SQLite 的存储形态）；
 * 时刻按毫秒比；`bigint` 按十进制文本比；字节按 hex 比；JSON 一族在业务行那一侧先解析。其余类型原样比。
 */
export const comparablePreImageValue = (
  type: PreImageColumnType | undefined,
  value: unknown,
  side: PreImageSide
): unknown => {
  if (value === null || value === undefined) return null;
  if (type === PropertyType.boolean) return typeof value === 'number' ? value !== 0 : value;
  if (type === PropertyType.date) return instantOf(value);
  if (type === PropertyType.bigint) return bigintTextOf(value);
  if (type === PropertyType.binary) return hexOf(value);
  if (JSON_TEXT_TYPES.has(type)) return side === 'row' ? parsedJsonOf(value) : value;
  if (ARRAY_TYPES.has(type)) return side === 'row' ? parsedJsonOf(value) : value;
  return value;
};

/** 一行此刻的样子：在不在，与参与比对的那些列归一之后的值。 */
interface RowState {
  /** 这一行此刻在不在 */
  readonly exists: boolean;
  /** 列 → 归一之后的值；从库里读的行带全部要比的列，批内插入的行带实体的全部列 */
  readonly values: ReadonlyMap<string, unknown>;
}

/** 一个排好队的单元：解码之后的内容、所属实体与它在业务表上的身份。 */
interface PlannedUnit {
  /** 单元所在的提交 */
  readonly commitId: string;
  /** 落库形态的单元（报对不上时原样取身份） */
  readonly stored: CommitChangeUnitContent;
  /** 解码之后的单元（`bigint` / `binary` 已还原，加密列保持信封） */
  readonly decoded: CommitChangeUnitContent;
  /** 所属实体 */
  readonly metadata: EntityMetadata;
  /** 行的主键（解码之后） */
  readonly id: RxDBEntityId;
  /** 行在整批里的身份键 */
  readonly key: string;
}

/**
 * 不变量：调用方已经保证、本模块不该看到反例的事；不成立就是上游坏了，当场抛。
 *
 * @param condition - 不变量
 * @param message - 坏在哪
 * @throws {@link RxDBError} 不变量不成立时
 *
 * @remarks
 * 收成一个断言函数，不在各处写 `if (…) throw`：这些分支在正确的程序里永远走不到，散在各处会让人误以为它们是要处理的情形。
 */
function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RxDBError(`前像核对的不变量被破坏：${message}`);
}

/** 行的身份键；三段里都不会出现空格，拼接不歧义。 */
const rowKeyOf = (namespace: string, entity: string, id: RxDBEntityId): string =>
  `${namespace} ${entity} ${String(id)}`;

/** 实体的分组键。 */
const entityKeyOf = (metadata: EntityMetadata): string => `${metadata.namespace} ${metadata.name}`;

/**
 * 把要叠的提交摊成一列单元，第一父链的顺序、提交内按 `sequence`。
 *
 * @remarks
 * 实体一定解析得到：调用方在这之前已经把认不出的实体判成 `unsupported_entity`。
 */
const plannedUnitsOf = (context: CommitWriteContext, applying: readonly ImportApplyingCommit[]): PlannedUnit[] =>
  applying.flatMap(commit =>
    commit.units.map(stored => {
      const metadata = context.codec.resolveTargetMetadata(stored.entity, stored.namespace);
      invariant(metadata, `解析不到实体 ${stored.namespace}:${stored.entity}`);
      const id = decodeRxDBChangeEntityId(stored.entityId);
      return {
        commitId: commit.commitId,
        stored,
        decoded: decodeCommitChangeSetUnit(context.codec, stored),
        metadata,
        id,
        key: rowKeyOf(metadata.namespace, metadata.name, id)
      };
    })
  );

/**
 * 单元的一份补丁；按操作它一定在（插入有 `patch`，修改两份都有，删除有 `inversePatch`——批次形状判定与写路径都这么保证）。
 */
const patchOf = (unit: PlannedUnit, which: 'patch' | 'inversePatch'): Readonly<Record<string, unknown>> => {
  const patch = unit.decoded[which];
  invariant(patch !== null, `${unit.stored.unitId} 的 ${which} 为空`);
  return patch;
};

/** 这个单元要核对的那些列名：插入没有前像，修改与删除是 `inversePatch` 的键。 */
const preImageKeysOf = (unit: PlannedUnit): string[] =>
  unit.decoded.operation === 'insert' ? [] : Object.keys(patchOf(unit, 'inversePatch'));

/** 一个实体上要读的那些行与列。 */
interface EntityRead {
  /** 实体 */
  readonly metadata: EntityMetadata;
  /** 要读的行，首次出现的顺序；键是行的身份键 */
  readonly ids: Map<string, RxDBEntityId>;
  /** 要比的列：字段名 → 去留结论，首次出现的顺序，只收 `compare` */
  readonly fields: Map<string, PreImageCompareField>;
}

/** 按实体分组，收齐每个实体要读的行与要比的列（修改与删除的 `inversePatch` 里参与比对的那些）。 */
const entityReadsOf = (
  domain: VersionedDomain,
  codec: WorkingTreePatchCodecContext,
  planned: readonly PlannedUnit[]
): Map<string, EntityRead> => {
  const reads = new Map<string, EntityRead>();
  for (const unit of planned) {
    const key = entityKeyOf(unit.metadata);
    const read = reads.get(key) ?? { metadata: unit.metadata, ids: new Map(), fields: new Map() };
    reads.set(key, read);
    if (!read.ids.has(unit.key)) read.ids.set(unit.key, unit.id);
    for (const field of preImageKeysOf(unit)) {
      const verdict = preImageFieldOf(domain, codec, unit.metadata, field);
      if (verdict.kind === 'compare') read.fields.set(field, verdict);
    }
  }
  return reads;
};

/** 主键的 SQL 字面量：字符串加引号转义，数值按十进制。 */
const idLiteralOf = (id: RxDBEntityId): string => {
  if (typeof id === 'string') return sqlStringLiteral(id);
  return typeof id === 'number' ? sqlIntegerLiteral(id) : id.toString();
};

/** 选择列表里的一项：JSON 一族转成文本读，其余原样。 */
const selectItemOf = (field: PreImageCompareField): string => {
  const column = quoteSqlIdentifier(field.column);
  return JSON_TEXT_TYPES.has(field.type) ? `CAST(${column} AS TEXT)` : column;
};

/**
 * 前像核对读一批行的那条语句：`SELECT <主键>, <要比的列> FROM <表> WHERE <主键> IN (<字面量>)`。
 *
 * @param tableRef - `executor.tableRef()` 给的表引用，已加引号
 * @param idColumn - 主键的物理列名，未加引号
 * @param fields - 要比的列，就是选择列表在主键之后的顺序
 * @param ids - 主键，解码之后
 * @returns 一条只读语句
 *
 * @remarks
 * 主键内联成字面量而不是绑定参数：`executor.query()` 的占位符写法随后端不同，而字面量的转义有核心那一份
 * （`sqlStringLiteral` / `sqlIntegerLiteral`）。`json` / `keyValue` 列包一层 `CAST(… AS TEXT)`，见本文件头「业务行怎么读」。
 */
export const preImageSelectSqlOf = (
  tableRef: string,
  idColumn: string,
  fields: readonly PreImageCompareField[],
  ids: readonly RxDBEntityId[]
): string => {
  const id = quoteSqlIdentifier(idColumn);
  const selectList = [id, ...fields.map(selectItemOf)].join(', ');
  return `SELECT ${selectList} FROM ${tableRef} WHERE ${id} IN (${ids.map(idLiteralOf).join(', ')})`;
};

/** 一条 `SELECT` 里最多放多少个主键：字面量不占绑定参数，限住的是语句长度。 */
const IDS_PER_SELECT = 500;

/** 按每条语句的上限切开。 */
const chunksOf = <T>(items: readonly T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
};

/** 读一个实体上要核对的那些行，摊成每一行此刻的样子；没读回来的行就是不在。 */
const readEntityRows = async (executor: TransactionExecutor, read: EntityRead): Promise<Map<string, RowState>> => {
  const idColumn = getEntityColumnName(read.metadata, 'id');
  invariant(idColumn !== undefined, `${read.metadata.namespace}:${read.metadata.name} 元数据里没有主键列`);
  const fields = [...read.fields.entries()];
  const tableRef = executor.tableRef(getEntityType(read.metadata));
  const states = new Map<string, RowState>(
    [...read.ids.keys()].map(key => [key, { exists: false, values: new Map() }])
  );
  for (const ids of chunksOf([...read.ids.values()], IDS_PER_SELECT)) {
    const sql = preImageSelectSqlOf(
      tableRef,
      idColumn,
      fields.map(([, field]) => field),
      ids
    );
    for (const row of (await executor.query(sql)).rows) {
      const values = new Map(
        fields.map(([name, field], index) => [name, comparablePreImageValue(field.type, row[index + 1], 'row')])
      );
      states.set(rowKeyOf(read.metadata.namespace, read.metadata.name, String(row[0])), { exists: true, values });
    }
  }
  return states;
};

/**
 * 导入之前的业务表：批次碰到的每一行此刻在不在、参与比对的列是什么值。
 *
 * @remarks
 * 每个实体一条 `SELECT … IN`（超过 {@link IDS_PER_SELECT} 个主键再切），批次之外的行一行都不读。
 */
const readCurrentRows = async (
  executor: TransactionExecutor,
  reads: ReadonlyMap<string, EntityRead>
): Promise<Map<string, RowState>> => {
  const states = new Map<string, RowState>();
  for (const read of reads.values()) {
    for (const [key, state] of await readEntityRows(executor, read)) states.set(key, state);
  }
  return states;
};

/** 列的类型：属性取属性的，外键取对端主键的。 */
const fieldTypeOf = (
  codec: WorkingTreePatchCodecContext,
  metadata: EntityMetadata,
  field: string
): PreImageColumnType | undefined => metadata.propertyMap.get(field)?.type ?? foreignKeyTypeOf(codec, metadata, field);

/**
 * 批内插入的一行写完之后的样子：补丁里有的列取补丁的值，没给的列按 `mergeChanges` 补默认值的口径。
 *
 * @remarks
 * 适配器插入时给没给值的列补上属性的默认值；默认值是函数的（如时间戳、id）在写入那一刻才求值，这里不知道它会是什么，
 * 记一个与任何值都不等的 `Symbol`——之后真有单元拿它核对，就判成对不上，而不是猜一个值放过去。外键列没有默认值，没给即 `null`。
 * 补丁里认不出的列不记：之后拿它核对的单元在 {@link preImageFieldOf} 那一步就判成 `unknown` 了。
 */
const insertedValuesOf = (
  codec: WorkingTreePatchCodecContext,
  metadata: EntityMetadata,
  patch: Readonly<Record<string, unknown>>
): Map<string, unknown> => {
  const values = new Map<string, unknown>();
  for (const [name, property] of metadata.propertyMap) {
    const unwritten =
      typeof property.default === 'function' ?
        Symbol('default-evaluated-at-write')
      : comparablePreImageValue(property.type, property.default, 'unit');
    values.set(name, name in patch ? comparablePreImageValue(property.type, patch[name], 'unit') : unwritten);
  }
  for (const name of metadata.foreignKeyRelationMap.keys()) {
    values.set(name, comparablePreImageValue(foreignKeyTypeOf(codec, metadata, name), patch[name], 'unit'));
  }
  return values;
};

/**
 * 这个单元的前像对不对得上此刻的那一行。
 *
 * @remarks
 * 一列参与比对，此刻的样子里就一定有它：从库里读的行带全部要比的列，批内插入的行带实体的全部列。
 */
const preImageHolds = (
  domain: VersionedDomain,
  codec: WorkingTreePatchCodecContext,
  unit: PlannedUnit,
  state: RowState
): boolean => {
  if (unit.decoded.operation === 'insert') return !state.exists;
  if (!state.exists) return false;
  for (const [field, expected] of Object.entries(patchOf(unit, 'inversePatch'))) {
    const verdict = preImageFieldOf(domain, codec, unit.metadata, field);
    if (verdict.kind === 'unknown') return false;
    if (verdict.kind === 'skip') continue;
    invariant(state.values.has(field), `没有读到 ${unit.metadata.name}.${field}`);
    if (!isEqual(state.values.get(field), comparablePreImageValue(verdict.type, expected, 'unit'))) return false;
  }
  return true;
};

/** 叠完这个单元之后这一行的样子。 */
const stateAfter = (codec: WorkingTreePatchCodecContext, unit: PlannedUnit, state: RowState): RowState => {
  const { operation } = unit.decoded;
  if (operation === 'delete') return { exists: false, values: new Map() };
  const patch = patchOf(unit, 'patch');
  if (operation === 'insert') return { exists: true, values: insertedValuesOf(codec, unit.metadata, patch) };
  const values = new Map(state.values);
  for (const [field, value] of Object.entries(patch)) {
    values.set(field, comparablePreImageValue(fieldTypeOf(codec, unit.metadata, field), value, 'unit'));
  }
  return { exists: true, values };
};

/** 报对不上：身份与操作原样取落库形态的单元，不带字段值。 */
const mismatchOf = (unit: PlannedUnit): CommitImportPreconditionMismatch => ({
  commitId: unit.commitId,
  unitId: unit.stored.unitId,
  namespace: unit.stored.namespace,
  entity: unit.stored.entity,
  entityId: unit.stored.entityId,
  operation: unit.stored.operation
});

/**
 * 按第一父链的顺序逐个单元核对前像；第一个对不上的单元交回来，全部对得上时为 `undefined`。
 *
 * @param executor - 调用方那个写事务的执行器；本函数只发 `SELECT`
 * @param context - 解码单元、解析实体的上下文
 * @param domain - 版本化域；判哪些列不比，与捕获层同一份
 * @param applying - 要叠到业务表上的提交，老的在前；侧枝提交不在其中（它们的 ChangeSet 不落业务表，也就无从核对）
 * @returns 见 {@link CommitImportPreconditionMismatch}
 * @throws {@link RxDBError} 不变量被破坏时（见 {@link invariant} 的调用点）
 *
 * @remarks
 * 先读后走：批次碰到的行一次读齐（{@link readCurrentRows}），再在内存里逐个单元走一遍——走的时候只改内存里的样子，
 * 于是第二个提交的前像对的是第一个提交叠完之后的那一行，而业务表在这一步一个字节都没动。
 */
export const findImportPreconditionMismatch = async (
  executor: TransactionExecutor,
  context: CommitWriteContext,
  domain: VersionedDomain,
  applying: readonly ImportApplyingCommit[]
): Promise<CommitImportPreconditionMismatch | undefined> => {
  const planned = plannedUnitsOf(context, applying);
  const states = await readCurrentRows(executor, entityReadsOf(domain, context.codec, planned));
  for (const unit of planned) {
    const state = states.get(unit.key);
    invariant(state, `没有读过行 ${unit.key}`);
    if (!preImageHolds(domain, context.codec, unit, state)) return mismatchOf(unit);
    states.set(unit.key, stateAfter(context.codec, unit, state));
  }
  return undefined;
};
