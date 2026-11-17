import { expect } from 'vitest';
import { checkRecords } from '../checks.js';
import { sealCommit, uuidv7 } from '../commit.js';
import type {
  Candidate,
  Commit,
  CommitContent,
  CommitPage,
  HistoryQuery,
  Identity,
  Records,
  Resolution,
  SharedRecords,
  WorkspaceSummary
} from '../model.js';
import { choose, pick, seeded } from '../random.testing.js';
import { canonical, mergeRecords } from '../records.js';
import { assetSchema, diffAssets } from '../schema.testing.js';

/** 随机历史测试需要的最小驱动：内存工作区与 PostgreSQL 仓储各自适配，走同一套场景与同一个全量快照对照。 */
export interface HistoryDriver {
  run(command: Record<string, unknown>): Promise<Record<string, unknown>>;
  summary(): Promise<WorkspaceSummary>;
  records(): Promise<SharedRecords>;
  commit(id: string): Promise<CommitContent>;
  candidate(id: string): Promise<Candidate>;
  history(query: HistoryQuery): Promise<CommitPage>;
}
/** 一次回放的统计，供用例确认场景确实覆盖了合并、冲突与长链。 */
export interface HistoryStats {
  commits: number;
  merges: number;
  conflicts: number;
  resolved: number;
  forks: number;
  checks: number;
}

/** 记录之间的依赖：资产依赖分类，维护记录依赖资产；删除一条记录时连同依赖它的记录一起删除，保持结果通过检查。 */
function removeWithDependents(records: Records, id: string): void {
  delete records[id];
  for (const [other, row] of Object.entries(records))
    if (row.fields['categoryId'] === id || row.fields['assetId'] === id) removeWithDependents(records, other);
}
/**
 * 对记录做一次随机的、保持数据有效的编辑：新增分类/资产/维护记录，改名（名称池很小，不同任务容易重名而冲突或不通过检查），
 * 改金额与日期，清空或移除可选字段，删除记录及其依赖。`serial` 保证新增的名称与标识全局唯一。
 */
function validEdit(next: () => number, records: Records, serial: () => number): Records {
  const result = structuredClone(records);
  const ids = Object.keys(result);
  const of = (entity: string) => ids.filter(id => result[id].entity === entity);
  const [categories, assets, events] = [of('AssetCategory'), of('Asset'), of('AssetEvent')];
  const kind = pick(next, 9);
  if (kind === 0 || !categories.length) {
    result[`c${serial()}`] = {
      entity: 'AssetCategory',
      fields: { name: `分类 ${serial()}`, ...(next() < 0.5 ? { description: '说明' } : {}) }
    };
  } else if (kind === 1) {
    result[`a${serial()}`] = {
      entity: 'Asset',
      fields: {
        name: `资产 ${serial()}`,
        categoryId: choose(next, categories),
        purchasePrice: pick(next, 500),
        ...(next() < 0.5 ? { purchaseDate: '2026-01-02' } : {})
      }
    };
  } else if (kind === 2 && assets.length) {
    result[`e${serial()}`] = {
      entity: 'AssetEvent',
      fields: {
        summary: `维护 ${serial()}`,
        assetId: choose(next, assets),
        happenedAt: '2026-02-03',
        cost: pick(next, 90)
      }
    };
  } else if (kind === 3 && ids.length) {
    const id = choose(next, ids);
    result[id].fields[result[id].entity === 'AssetEvent' ? 'summary' : 'name'] = `名称 ${pick(next, 6)}`;
  } else if (kind === 4 && assets.length) {
    result[choose(next, assets)].fields['purchasePrice'] = pick(next, 500);
  } else if (kind === 5 && events.length) {
    result[choose(next, events)].fields['cost'] = pick(next, 90);
  } else if (kind === 6 && categories.length) {
    const row = result[choose(next, categories)];
    if (next() < 0.5) delete row.fields['description'];
    else row.fields['description'] = null;
  } else if (kind === 7 && ids.length > 2) {
    removeWithDependents(result, choose(next, ids));
  } else if (assets.length) {
    result[choose(next, assets)].fields['purchaseDate'] = `2026-0${1 + pick(next, 9)}-1${pick(next, 9)}`;
  }
  return result;
}

interface Task {
  id: string;
  base: string | null;
  head: string | null;
  content: Records;
  pr: string | null;
}

