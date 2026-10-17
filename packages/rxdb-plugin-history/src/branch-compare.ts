/**
 * @fileoverview 不切换 active 分支的只读对比：两条分支的实体差异，与一次合并的预览（US-312）
 *
 * @remarks
 * 业务表里只有 active 分支的数据，另一条线只能从变更日志里算出来。两件事都是「两个变更点之间的增量」，
 * 与切分支用同一份计算（{@link compute_branch_transition_actions}）：只读，不开写事务，不碰业务表。
 *
 * 补丁不解码：取值原样来自变更日志，与工作树 `diff()` 同口径；加密字段保持密文信封。
 * 簿记字段（{@link ENTITY_BOOKKEEPING_FIELDS}）不表达用户意图，不算差异，也不算覆盖。
 */

import {
  ENTITY_BOOKKEEPING_FIELDS,
  parseRxDBChangeKey,
  type MergeStrategy,
  type RxDBBranch,
  type RxDBEntityId,
  type SwitchVersionActions
} from '@aiao/rxdb';
import { isEqual } from '@aiao/utils';
import { find_branch_path_to_root, forkPointOf } from './find-switch-branch-step.js';
import {
  branch_not_found_error,
  find_source_changes,
  merge_into_itself_error,
  squash_source_changes
} from './merge-branch.js';
import {
  branch_tip_point,
  compute_branch_transition_actions,
  type BranchPoint,
  type SwitchBranchActionReaders
} from './switch-branch-actions.js';

/** 一个实体在两侧之间的净操作。 */
export type BranchDiffOperation = 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * 一个实体在两条分支之间的差异。
 *
 * @remarks
 * `patch` / `inversePatch` 与工作树 `diff()` 的条目同一个语义：前者是终点上的值，后者是起点上的值，
 * 渲染工作树差异的界面可以原样拿来渲染它。
 */
export interface BranchDiffEntry {
  /** 实体命名空间 */
  readonly namespace: string;

  /** 实体名 */
  readonly entity: string;

  /** 实体主键 */
  readonly entityId: RxDBEntityId;

  /** 从起点走到终点，这个实体的净操作 */
  readonly operation: BranchDiffOperation;

  /** 终点上的值：INSERT 为整行，UPDATE 为有差异的业务字段，DELETE 为 `null` */
  readonly patch: Record<string, unknown> | null;

  /** 起点上的值：DELETE 为整行，UPDATE 为同一批字段，INSERT 为 `null` */
  readonly inversePatch: Record<string, unknown> | null;
}

/** `VersionManager.compareBranches()` 的回答。 */
export interface BranchComparison {
  /** 起点分支 */
  readonly fromBranchId: string;

  /** 终点分支 */
  readonly toBranchId: string;

  /** 有差异的实体，按 `namespace:entity:entityId` 排序；两侧一样时为空数组 */
  readonly entries: readonly BranchDiffEntry[];
}

/**
 * 一次合并撞上目标分支分叉以来改动的四种情形。
 *
 * @remarks
 * 合并是单向覆盖：UPDATE 只写补丁里的字段、INSERT 走 `INSERT OR REPLACE`、DELETE 按主键删。
 * 「分叉以来」指两条线分开以来：基准是源 tip 与目标 tip 的最近公共祖先点（merge base），不是源分支自己的
 * 分叉点——目标是源的后代、比源分叉得更早、或与源隔着中间分支时，两者不是同一点。
 *
 * - `overwrite`：源要写的业务字段里，有目标分叉以来改过、且两边取值不同的；`fields` 是会被盖掉的那些
 * - `delete_edited`：源删了这个实体，目标分叉以来改过它；`fields` 是目标改过的业务字段，会随实体一起没了
 * - `update_deleted`：源改了这个实体，目标里却没有这一行——目标分叉以来删了它，或者它是两边分开之后
 *   由源的上游分支建的（合并只搬源分支自有的变更，建它的那一条带不过去）；UPDATE 找不到行，这次更新落空
 * - `revive_deleted`：源删后重建了这个实体，目标分叉以来删了它；合并会把它重新建出来
 */
export type MergePreviewConflict =
  | { readonly kind: 'overwrite'; readonly fields: readonly string[] }
  | { readonly kind: 'delete_edited'; readonly fields: readonly string[] }
  | { readonly kind: 'update_deleted' }
  | { readonly kind: 'revive_deleted' };

