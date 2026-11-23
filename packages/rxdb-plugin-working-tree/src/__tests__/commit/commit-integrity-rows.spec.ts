import { describe, expect, it, vi } from 'vitest';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { readCommitIntegrityRows } from '../../commit/commit-integrity-rows.js';
import { createWorkingTreeScene } from '../working-tree/fixtures/working-tree-scene.js';

describe('完整性校验的持久化内容读取', () => {
  const patch = { title: '中文内容', secret: { $rxdbChangeValue: 'encrypted', value: '原始编码' } };
  const inversePatch = { title: '原稿', secret: null };
  const storedRow = (serialized: boolean): unknown[] => [
    "commit'quoted",
    3,
    'unit-1',
    null,
    'app',
    'Note',
    'note-1',
    'update',
    serialized ? JSON.stringify(patch) : patch,
    serialized ? JSON.stringify(inversePatch) : inversePatch,
    'local'
  ];

  it.each([false, true])('JSON 文本为 %s 时保留完整编码内容和顺序', async serialized => {
    const { probe } = createWorkingTreeScene();
    const query = vi.spyOn(probe.executor, 'query').mockResolvedValue({
      rowsAffected: 0,
      columns: [],
      rows: [storedRow(serialized)]
    });

    await expect(readCommitIntegrityRows(probe.executor, ["commit'quoted"])).resolves.toEqual([
      {
        commitId: "commit'quoted",
        sequence: 3,
        unitId: 'unit-1',
        transactionId: null,
        namespace: 'app',
        entity: 'Note',
        entityId: 'note-1',
        operation: 'update',
        patch,
        inversePatch,
        origin: 'local',
        unreadable: false
      }
    ]);
    expect(query.mock.calls[0][0]).toContain(`FROM ${probe.executor.tableRef(CommitChangeSet)}`);
    expect(query.mock.calls[0][0]).toContain("IN ('commit''quoted')");
  });

  it.each([8, 9])('第 %i 列的 JSON 文本损坏时标记为读不回来，不抛裸 SyntaxError', async column => {
    const { probe } = createWorkingTreeScene();
    const row = storedRow(true);
    row[column] = '{';
    vi.spyOn(probe.executor, 'query').mockResolvedValue({ rowsAffected: 0, columns: [], rows: [row] });

    const [read] = await readCommitIntegrityRows(probe.executor, ['commit-1']);
    expect(read).toMatchObject({ commitId: "commit'quoted", unreadable: true });
  });
});
