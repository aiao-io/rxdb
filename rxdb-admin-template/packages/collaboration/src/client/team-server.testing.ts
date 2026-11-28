import type { Command, Identity } from '../model.js';
import type { MemoryWorkspace } from '../server/memory.testing.js';
import type { ExchangeDownload } from './team-tasks.js';
import { exchangeRecordOf } from './team.testing.js';

/**
 * 内存服务端（`MemoryWorkspace`）上的下发接口替身，约定与只读函数 `admin_commit_exchange` 相同：已知提交连同全部祖先不再下发，
 * 不认识的已知提交忽略；其余提交父先于子，合并提交经第二父带进来的侧枝排在它前面；每页至多 `pageSize` 个，
 * 只在第一父链上的提交处断开，合并提交与它的侧枝不拆开；`head` 是分支此刻的头。真实的 SQL 实现由集成测试覆盖。
 */
export function memoryDownload(space: MemoryWorkspace, pageSize = 100): ExchangeDownload {
  return async (branch, known) => {
    const head = 'taskId' in branch ? space.state.tasks[branch.taskId].head : space.state.head;
    const parents = (id: string) => space.store.record(id)?.parentIds ?? [];
    const skip = new Set<string>();
    const mark = (id: string) => {
      if (skip.has(id) || !space.store.record(id)) return;
      skip.add(id);
      parents(id).forEach(mark);
    };
    known.forEach(mark);
    const chain: string[] = [];
    for (let id: string | undefined = head; id !== undefined && !skip.has(id); id = parents(id)[0]) chain.unshift(id);
    const emitted = new Set<string>();
    const groups = chain.map(id => {
      const group: string[] = [];
      const visit = (node: string) => {
        if (skip.has(node) || emitted.has(node)) return;
        emitted.add(node);
        parents(node).forEach(visit);
        group.push(node);
      };
      parents(id).slice(1).forEach(visit);
      emitted.add(id);
      group.push(id);
      return group;
    });
    const page: string[] = [];
    for (const group of groups) {
      if (page.length && page.length + group.length > pageSize) break;
      page.push(...group);
    }
    return {
      head,
      more: page.length < groups.flat().length,
      commits: page.map(id => exchangeRecordOf(space.store.record(id)!))
    };
  };
}

/** 以某个身份在内存服务端执行一条命令（自带幂等键），返回命令结果。 */
export function memoryCommand(space: MemoryWorkspace, now = () => Date.now()) {
  let serial = 0;
  return (actor: Identity, command: Record<string, unknown>) =>
    space.run(actor, { operationId: `operation-${++serial}`, ...command } as Command, {
      now: now(),
      id: () => crypto.randomUUID()
    });
}