/** 一次合并会落在目标分支上的一个实体。 */
export interface MergePreviewEntry {
  /** 实体命名空间 */
  readonly namespace: string;

  /** 实体名 */
  readonly entity: string;

  /** 实体主键 */
  readonly entityId: RxDBEntityId;

  /** 合并会落的操作 */
  readonly operation: BranchDiffOperation;

  /** 合并会写入的值，与 `mergeBranch()` 写的一致：INSERT 为整行，UPDATE 为补丁，DELETE 为 `null` */
  readonly patch: Record<string, unknown> | null;

  /**
   * 目标分支现在的值：UPDATE 为补丁涉及的字段，DELETE 与 INSERT 为整行；目标里没有这个实体时为 `null`
   */
  readonly inversePatch: Record<string, unknown> | null;

  /** 撞上目标分叉以来的改动时的标注；没撞上为 `null` */
  readonly conflict: MergePreviewConflict | null;
}

/** `VersionManager.previewMerge()` 的选项。 */
export interface MergePreviewOptions {
  /**
   * 按哪种策略预览；只影响 {@link MergePreview.merged}，条目恒为净效果
   *
   * @defaultValue `'squash'`
   */
  readonly strategy?: MergeStrategy;
}

/** `VersionManager.previewMerge()` 的回答。 */
export interface MergePreview {
  /** 源分支 */
  readonly sourceBranchId: string;

  /** 目标分支：当前 active 分支 */
  readonly targetBranchId: string;

  /** 预览所按的策略 */
  readonly strategy: MergeStrategy;

  /** 与随后 `mergeBranch()` 返回的 `merged` 一致：压缩为净操作数，逐条为源分支变更条数 */
  readonly merged: number;

  /**
   * 合并会落的实体，按 `namespace:entity:entityId` 排序
   *
   * @remarks
   * 两种策略落库后的终态相同，所以条目恒为净效果；逐条合并只是多记几条变更。
   */
  readonly entries: readonly MergePreviewEntry[];
}

type Row = Record<string, unknown>;

const BOOKKEEPING: ReadonlySet<string> = new Set(ENTITY_BOOKKEEPING_FIELDS);

/** 一次增量的终点上这个实体的值；在终点不存在时为 `undefined`。 */
const valuesAt = (actions: SwitchVersionActions, key: string): Row | undefined =>
  ((actions.inserts.get(key) ?? actions.updates.get(key))?.patch as Row | null | undefined) ?? undefined;

/** 这次增量碰没碰过这个实体（增、删、改都算）。 */
const touches = (actions: SwitchVersionActions, key: string): boolean =>
  actions.inserts.has(key) || actions.updates.has(key) || actions.deletes.has(key);

/** 几次增量碰过的全部实体，按码位序排好，结果因此与环境的区域设置无关。 */
const touchedKeys = (...all: SwitchVersionActions[]): string[] =>
  [
    ...new Set(
      all.flatMap(actions => [...actions.deletes.keys(), ...actions.updates.keys(), ...actions.inserts.keys()])
    )
  ].sort((a, b) =>
    a < b ? -1
    : a > b ? 1
    : 0
  );

const pick = (row: Row, fields: readonly string[]): Row => Object.fromEntries(fields.map(field => [field, row[field]]));

/** 两行里取值不同的业务字段。 */
const differingBusinessFields = (fields: Iterable<string>, left: Row, right: Row): string[] =>
  [...new Set(fields)].filter(field => !BOOKKEEPING.has(field) && !isEqual(left[field], right[field]));

const identityOf = (key: string): Pick<BranchDiffEntry, 'namespace' | 'entity' | 'entityId'> => {
  const [namespace, entity, entityId] = parseRxDBChangeKey(key);
  return { namespace, entity, entityId };
};

/** 从全量分支行里取一条；没有就按合并的口径报错。 */
const branchOf = (branches: readonly RxDBBranch[], branchId: string): RxDBBranch => {
  const branch = branches.find(candidate => candidate.id === branchId);
  if (!branch) throw branch_not_found_error(branchId);
  return branch;
};

const allBranches = (readers: SwitchBranchActionReaders): Promise<RxDBBranch[]> =>
  readers.branchRepository.find({ where: { combinator: 'and', rules: [] } });

