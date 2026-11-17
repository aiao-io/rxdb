import type { ChangeSet, Commit, CommitMeta, CommitSummary, Records } from '../model.js';

/** 提交图里的一个节点：走图只需要的信息；`merge` 表示它是共享分支上的合并提交。 */
export interface Link {
  id: string;
  parent: string | null;
  merge: boolean;
}
/** 沿父指针走出的一段路径：`links` 从新到旧，`reached` 表示走到了目标（目标是 null 时指走到了根）。 */
export interface Path {
  links: Link[];
  reached: boolean;
}
/** 一个提交的血缘：任务提交从新到旧，直到最近的合并提交（不含）；`anchor` 是那个合并提交的 ID，一路走到根则为 null。 */
export interface Lineage {
  links: Link[];
  anchor: string | null;
}
/** 合并对共享记录的改动：要写入（新增或覆盖）的整行，与要删除的记录标识。 */
export interface SharedChange {
  upsert: Records;
  remove: string[];
}

/**
 * 提交与共享记录的存储接口：引擎本身不碰存储，仓储按命令类型经它预加载所需数据，再把命令的效果写回。
 * 一个实例对应一个团队下的一个应用；PostgreSQL 实现与内存实现（测试用）遵守同一份行为约定。
 * 读取的成本只取决于所问的内容，不取决于工作区里一共有多少提交。
 */
export interface CommitStore {
  /** 按标识读取已存在提交的元数据（含指纹，不含变更）；不存在的标识不出现在结果里。 */
  commits(ids: readonly string[]): Promise<Map<string, CommitMeta>>;
  /**
   * 从 `from` 沿父指针向前走（含 `from`），到 `until`（不含）为止；`until` 为 null 表示一直走到根。
   * `from` 为 null 时路径为空；`from` 与 `until` 相同时路径为空且已到达。
   */
  path(from: string | null, until: string | null): Promise<Path>;
  /** 从 `id` 沿父指针向前走到最近的合并提交（不含）；`id` 不存在时抛出 `not_found`。 */
  lineage(id: string): Promise<Lineage>;
  /** 读取提交的字段级变更，按提交内的顺序；`records` 给出时只取这些记录的变更。没有变更的提交可以不出现在结果里，调用方按空列表处理。 */
  changes(ids: readonly string[], records?: readonly string[]): Promise<Map<string, ChangeSet[]>>;
  /** 共享分支当前的记录；`records` 给出时只取这些记录。 */
  shared(records?: readonly string[]): Promise<Records>;
  /** 全部提交的摘要，按追加顺序。 */
  summaries(): Promise<Record<string, CommitSummary>>;
  /** 追加提交（含字段级变更与指纹），只追加、不可修改。 */
  append(commits: readonly Commit[]): Promise<void>;
  /** 应用合并对共享记录的改动。 */
  apply(change: SharedChange): Promise<void>;
}

/** 提交的摘要：去掉指纹，合并关联只在合并提交上出现。 */
export function commitSummary(meta: CommitMeta): CommitSummary {
  const summary: CommitSummary = { id: meta.id, parent: meta.parent, authorId: meta.authorId, message: meta.message };
  if (meta.mergeSource !== undefined) summary.mergeSource = meta.mergeSource;
  if (meta.candidateId !== undefined) summary.candidateId = meta.candidateId;
  return summary;
}
