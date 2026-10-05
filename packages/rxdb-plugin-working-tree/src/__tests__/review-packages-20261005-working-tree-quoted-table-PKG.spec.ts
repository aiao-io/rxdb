import { SyncType } from '@aiao/rxdb';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { applyRawWriteJudgment, judgeRawWrite } from '../working-tree/raw-write-judgment.js';
import { buildVersionedDomain } from '../working-tree/versioned-domain.js';

const inspectGuardedWrite = async (logicalName: string) => {
  const physicalName = `public$${logicalName}`;
  const quoted = `"${physicalName}"`;
  const database = new DatabaseSync(':memory:');
  const domain = buildVersionedDomain([
    { entityName: 'ReviewedNote', namespace: 'public', physicalTableNames: [logicalName, physicalName], syncType: SyncType.Full }
  ]);
  const context = { capabilityEnabled: true, domain };
  const sql = `UPDATE ${quoted} SET title = 'changed' WHERE id = 1`;
  let executed = false;
  try {
    database.exec(`CREATE TABLE ${quoted} (id INTEGER PRIMARY KEY, title TEXT); INSERT INTO ${quoted} VALUES (1, 'before')`);
    const judgment = judgeRawWrite(sql, context);
    const outcome = await applyRawWriteJudgment(sql, context, () => {
      executed = true;
      database.exec(sql);
    }).then(() => 'fulfilled', () => 'rejected');
    const title = database.prepare(`SELECT title FROM ${quoted} WHERE id = 1`).get()?.['title'];
    return { judgment, outcome, executed, title };
  } finally {
    database.close();
  }
};

describe('PKG-working-tree：合法引号表名不得绕过 raw 写门禁', () => {
  it('ASCII 普通表名的对照确实在执行前拒绝', async () => {
    expect(await inspectGuardedWrite('post')).toMatchObject({
      judgment: { kind: 'reject' }, outcome: 'rejected', executed: false, title: 'before'
    });
  });

  it.each(['post-name', 'post name', 'café'])('tracked 表 %s 的合法 UPDATE 必须在执行前拒绝', async logicalName => {
    expect(await inspectGuardedWrite(logicalName)).toMatchObject({
      judgment: { kind: 'reject' }, outcome: 'rejected', executed: false, title: 'before'
    });
  });
});