/** 一个实体在起点、终点各自的值，折成一条差异；两侧一样时没有条目。 */
const diffEntry = (key: string, before: Row | undefined, after: Row | undefined): BranchDiffEntry[] => {
  const identity = identityOf(key);
  if (!before && after) return [{ ...identity, operation: 'INSERT', patch: after, inversePatch: null }];
  if (before && !after) return [{ ...identity, operation: 'DELETE', patch: null, inversePatch: before }];
  if (!before || !after) return [];
  const fields = differingBusinessFields([...Object.keys(before), ...Object.keys(after)], before, after);
  if (fields.length === 0) return [];
  return [{ ...identity, operation: 'UPDATE', patch: pick(after, fields), inversePatch: pick(before, fields) }];
};

/**
 * 两条分支当前状态之间的实体差异。
 *
 * @param readers - 见 {@link SwitchBranchActionReaders}
 * @param fromBranchId - 起点分支
 * @param toBranchId - 终点分支
 * @returns 有差异的实体；同一条分支时为空数组
 * @throws {@link RxDBError} 任一分支不存在时
 *
 * @remarks
 * 「起点 → 终点」的增量给出终点上的值；起点上的值不能取折叠结果里的 `inversePatch`
 * （见 {@link compute_branch_transition_actions}），所以再算一次「终点 → 起点」取它的 `patch`。
 * 两次增量碰到的实体与字段相同，存在性各由自己那一次的终点判定。
 *
 * @internal
 */
export const compare_branches = async (
  readers: SwitchBranchActionReaders,
  fromBranchId: string,
  toBranchId: string
): Promise<BranchComparison> => {
  const branches = await allBranches(readers);
  const from = await branch_tip_point(readers.changeRepository, branchOf(branches, fromBranchId));
  const to = await branch_tip_point(readers.changeRepository, branchOf(branches, toBranchId));
  const forward = await compute_branch_transition_actions(readers.changeRepository, branches, from, to);
  const backward = await compute_branch_transition_actions(readers.changeRepository, branches, to, from);
  const entries = touchedKeys(forward, backward).flatMap(key =>
    diffEntry(key, valuesAt(backward, key), valuesAt(forward, key))
  );
  return { fromBranchId, toBranchId, entries };
};

/** 预览一个实体要用到的三次增量。 */
interface MergeSides {
  /** 源分支要落的操作（压缩后）；它同时给出源 tip 上这些实体的值 */
  readonly incoming: SwitchVersionActions;
  /** 源分支 tip → 合并基准：这一段碰过的实体在基准上的值 */
  readonly base: SwitchVersionActions;
  /** 合并基准 → 目标分支 tip：目标分叉以来的改动 */
  readonly target: SwitchVersionActions;
}

/** 一个实体在合并基准上、在目标现在各是什么样。 */
interface TargetState {
  /** 合并基准上有它 */
  readonly existedAtBase: boolean;
  /** 目标现在的值；目标里没有它时为 `undefined` */
  readonly current: Row | undefined;
  /**
   * 目标分叉以来的净改动：取值与基准不同的字段。改了又改回原值的不算——
   * 源把它写成什么都不会丢掉目标的任何东西。删后重建时，基准有、新行没有的字段也算（值为 `undefined`）
   */
  readonly net: Row;
}

/**
 * 这个实体在合并基准上的值；基准上没有它时为 `undefined`。
 *
 * @remarks
 * 「源 tip → 基准」这一段删过或建过它，就以那一段的结果为准；只改过字段，就在源 tip 的值上
 * 换回那些字段在基准上的值。这一段完全没碰过它，基准上的值就是源 tip 上的值：源是目标的祖先时，
 * 合并会把源分支在基准之前的那段历史也重放一遍，那些实体只出现在 `incoming` 里。
 */
const baseRowOf = (sides: MergeSides, key: string): Row | undefined => {
  const atSourceTip = valuesAt(sides.incoming, key);
  if (!touches(sides.base, key)) return atSourceTip;
  if (!sides.base.updates.has(key)) return valuesAt(sides.base, key);
  return { ...atSourceTip, ...valuesAt(sides.base, key) };
};

/**
 * 这个实体在目标现在的值；目标里没有它时为 `undefined`。
 *
 * @remarks
 * 分叉以来没碰过就是基准上的值，只改了字段就是基准叠上改动。删后重建（或目标自己新建）是整行替换，
 * 现在的值就是新行：叠在基准上的话，基准有、新行没有的字段会留成幻影。
 */
