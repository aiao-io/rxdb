/**
 * @fileoverview 导入批次的形状判定（US-319）：纯函数，不读库。
 *
 * @remarks
 * 从 `import-command.ts` 拆出来，只因为它全是对一份不可信输入的逐字段核对，与命令体的读写顺序无关。
 * 判定的口径与本地写路径同形——普通提交要作者、消息与至少一个单元（FR-008/009），系统根节点一样都不带，
 * 单元的两份补丁按操作区分有无——于是导入落下的节点与本地 `commit()` 写下的节点在损坏守卫眼里是同一种东西。
 *
 * **它也是 `./exchange` 子路径上的 {@link checkCommitExchangeBatch}。** 服务端收上传批次时按这一份判形状：
 * 服务端认可的批次要原样下发给别的设备去导入，它收下一个导入会拒的形状，坏的就不是这一次上传，而是之后每一台来拉的设备。
 * 两端各写一份规则的话，分岔的那天两边的单测都是绿的。代价是本文件在那个子路径的模块闭包里：它的值导入只能指向纯模块，
 * 一条指向实体或运行时的值导入就把它们带进了服务端（`__tests__/exchange/exchange-entry-isolation.spec.ts` 守着）。
 */

import type { CommitChangeUnitOperation, CommitChangeUnitOrigin } from '../commit/change-unit.js';
import type { CommitExchangeRecord } from '../commit/commit-exchange.js';
import type { CommitKind } from '../commit/commit.entity.js';

/**
 * 批次形状上的毛病（`invalid_batch` 的 `problem`）。
 *
 * @remarks
 * 一种毛病一个取值，而不是一句文案：首个使用方的服务端要据此定位是哪一侧的协议写错了，文案会被改，枚举不会。
 *
 * - `empty_batch`：一个提交都没有
 * - `invalid_commit_id`：记录不是对象，或 `commitId` 不是非空字符串
 * - `duplicate_commit`：同一个 `commitId` 在批次里出现两次
 * - `invalid_kind`：`kind` 不是四种之一
 * - `invalid_parents`：`parentIds` 不是非空字符串数组、有重复、含自己，或个数不合种类（普通至多一个、合并至少两个、系统根节点零个）
 * - `invalid_message`：`message` 不是 trim 后非空的字符串
 * - `invalid_author`：普通与合并提交缺作者（trim 后非空的字符串），或系统根节点带了作者
 * - `invalid_created_at`：`createdAt` 不是有效的 `Date`
 * - `invalid_units`：`units` 不是数组，或个数不合种类（普通至少一个、系统根节点零个）
 * - `invalid_unit`：某个单元的九列不合形状：`unitId` / `namespace` / `entity` / `entityId` 要非空字符串，`transactionId` 要 uuid 或 `null`，
 *   `operation` / `origin` 要在取值域里，两份补丁按操作区分有无（插入只有 `patch`、删除只有 `inversePatch`、修改两份都有，有的必须是普通对象）
 * - `not_topological`：某个提交的父在批次里排在它后面
 * - `unreachable_from_head`：某个提交不是最后一个提交的祖先
 *
 * @public
 */
export type CommitImportBatchProblem =
  | 'empty_batch'
  | 'invalid_commit_id'
  | 'duplicate_commit'
  | 'invalid_kind'
  | 'invalid_parents'
  | 'invalid_message'
  | 'invalid_author'
  | 'invalid_created_at'
  | 'invalid_units'
  | 'invalid_unit'
  | 'not_topological'
  | 'unreachable_from_head';

/**
 * 四种提交种类：交换记录 `kind` 的取值域。
 *
 * @remarks
 * 交换记录的 JSON 解析（`commit/commit-exchange-json.ts`）按同一份判 `kind`：两边各写一份，加第五种的那天只会有一边记得，
 * 于是一边收、一边拒。只在包内共享，不在公开面上。
 */
export const COMMIT_KINDS: ReadonlySet<string> = new Set<CommitKind>([
  'normal',
  'merge',
  'baseline',
  'branch_baseline'
]);

/** 一种提交对父个数、作者与单元个数的要求。 */
interface KindRule {
  /** 父的个数合不合 */
  readonly parents: (count: number) => boolean;
  /** 有没有用户作者 */
  readonly authored: boolean;
  /** 单元的个数合不合 */
  readonly units: (count: number) => boolean;
}

/**
 * 四种提交各自的形状要求。
 *
 * @remarks
 * 普通提交至多一个父：本地分支从空 HEAD 起的第一个提交没有父。合并提交可以没有单元（只记下祖先关系的合并），
 * 这是它与普通提交在 FR-009 上的唯一区别；系统根节点永远没有父、没有作者、没有单元。
 */
const KIND_RULES: Readonly<Record<CommitKind, KindRule>> = {
  normal: { parents: count => count <= 1, authored: true, units: count => count > 0 },
  merge: { parents: count => count >= 2, authored: true, units: () => true },
  baseline: { parents: count => count === 0, authored: false, units: count => count === 0 },
  branch_baseline: { parents: count => count === 0, authored: false, units: count => count === 0 }
};

