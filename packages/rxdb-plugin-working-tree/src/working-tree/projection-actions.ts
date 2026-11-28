/**
 * @fileoverview 工作树条目与业务表之间的那一份增删改：discard / restore 回写业务投影时要落什么（US-320）。
 *
 * @remarks
 * 本模块**只算不写**。真正发起回写的两处——`discard-command.ts` 的 `rewriteProjectionToHead` 与
 * `restore-command.ts` 的 `rewriteProjectionToTarget`——各自登记在 `TRUSTED_CALLSITE_REGISTRY`（#15 / #16）：
 * 登记键取「实际发起那次批量重写的最内层具名函数」，把 `mergeChanges` 收进这里的公共函数会让两条语义
 * 不同的路径共用一个登记键，漂移扫描就分不出是谁在写。
 *
 * 三件事在这里被钉死：
 *
 * 1. **折叠只有一份。** 条目 → 增删改走切分支、提交视图同一个 `get_switch_version_actions`；
 *    restore 的「HEAD → 目标」差异走捕获同一个 `foldWorkingTreeEntry`。另写一份同义计算，迟早在
 *    「改过又改回」「删了又重建」这种边角上与另一份分叉，而分叉的那一刻 discard 退回的就不是 HEAD。
 * 2. **HEAD 上的值取自条目的 `inversePatch`，不按提交重放。** 折叠规则保证 `inversePatch` 恒为首次捕获值、
 *    后来才碰到的字段补进 HEAD 上的旧值（`write-entry.ts` 的 `foldInversePatch`）——它存在的全部意义就是
 *    「退回 HEAD」。按提交从基线重放出 HEAD 再比对，代价与整段历史同阶，换来的却是同一个答案。
 * 3. **簿记字段（{@link ENTITY_BOOKKEEPING_FIELDS}）不参与 UPDATE 回写。** 它们不进版本控制（epic-006
 *    「版本化域」第 2 类）：把 `remoteId` 退回旧值会断开本地行与远端行的对应，审计时间则由适配器按「此刻」
 *    重写。INSERT 不剥——重建一行要整行，`createdAt` 这类非空列缺了插不进去；DELETE 没有补丁可剥。
 */

import type { RxDBChange, SwitchVersionActions, SwitchVersionChange } from '@aiao/rxdb';
import { decodeRxDBChangeEntityId, ENTITY_BOOKKEEPING_FIELDS } from '@aiao/rxdb';
import { get_switch_version_actions } from '@aiao/rxdb-plugin-history';
import { isEqual } from '@aiao/utils';
import type { CommitChangeUnitContent } from '../commit/change-unit.js';
import { fingerprintOf } from './capture-runtime.js';
import type { WorkingTreeEntry } from './working-tree-entry.entity.js';
import { decodeWorkingTreePatch, type WorkingTreePatchCodecContext } from './working-tree-patch-codec.js';
import {
  foldWorkingTreeEntry,
  type CapturedWrite,
  type WorkingTreeEntryRow,
  type WorkingTreePatch
} from './write-entry.js';

/**
 * 一个要投到业务表上的单元：提交里的变更单元，或工作树条目，取出身份、操作与两份补丁之后同形。
 *
 * @remarks
 * 补丁的形态由调用方决定：交给 {@link projectionActionsOf} 之前必须是**解码后**的（`bigint` / `binary`
 * 已还原、加密列保持信封），那正是适配器 `mergeChanges` 收的形态；交给 {@link foldRestoreDelta} 的则是
 * **落库形态**（见那里的 @remarks）。
 */
export type WorkingTreeProjectionUnit = Pick<
  CommitChangeUnitContent,
  'namespace' | 'entity' | 'entityId' | 'operation' | 'patch' | 'inversePatch'
>;

/** 单元操作 → 变更日志类型；切分支的折叠认的是后者。 */
const CHANGE_TYPES = { insert: 'INSERT', update: 'UPDATE', delete: 'DELETE' } as const;

/** 簿记字段的查表形态。 */
const BOOKKEEPING: ReadonlySet<string> = new Set(ENTITY_BOOKKEEPING_FIELDS);