const currentRowOf = (sides: MergeSides, key: string, baseRow: Row | undefined): Row | undefined => {
  if (!touches(sides.target, key)) return baseRow;
  const changed = valuesAt(sides.target, key);
  if (!changed || sides.target.inserts.has(key)) return changed;
  return { ...baseRow, ...changed };
};

const targetStateOf = (sides: MergeSides, key: string): TargetState => {
  const baseRow = baseRowOf(sides, key);
  const changed = valuesAt(sides.target, key) ?? {};
  // 整行替换时把基准上的字段也拿来比：新行里没了的字段，是目标把它删了，同样是净改动
  const fields =
    sides.target.inserts.has(key) ? [...Object.keys(baseRow ?? {}), ...Object.keys(changed)] : Object.keys(changed);
  const netFields = [...new Set(fields)].filter(field => !isEqual(changed[field], baseRow?.[field]));
  return {
    existedAtBase: baseRow !== undefined,
    current: currentRowOf(sides, key, baseRow),
    net: pick(changed, netFields)
  };
};

/** 源的 UPDATE：目标里没有这一行就落空；目标净改过的业务字段被写成别的值就是覆盖。 */
const updateConflict = (patch: Row, target: TargetState): MergePreviewConflict | null => {
  if (!target.current) return { kind: 'update_deleted' };
  const fields = differingBusinessFields(
    Object.keys(patch).filter(field => Object.hasOwn(target.net, field)),
    patch,
    target.net
  );
  return fields.length > 0 ? { kind: 'overwrite', fields } : null;
};

/** 源的 DELETE：目标净改过的业务字段会随实体一起没了。 */
const deleteConflict = (target: TargetState): MergePreviewConflict | null => {
  if (!target.current) return null;
  const fields = Object.keys(target.net).filter(field => !BOOKKEEPING.has(field));
  return fields.length > 0 ? { kind: 'delete_edited', fields } : null;
};

/**
 * 源的 INSERT（整行替换）：目标里没有它时，基准上有就是目标分叉以来删了、合并会把它建回来，
 * 基准上也没有就是普通的新建；目标净改过的业务字段被换成别的值就是覆盖。
 */
const insertConflict = (row: Row, target: TargetState): MergePreviewConflict | null => {
  if (!target.current) return target.existedAtBase ? { kind: 'revive_deleted' } : null;
  const fields = differingBusinessFields(Object.keys(target.net), row, target.net);
  return fields.length > 0 ? { kind: 'overwrite', fields } : null;
};

/** 合并要落的一个实体，连同目标现在的值与覆盖标注。 */
const previewEntry = (sides: MergeSides, key: string): MergePreviewEntry => {
  const identity = identityOf(key);
  const target = targetStateOf(sides, key);
  const current = target.current ?? null;
  const written = valuesAt(sides.incoming, key);
  if (sides.incoming.inserts.has(key) && written) {
    return {
      ...identity,
      operation: 'INSERT',
      patch: written,
      inversePatch: current,
      conflict: insertConflict(written, target)
    };
  }
  if (written) {
    return {
      ...identity,
      operation: 'UPDATE',
      patch: written,
      inversePatch: current && pick(current, Object.keys(written)),
      conflict: updateConflict(written, target)
    };
  }
  return {
    ...identity,
    operation: 'DELETE',
    patch: null,
    inversePatch: current,
    conflict: deleteConflict(target)
  };
};

/**
 * 一个变更点在自己父链上第 `index` 条分支上看到的位置：在它自己那条分支上是它停的变更，
 * 在祖先上是往下一级子分支的分叉点。
 */
const positionOn = (point: BranchPoint, path: readonly RxDBBranch[], index: number): number =>
  index === 0 ? (point.changeId ?? forkPointOf(point.branch)) : forkPointOf(path[index - 1]);

/**
 * 源 tip 与目标 tip 的最近公共祖先点（merge base）：两条父链上的第一条公共分支，停在两边在它上面
 * 看到的位置里较早的那个。
 *
 * @remarks
 * 两边不在同一棵树上时（`syncBranches` 会原样落下远端 `parentId` 为空的分支，库里于是不止一个根），
 * 与 `find_switch_branch_step` 的「经根」同一口径：两边都是从空库长出来的，基准就是空库——源那棵树的根停在 0。
 */