/** 单元操作的取值域；JSON 解析共用这一份（理由见 {@link COMMIT_KINDS}）。 */
export const COMMIT_CHANGE_UNIT_OPERATIONS: ReadonlySet<string> = new Set<CommitChangeUnitOperation>([
  'insert',
  'update',
  'delete'
]);

/** 单元来源的取值域；JSON 解析共用这一份（理由见 {@link COMMIT_KINDS}）。 */
export const COMMIT_CHANGE_UNIT_ORIGINS: ReadonlySet<string> = new Set<CommitChangeUnitOrigin>([
  'local',
  'remote_sync'
]);

/**
 * 每种操作的两份补丁该不该有。
 *
 * @remarks
 * 与本地提交的落库形态同形：插入的反向是「这一行原来不存在」，删除的正向是「这一行之后不存在」。按这个形状收，
 * 叠到业务表上时（`projectionActionsOf`）才不会在一条缺了补丁的修改上把 `null` 当成一整行写进去。
 */
const PATCH_PRESENCE: Readonly<
  Record<CommitChangeUnitOperation, { readonly patch: boolean; readonly inversePatch: boolean }>
> = {
  insert: { patch: true, inversePatch: false },
  update: { patch: true, inversePatch: true },
  delete: { patch: false, inversePatch: true }
};

/** `CommitChangeSet.transactionId` 是 uuid 列；PGlite 在写入时校验字面量形状，其余五个后端照收——在这里统一拒。 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 非空白字符串。 */
const isNonBlankString = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/** 普通对象（JSON 对象的形状）。 */
const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 一份补丁该有时是普通对象，不该有时是 `null`。 */
const hasPatchShape = (value: unknown, present: boolean): boolean => (present ? isPlainRecord(value) : value === null);

/**
 * 一个单元的九列合不合形状。
 *
 * @remarks
 * 入参按 `unknown` 读：类型上它是 {@link CommitChangeUnitContent}，可它多半刚从服务端的 JSON 里解析出来，
 * 类型只是调用方的一句承诺。
 */
const isValidUnit = (raw: unknown): boolean => {
  if (!isPlainRecord(raw)) return false;
  const { operation, transactionId, origin } = raw;
  if (typeof operation !== 'string' || !COMMIT_CHANGE_UNIT_OPERATIONS.has(operation)) return false;
  const presence = PATCH_PRESENCE[operation as CommitChangeUnitOperation];
  return (
    [raw['unitId'], raw['namespace'], raw['entity'], raw['entityId']].every(isNonBlankString) &&
    (transactionId === null || (typeof transactionId === 'string' && UUID_PATTERN.test(transactionId))) &&
    typeof origin === 'string' &&
    COMMIT_CHANGE_UNIT_ORIGINS.has(origin) &&
    hasPatchShape(raw['patch'], presence.patch) &&
    hasPatchShape(raw['inversePatch'], presence.inversePatch)
  );
};

/** 父链合不合种类：非空字符串、互不相同、不含自己、个数合规。 */
const hasValidParents = (raw: Record<string, unknown>, rule: KindRule): boolean => {
  const parents = raw['parentIds'];
  if (!Array.isArray(parents) || !parents.every(isNonBlankString)) return false;
  const selfReferencing = parents.some(parentId => parentId === raw['commitId']);
  return new Set(parents).size === parents.length && !selfReferencing && rule.parents(parents.length);
};

/** 作者合不合种类。 */
const hasValidAuthor = (raw: Record<string, unknown>, rule: KindRule): boolean =>
  rule.authored ? isNonBlankString(raw['authorId']) : raw['authorId'] === null;

/** 有效的 `Date`。 */
const isValidDate = (value: unknown): boolean => value instanceof Date && !Number.isNaN(value.getTime());

/**
 * 一条记录在形状上的第一处毛病；没有毛病时为 `undefined`。
 *
 * @remarks
 * 检查的顺序就是报告的优先级：认不出 id 的记录连「是哪个提交」都说不出，排最前；单元内部的毛病排最后，
 * 它要先知道这条记录是什么种类才判得了单元个数。
 */
const recordProblemOf = (record: unknown): CommitImportBatchProblem | undefined => {
  if (!isPlainRecord(record) || !isNonBlankString(record['commitId'])) return 'invalid_commit_id';
  const kind = record['kind'];
  if (typeof kind !== 'string' || !COMMIT_KINDS.has(kind)) return 'invalid_kind';
  const rule = KIND_RULES[kind as CommitKind];
  if (!hasValidParents(record, rule)) return 'invalid_parents';
  if (!isNonBlankString(record['message'])) return 'invalid_message';
  if (!hasValidAuthor(record, rule)) return 'invalid_author';
  if (!isValidDate(record['createdAt'])) return 'invalid_created_at';
  const units = record['units'];
  if (!Array.isArray(units) || !rule.units(units.length)) return 'invalid_units';
  return units.every(isValidUnit) ? undefined : 'invalid_unit';
};

/** 认得出 id 的记录交出 id，认不出的交 `null`。 */
const commitIdOf = (record: unknown): string | null =>
  isPlainRecord(record) && isNonBlankString(record['commitId']) ? record['commitId'] : null;