/**
 * 随机回放一段多人协作历史，并在每一步与旧实现的「每个提交存全量快照」算法逐项对照：
 * 多个任务在不同的共享版本上起步、各自多次提交（含从中间提交另存分叉）、先后合并，共享分支因此产生长链；
 * 每次生成候选，都用全量快照上的三方合并算出同一份结果，要求候选记录、冲突与检查完全一致；
 * 每轮结束再核对共享记录与全部提交（任务提交与合并提交）的内容都与各自的全量快照相同。
 */
export async function replayHistory(seed: number, driver: HistoryDriver, rounds = 8): Promise<HistoryStats> {
  const next = seeded(seed);
  let counter = 0;
  const serial = () => ++counter;
  const stats: HistoryStats = { commits: 0, merges: 0, conflicts: 0, resolved: 0, forks: 0, checks: 0 };
  /** 旧实现：每个提交一份全量记录。 */
  const snapshots = new Map<string, Records>();
  let shared: Records = {};
  let head: string | null = null;
  /** 共享分支上的合并提交，从新到旧。 */
  const mergeHeads: string[] = [];
  const content = (id: string | null): Records => (id === null ? {} : snapshots.get(id)!);
  const tasks: Task[] = [];
  const author = (await driver.summary()).members[0].id;
  /** 客户端上传过的每个提交，另存分叉时原样重传其中的已有祖先。 */
  const sealed = new Map<string, Commit>();

  const upload = async (task: Task, count: number) => {
    const commits: Commit[] = [];
    let parent = task.head;
    let current = task.content;
    for (let index = 0; index < count; index++) {
      const after = Array.from({ length: 1 + pick(next, 3) }).reduce<Records>(
        records => validEdit(next, records, serial),
        current
      );
      const commit = await sealCommit({
        id: uuidv7(),
        parent,
        authorId: author,
        message: `提交 ${serial()}`,
        changes: diffAssets(current, after)
      });
      snapshots.set(commit.id, structuredClone(after));
      sealed.set(commit.id, commit);
      commits.push(commit);
      parent = commit.id;
      current = after;
    }
    await driver.run({ type: 'upload', taskId: task.id, expectedHead: task.head, commits });
    task.head = parent;
    task.content = current;
    stats.commits += count;
  };
  /**
   * 另存为新任务：从原任务的共同起点出发，原样重传原任务前几个提交（服务端必须认出它们是已有祖先，不重复写入），
   * 再追加一个新提交；新任务与原任务共用这几个提交，各自的头不同。
   */
  const fork = async (origin: Task) => {
    const chain = await chainOf(origin);
    const carried = chain.slice(0, pick(next, chain.length + 1));
    const parent = carried.at(-1) ?? origin.base;
    const before = content(parent);
    const after = validEdit(next, before, serial);
    const commit = await sealCommit({
      id: uuidv7(),
      parent,
      authorId: author,
      message: `分叉 ${serial()}`,
      changes: diffAssets(before, after)
    });
    snapshots.set(commit.id, structuredClone(after));
    sealed.set(commit.id, commit);
    const task: Task = { id: `t${serial()}`, base: origin.base, head: commit.id, content: after, pr: null };
    await driver.run({
      type: 'fork',
      id: task.id,
      name: `分叉 ${task.id}`,
      taskId: origin.id,
      expectedHead: origin.base,
      commits: [...carried.map(id => sealed.get(id)!), commit]
    });
    tasks.push(task);
    stats.commits++;
    stats.forks++;
  };
  /** 任务自共同起点以来的提交 ID，由旧到新：经提交历史分页逐页读取（每页 2 个，顺带覆盖翻页），再与本地记下的父链核对。 */
  const chainOf = async (task: Task) => {
    const chain: string[] = [];
    let before: string | undefined;
    do {
      const page = await driver.history({ taskId: task.id, limit: 2, ...(before ? { before } : {}) });
      chain.unshift(...page.commits.map(commit => commit.id).reverse());
      before = page.nextBefore ?? undefined;
    } while (before);
    const expected: string[] = [];
    for (let cursor = task.head; cursor !== null && cursor !== task.base; cursor = sealed.get(cursor)!.parent)
      expected.unshift(cursor);
    expect(chain).toEqual(expected);
    return chain;
  };
  const resolutionsFor = (conflicts: Candidate['conflicts']): Resolution[] =>
    conflicts.map(conflict => {
      const choice = choose(next, ['source', 'target', 'custom'] as const);
      if (choice !== 'custom') return { key: conflict.key, choice };
      if (conflict.field === null) return { key: conflict.key, choice, value: null };
      const numeric = typeof conflict.source === 'number' || typeof conflict.target === 'number';
      return { key: conflict.key, choice, value: numeric ? 12.5 : `自定义 ${serial()}` };
    });
  /** 生成候选并与全量快照上的三方合并逐项对照；返回候选。 */
  const candidateFor = async (task: Task, resolutions: Resolution[]) => {
    const revision = (await driver.summary()).prs.find(pr => pr.id === task.pr)!.revision;
    const result = await driver.run({ type: 'candidate', prId: task.pr, expectedRevision: revision, resolutions });
    const candidate = await driver.candidate(String(result['candidateId']));
    const expected = mergeRecords(content(task.base), content(task.head), shared, resolutions);
    // 经 HTTP 或 JSONB 往返的结果没有值为 undefined 的键，两边都按 JSON 形态比较
    const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
    expect(canonical(candidate.records)).toBe(canonical(expected.records));
    expect(canonical(wire(candidate.conflicts))).toBe(canonical(wire(expected.conflicts)));
    // 服务端只读改动过的记录做定向检查，这里在全量快照上按同一份清单检查整份结果，两者必须一致
    expect(canonical(candidate.checks)).toBe(canonical(checkRecords(assetSchema, expected.records)));
    expect({ base: candidate.base, source: candidate.source, target: candidate.target }).toEqual({
      base: task.base,
      source: task.head,
      target: head
    });
    return candidate;
  };
  const attempt = async (task: Task) => {
    if (!task.pr) {
      task.pr = `p${serial()}`;
      await driver.run({
        type: 'pr',
        id: task.pr,
        taskId: task.id,
        title: `PR ${task.pr}`,
        description: '',
        target: 'shared'
      });
      await driver.run({ type: 'pr_state', prId: task.pr, status: 'review', expectedRevision: 0 });
    }
    let candidate = await candidateFor(task, []);
    if (candidate.conflicts.length) {
      stats.conflicts += candidate.conflicts.length;
      candidate = await candidateFor(task, resolutionsFor(candidate.conflicts));
      stats.resolved++;
    }
    if (candidate.checks.length) stats.checks++;
    if (candidate.conflicts.length || candidate.checks.length) return;
    const merged = await driver.run({
      type: 'merge',
      prId: task.pr,
      candidateId: candidate.id,
      expectedSource: candidate.source,
      expectedTarget: candidate.target
    });
    head = String(merged['head']);
    mergeHeads.unshift(head);
    shared = structuredClone(candidate.records);
    snapshots.set(head, structuredClone(shared));
    tasks.splice(tasks.indexOf(task), 1);
    stats.merges++;
  };
  /** 共享分支的提交历史（逐页读取，每页 3 个），从新到旧。 */
  const sharedHistory = async () => {
    const ids: string[] = [];
    let before: string | undefined;
    do {
      const page = await driver.history({ branch: 'shared', limit: 3, ...(before ? { before } : {}) });
      ids.push(...page.commits.map(commit => commit.id));
      before = page.nextBefore ?? undefined;
    } while (before);
    return ids;
  };
  /** 共享记录、共享分支的历史与已知的每个提交的内容，都必须等于旧实现里各自存的全量快照与合并顺序。 */
  const verify = async () => {
    const records = await driver.records();
    expect(records.head).toBe(head);
    expect(canonical(records.records)).toBe(canonical(shared));
    expect(await sharedHistory()).toEqual(mergeHeads);
    for (const [id, snapshot] of snapshots)
      expect(canonical((await driver.commit(id)).records), `commit ${id}`).toBe(canonical(snapshot));
  };

  await driver.run({ type: 'policy', stages: [], expectedVersion: 1 });
  for (let round = 0; round < rounds; round++) {
    if (tasks.length < 3 && next() < 0.8) {
      const task: Task = { id: `t${serial()}`, base: head, head, content: structuredClone(shared), pr: null };
      await driver.run({ type: 'task', id: task.id, name: `任务 ${task.id}`, expectedHead: head });
      await upload(task, 1 + pick(next, 3));
      tasks.push(task);
    }
    for (const task of [...tasks]) if (next() < 0.5) await upload(task, 1 + pick(next, 2));
    const forkable = tasks.find(task => task.pr === null && task.head !== task.base);
    if (forkable && next() < 0.3) await fork(forkable);
    const open = tasks.filter(task => task.head !== task.base);
    if (open.length) await attempt(choose(next, open));
    await verify();
  }
  return stats;
}

/** 随机历史用的数据模式：产品的资产清单。 */
export const historySchema = assetSchema;
/** 供内存与 PostgreSQL 用例共用的管理员身份。 */
export const historyAdmin: Identity = { id: 'history-admin', email: 'history-admin@example.test', verified: true };