/**
 * 把一条工作树条目解码成单元。
 *
 * @param codec - 解码用的元数据解析上下文
 * @param entry - 条目行；只读身份、操作与两份补丁
 * @returns 解码之后的单元；加密列保持信封
 *
 * @remarks
 * 提交视图（`checkout/worktree-commit-view.ts`）与 discard 共用这一份：两边都要把条目交给切分支同一份折叠，
 * 各解一遍的话，某一边哪天漏掉 `bigint` / `binary` 的信封，适配器会在类型转换上炸掉——而炸的是另一边没测到的那条路。
 */
export const decodeWorkingTreeEntryUnit = (
  codec: WorkingTreePatchCodecContext,
  entry: Pick<WorkingTreeEntry, 'namespace' | 'entity' | 'entityId' | 'operation' | 'patch' | 'inversePatch'>
): WorkingTreeProjectionUnit => {
  const target = { namespace: entry.namespace, entity: entry.entity };
  return {
    namespace: entry.namespace,
    entity: entry.entity,
    entityId: entry.entityId,
    operation: entry.operation,
    patch: decodeWorkingTreePatch(codec, target, entry.patch),
    inversePatch: decodeWorkingTreePatch(codec, target, entry.inversePatch)
  };
};

/**
 * 把单元编成折叠认得的变更行。
 *
 * @param unit - 单元
 * @param index - 单元在入参里的下标；折叠按编号从小到大正向应用、从大到小逆向撤销
 * @returns 只填了折叠会读的那几列的变更行
 *
 * @remarks
 * 折叠只读编号、类型、身份与两份补丁；分支、回滚标记这些列在这条路上没有意义，填了反而像是有意义。
 */
export const toProjectionChange = (unit: WorkingTreeProjectionUnit, index: number): RxDBChange =>
  ({
    id: index + 1,
    type: CHANGE_TYPES[unit.operation],
    namespace: unit.namespace,
    entity: unit.entity,
    entityId: decodeRxDBChangeEntityId(unit.entityId),
    patch: unit.patch,
    inversePatch: unit.inversePatch
  }) as unknown as RxDBChange;

/**
 * 回写的方向。
 *
 * @remarks
 * - `apply`：把单元叠到当前业务行上（restore：业务行此刻等于 HEAD，叠上「HEAD → 目标」的差异）；
 * - `revert`：把单元从当前业务行上撤掉（discard：业务行此刻等于 HEAD + 条目，撤完就是 HEAD）。
 */
export type WorkingTreeProjectionDirection = 'apply' | 'revert';

/** 一份补丁去掉簿记字段之后的样子。 */
const withoutBookkeeping = (patch: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(patch).filter(([field]) => !BOOKKEEPING.has(field)));

/**
 * 剥掉 UPDATE 上的簿记字段；剥完一列不剩的 UPDATE 整条去掉。
 *
 * @remarks
 * 整条去掉而不是留一条空补丁：空补丁到了适配器那里要么被跳过、要么只写一个「此刻」的 `updatedAt`
 * 再记一行变更日志——一次没有语义内容、却照样推进撤销栈的写。
 *
 * UPDATE 的两份补丁恒为对象：切分支那一份折叠给每条 UPDATE 都是 `{ ...补丁 }` 的浅拷贝（空补丁也拷成 `{}`），
 * `SwitchVersionChange` 上的 `null` 只属于 INSERT / DELETE 的那一侧。这里因此按对象读，不给 `null` 编一个出路。
 */
const stripBookkeepingUpdates = (updates: Map<string, SwitchVersionChange>): Map<string, SwitchVersionChange> => {
  const kept = new Map<string, SwitchVersionChange>();
  for (const [key, change] of updates) {
    const patch = withoutBookkeeping(change.patch as Readonly<Record<string, unknown>>);
    if (Object.keys(patch).length === 0) continue;
    kept.set(key, {
      patch,
      inversePatch: withoutBookkeeping(change.inversePatch as Readonly<Record<string, unknown>>)
    });
  }
  return kept;
};