const mergeBasePoint = (branches: readonly RxDBBranch[], source: BranchPoint, target: BranchPoint): BranchPoint => {
  const branchMap = new Map(branches.map(branch => [branch.id, branch]));
  const sourcePath = find_branch_path_to_root(source.branch, branchMap);
  const targetPath = find_branch_path_to_root(target.branch, branchMap);
  const sourceIndex = sourcePath.findIndex(branch => targetPath.some(candidate => candidate.id === branch.id));
  if (sourceIndex === -1) return { branch: sourcePath[sourcePath.length - 1], changeId: 0 };
  const common = sourcePath[sourceIndex];
  const targetIndex = targetPath.findIndex(branch => branch.id === common.id);
  return {
    branch: common,
    changeId: Math.min(positionOn(source, sourcePath, sourceIndex), positionOn(target, targetPath, targetIndex))
  };
};

/**
 * 预览把一条分支合并进另一条会落什么。
 *
 * @param readers - 见 {@link SwitchBranchActionReaders}
 * @param sourceBranchId - 源分支
 * @param targetBranchId - 目标分支（`VersionManager.previewMerge()` 传当前 active 分支）
 * @param options - 见 {@link MergePreviewOptions}
 * @returns 合并会落的实体、`merged` 计数与覆盖标注
 * @throws {@link RxDBError} 合并进自己、或任一分支不存在时，与 `mergeBranch()` 同一句报错
 *
 * @remarks
 * 源分支的改动与合并取法相同（{@link find_source_changes}）、按同一份逻辑压缩（{@link squash_source_changes}），
 * 条目因此就是合并真正落的操作。
 *
 * 基准是源 tip 与目标 tip 的最近公共祖先点（merge base）：目标「分叉以来的改动」是基准到目标 tip 的增量，
 * 基准上的值取源 tip 到基准的增量（这一段没碰过的实体，基准上的值就是源 tip 上的值）。不取源分支自己的分叉点：
 * 目标是源的后代、比源分叉得更早、或源是孙分支合进祖分支时，「源的分叉点 → 目标 tip」里混着不属于目标自己的
 * 改动（源自己的历史、两边分开之后上游的改动），会把目标从没碰过的字段误报成覆盖。最常见的「子分支合回父分支」
 * 里，两者是同一点。
 *
 * 几次读（源分支的变更、两次增量）不在同一个事务里：预览期间另有合并或切换落库，结果可能由两个时刻的变更日志
 * 拼成。不为此开事务：`mergeBranch()` 自己也是在事务外读源分支的变更、再开事务写，预览只是合并前的提示、不写库，
 * 读得再一致也保证不了随后那次合并落的就是预览的这些。
 *
 * @internal
 */
export const preview_merge = async (
  readers: SwitchBranchActionReaders,
  sourceBranchId: string,
  targetBranchId: string,
  options?: MergePreviewOptions
): Promise<MergePreview> => {
  const strategy = options?.strategy ?? 'squash';
  if (sourceBranchId === targetBranchId) throw merge_into_itself_error(sourceBranchId);
  const branches = await allBranches(readers);
  const source = branchOf(branches, sourceBranchId);
  const targetBranch = branchOf(branches, targetBranchId);
  const sourceChanges = await find_source_changes(readers.changeRepository, source);
  const incoming = squash_source_changes(sourceChanges);
  const netCount = incoming.inserts.size + incoming.updates.size + incoming.deletes.size;
  const merged = strategy === 'normal' ? sourceChanges.length : netCount;
  if (netCount === 0) return { sourceBranchId, targetBranchId, strategy, merged, entries: [] };

  const sourceTip = await branch_tip_point(readers.changeRepository, source);
  const targetTip = await branch_tip_point(readers.changeRepository, targetBranch);
  const mergeBase = mergeBasePoint(branches, sourceTip, targetTip);
  const sides: MergeSides = {
    incoming,
    base: await compute_branch_transition_actions(readers.changeRepository, branches, sourceTip, mergeBase),
    target: await compute_branch_transition_actions(readers.changeRepository, branches, mergeBase, targetTip)
  };
  const entries = touchedKeys(incoming).map(key => previewEntry(sides, key));
  return { sourceBranchId, targetBranchId, strategy, merged, entries };
};