/**
 * 批次形状上的一处毛病：哪一种，出在哪个提交上。
 *
 * @remarks
 * 只带 id 与枚举，不带记录里的任何内容（消息、作者、补丁）：它会原样进 `invalid_batch` 那个返回值，而返回值常被整个打进日志（FR-043）。
 * 服务端拿它回给上传方也是同一个理由。
 *
 * @public
 */
export interface CommitImportBatchFinding {
  /** 哪一种毛病 */
  readonly problem: CommitImportBatchProblem;
  /** 出毛病的那个提交；`empty_batch` 与认不出 id 的记录为 `null` */
  readonly commitId: string | null;
}

/** 造一条发现。 */
const invalidBatch = (problem: CommitImportBatchProblem, commitId: string | null): CommitImportBatchFinding => ({
  problem,
  commitId
});

/**
 * 不是新头祖先的第一个提交；全都是时为 `undefined`。
 *
 * @param commits - 已逐条验过形状、id 互不相同的批次
 * @param position - id → 批次下标
 *
 * @remarks
 * 只沿批次内的父走：本库已有的父不改变「批次里谁是新头的祖先」。
 */
const firstUnreachableFromHead = (
  commits: readonly CommitExchangeRecord[],
  position: ReadonlyMap<string, number>
): string | undefined => {
  const head = commits[commits.length - 1];
  const reached = new Set<string>([head.commitId]);
  const pending = [head.commitId];
  while (pending.length > 0) {
    const record = commits[position.get(pending.pop()!)!];
    const parents = record.parentIds.filter(parentId => position.has(parentId) && !reached.has(parentId));
    for (const parentId of parents) reached.add(parentId);
    pending.push(...parents);
  }
  return commits.find(record => !reached.has(record.commitId))?.commitId;
};

/**
 * 按平台规则判一批交换记录的形状（纯函数，不读库）：交出第一处毛病，没有毛病时为 `undefined`。
 *
 * @param commits - 一批交换记录，按导入要求的顺序：父先于子，最后一个是新头
 * @returns 第一处毛病，见 {@link CommitImportBatchFinding}；形状合格时为 `undefined`
 *
 * @remarks
 * **`importCommits()` 的 `invalid_batch` 就是它判的**：导入命令在第一条写语句之前调这一个函数，被拒时把它交出的
 * `problem` / `commitId` 原样放进返回值。服务端经 `@aiao/rxdb-plugin-working-tree/exchange` 拿到的也是这一个——
 * 上传批次过了这一关，原样下发给别的设备时就不会在形状上被拒。
 *
 * 判的只是形状：父的个数与种类、作者与消息、单元个数、单元九列与补丁按操作的有无、拓扑序、都是新头的祖先。
 * **不判**内容指纹（`computeCommitExchangeRecordFingerprint()` 复算后自己比）、本库有没有这些父、同 id 的提交是不是同一个——
 * 那些要读库，是导入命令（或服务端自己的存储）的事。
 *
 * 入参按 `unknown` 逐层读：类型上它是一组 {@link CommitExchangeRecord}，可它多半刚从 JSON 里解析出来，类型只是调用方的一句承诺。
 * 所以 JSON 要先过 `parseCommitExchangeRecord()`：直接拿 `JSON.parse` 的结果来判，`createdAt` 还是串，报的是 `invalid_created_at`。
 * 检查的先后就是报告的优先级——先逐条验形状与重复 id，再验批内的父是否排在前面，最后验每个提交都是新头的祖先。
 *
 * @example
 * ```ts
 * const finding = checkCommitExchangeBatch(commits);
 * if (finding) return reject(422, finding); // { problem: 'invalid_parents', commitId: '…' }
 * ```
 *
 * @public
 */
export const checkCommitExchangeBatch = (
  commits: readonly CommitExchangeRecord[]
): CommitImportBatchFinding | undefined => {
  // 另起一个 `unknown` 变量去判「是不是数组」：直接对入参 `Array.isArray`，TS 会把只读数组收窄成 `any[]`，后面的判定全成了无类型代码
  const received: unknown = commits;
  if (!Array.isArray(received) || received.length === 0) return invalidBatch('empty_batch', null);
  const position = new Map<string, number>();
  for (const [index, record] of commits.entries()) {
    const problem = recordProblemOf(record);
    if (problem) return invalidBatch(problem, commitIdOf(record));
    if (position.has(record.commitId)) return invalidBatch('duplicate_commit', record.commitId);
    position.set(record.commitId, index);
  }
  const isLaterInBatch = (parentId: string, index: number): boolean => {
    const parentIndex = position.get(parentId);
    return parentIndex !== undefined && parentIndex > index;
  };
  const late = commits.find((record, index) => record.parentIds.some(parentId => isLaterInBatch(parentId, index)));
  if (late) return invalidBatch('not_topological', late.commitId);
  const unreachable = firstUnreachableFromHead(commits, position);
  return unreachable === undefined ? undefined : invalidBatch('unreachable_from_head', unreachable);
};