/**
 * 一批单元投到业务表上要落的增删改。
 *
 * @param units - 单元；补丁须是解码后的形态。discard / restore 交来的每个身份至多一条（条目与「HEAD → 目标」的差异都满足）；
 *   导入远端提交（US-319）交来的是一个提交的全部单元，按 `sequence` 顺序，同一身份可以有多条
 * @param direction - 见 {@link WorkingTreeProjectionDirection}
 * @returns 交给 `executor.mergeChanges()` 的增删改；UPDATE 上不带簿记字段
 *
 * @remarks
 * 每个身份至多一条时折叠与顺序无关：插入 ↔ 删除、修改两份补丁对调，就是这里的全部语义。同一身份有多条时（导入的提交
 * 里同一行写了两次），折叠按下标正向应用、逆向撤销，交进来的顺序就是语义——调用方按 `sequence` 排好。
 * 仍然走切分支那一份折叠而不是就地手写三个分支——补丁要不要拷贝、`inserts` 与 `deletes` 撞键时谁让谁、
 * 「插入之后又修改」怎么并成一条插入，这些细节在那一份里已经被切分支的用例钉过一遍。
 */
export const projectionActionsOf = (
  units: readonly WorkingTreeProjectionUnit[],
  direction: WorkingTreeProjectionDirection
): SwitchVersionActions => {
  const actions = get_switch_version_actions(units.map(toProjectionChange), direction === 'apply');
  return { deletes: actions.deletes, updates: stripBookkeepingUpdates(actions.updates), inserts: actions.inserts };
};

/** 这份增删改里有没有要写的。 */
export const hasProjectionWrites = (actions: SwitchVersionActions): boolean =>
  actions.deletes.size + actions.updates.size + actions.inserts.size > 0;

/** 三段身份拼成的比较键；空格不会出现在任何一段里，所以拼接不歧义。 */
const identityKeyOf = (unit: Pick<WorkingTreeProjectionUnit, 'namespace' | 'entity' | 'entityId'>): string =>
  `${unit.namespace} ${unit.entity} ${unit.entityId}`;

/**
 * 撤销一个单元等价的那一次「手写编辑」。
 *
 * @remarks
 * 撤销插入 = 删掉那一行，删之前的整行就是插入时的补丁；撤销删除 = 插回去，整行是删除时的 `inversePatch`；
 * 撤销修改 = 两份补丁对调。三者在撤销的那一刻都成立：比它新的单元已经先被撤掉了，这一行正停在它刚写完的样子。
 */
const inverseOf = (unit: WorkingTreeProjectionUnit): Pick<CapturedWrite, 'operation' | 'patch' | 'inversePatch'> => {
  if (unit.operation === 'insert') return { operation: 'delete', patch: null, inversePatch: unit.patch };
  if (unit.operation === 'delete') return { operation: 'insert', patch: unit.inversePatch, inversePatch: null };
  return { operation: 'update', patch: unit.inversePatch, inversePatch: unit.patch };
};

