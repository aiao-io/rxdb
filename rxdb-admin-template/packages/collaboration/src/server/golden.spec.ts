import { describe, expect, it } from 'vitest';
import { uuidv7 } from '../commit.js';
import {
  historyAdmin,
  historySchema,
  replayHistory,
  type HistoryDriver,
  type HistoryStats
} from './history.testing.js';
import { MemoryWorkspace } from './memory.testing.js';

/** 内存工作区上的驱动：与 PostgreSQL 集成用例共用同一套随机历史与全量快照对照。 */
function memoryDriver(workspace: MemoryWorkspace): HistoryDriver {
  let serial = 0;
  const env = () => ({ now: Date.now(), id: () => uuidv7() });
  return {
    run: command => workspace.run(historyAdmin, { ...command, operationId: `operation-${++serial}` } as never, env()),
    summary: () => workspace.summary(historyAdmin),
    records: () => workspace.records(historyAdmin),
    commit: id => workspace.commit(historyAdmin, id),
    candidate: id => workspace.candidate(historyAdmin, id),
    history: query => workspace.history(historyAdmin, query)
  };
}

describe('candidates and commit content against the full-snapshot algorithm', () => {
  const totals: HistoryStats = { commits: 0, merges: 0, conflicts: 0, resolved: 0, forks: 0, checks: 0 };
  const seeds = Array.from({ length: 40 }, (_, index) => index + 1);
  it.each(seeds)(
    'random history, seed %i: candidates, shared records and every commit equal the snapshots',
    async seed => {
      const workspace = MemoryWorkspace.create(
        {
          teamId: 'team',
          appId: 'assets',
          name: 'Team',
          bootstrapKey: 'seed',
          admin: historyAdmin,
          schema: historySchema
        },
        { now: Date.now(), id: () => uuidv7() }
      );
      const stats = await replayHistory(seed, memoryDriver(workspace));
      for (const key of Object.keys(totals) as (keyof HistoryStats)[]) totals[key] += stats[key];
    }
  );
  it('the replayed histories cover merges, resolved conflicts, failed checks, forks and long shared chains', () => {
    expect(totals.merges).toBeGreaterThan(40);
    expect(totals.conflicts).toBeGreaterThan(5);
    expect(totals.resolved).toBeGreaterThan(3);
    expect(totals.checks).toBeGreaterThan(3);
    expect(totals.forks).toBeGreaterThan(5);
    expect(totals.commits).toBeGreaterThan(300);
  });
});