/** 只取 `fields` 里在 `source` 上确实有的那几列。 */
const pick = (source: Readonly<Record<string, unknown>>, fields: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(fields.filter(field => field in source).map(field => [field, source[field]]));

/**
 * 一条折叠结果的净差异：UPDATE 只留两端取值不同的 tracked 字段，一列不剩就不留。
 *
 * @remarks
 * 捕获不做值级归零（`write-entry.ts` 规则 4），因为那要在每次 `save()` 上读一遍 HEAD 投影；这里两端的值
 * 都已经在手上，不归零反而是错的——改过又改回的字段会落成一条 `patch` 与 `inversePatch` 相等的条目，
 * `status()` 报脏，而用户唯一能做的是提交一个什么都没变的提交（FR-042、US-307 US1-AC7）。
 *
 * 比较的是落库形态（`bigint` / `binary` 是信封，加密列是密文信封）：同一个明文加密两次得到两份不同的信封，
 * 所以加密列「改回原值」仍算差异——判得出它们相等要先解密，而恢复路径上不解密（FR-043）。
 *
 * 指纹按净差异重算：折叠沿用的是最后一次撤销的指纹，而条目上的指纹与手写条目、v1 的恢复条目同一个口径——
 * 算在这一行最终落库的那份 `patch` 上。
 *
 * UPDATE 行的两份补丁按对象读：撤销一条 UPDATE 给出的两份都是历史单元里的对象，「删了又重建」折成的 UPDATE
 * 两份都是整行。真读到一份空补丁，说明历史单元本身已经坏了——当场抛，而不是把它静默当成「这一行没有差异」。
 */
const netDeltaOf = (row: WorkingTreeEntryRow): WorkingTreeEntryRow[] => {
  if (row.operation !== 'update') return [{ ...row, fingerprint: fingerprintOf(row.operation, row.patch) }];
  const patch = row.patch as Readonly<Record<string, unknown>>;
  const inverse = row.inversePatch as Readonly<Record<string, unknown>>;
  const fields = Object.keys(patch).filter(field => !BOOKKEEPING.has(field) && !isEqual(patch[field], inverse[field]));
  if (fields.length === 0) return [];
  const netPatch: WorkingTreePatch = pick(patch, fields);
  return [
    { ...row, patch: netPatch, inversePatch: pick(inverse, fields), fingerprint: fingerprintOf('update', netPatch) }
  ];
};

/** {@link foldRestoreDelta} 落成条目时整批共用的那几列。 */
export interface WorkingTreeRestoreDeltaIdentity {
  /** 本次恢复的变更单元 id；整次恢复共享一个 */
  readonly unitId: string;
}

/**
 * 从 HEAD 沿重放路径逐个撤销单元，折成相对 HEAD 的差异——restore 写进工作树、也写进业务表的那一份。
 *
 * @param unitsNewestFirst - 重放路径上的单元，**撤销顺序**（HEAD 那个提交在前，提交内按 `sequence` 倒序）；
 *   补丁须是**落库形态**
 * @param identity - 整批共用的单元 id
 * @returns 每个身份至多一行，`patch` 是目标上的值、`inversePatch` 是 HEAD 上的值；两端相同的不出现
 *
 * @remarks
 * 把每一次撤销当成一次手写编辑，交给捕获同一个 {@link foldWorkingTreeEntry} 折：`patch` 取最新合成值（目标上的值），
 * `inversePatch` 保持首次捕获值（HEAD 上的值），「插入之后删除」消解成无单元，「删除之后插入」折成修改。
 * 于是这批条目与用户在 HEAD 上手工改出目标的数据所留下的条目同形，`HEAD + 条目 = 目标` 由同一条冷重放判据量。
 *
 * 不能拿切分支那一份逆向折叠的结果直接当条目：它的 `inversePatch` 在同一字段改过两次时会被后一条覆盖成中间态
 * （见历史插件 `compute_branch_transition_actions` 的说明），恢复之后再 discard 就退不回 HEAD；它也分不出
 * 「目标之后新建又删掉」的行——两端都不存在，它却给出一条删除。
 *
 * 补丁用落库形态而不是解码形态：折叠要给每次撤销算指纹，指纹的规范化串不收 `bigint`；而值级比较落在信封上
 * 与落在解码值上结论相同。交给适配器之前再按需解码（{@link projectionActionsOf} 的入参约定）。
 */
export const foldRestoreDelta = (
  unitsNewestFirst: readonly WorkingTreeProjectionUnit[],
  identity: WorkingTreeRestoreDeltaIdentity
): WorkingTreeEntryRow[] => {
  const rows = new Map<string, WorkingTreeEntryRow>();
  for (const unit of unitsNewestFirst) {
    const key = identityKeyOf(unit);
    const inverse = inverseOf(unit);
    const outcome = foldWorkingTreeEntry(rows.get(key), {
      namespace: unit.namespace,
      entity: unit.entity,
      entityId: unit.entityId,
      ...inverse,
      fingerprint: fingerprintOf(inverse.operation, inverse.patch),
      origin: 'local',
      unitId: identity.unitId,
      transactionId: null,
      sourceChangeId: null
    });
    if (outcome.kind === 'remove') rows.delete(key);
    else rows.set(key, outcome.entry);
  }
  return [...rows.values()].flatMap(netDeltaOf);
};
