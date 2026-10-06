import { SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { applyRawWriteJudgment, judgeRawWrite } from '../working-tree/raw-write-judgment.js';
import { buildVersionedDomain } from '../working-tree/versioned-domain.js';

/**
 * 包只在浏览器里跑测试，不能借 `node:sqlite` 起真库；也不需要——拒绝发生在执行之前，
 * 执行器一次都没被调用就等于业务表零变化（同 raw-bypass-judgment.spec.ts 第 2 条）。
 */
const inspectGuardedWrite = async (logicalName: string) => {
  const physicalName = `public$${logicalName}`;
  const domain = buildVersionedDomain([
    {
      entityName: 'ReviewedNote',
      namespace: 'public',
      physicalTableNames: [logicalName, physicalName],
      syncType: SyncType.Full
    }
  ]);
  const context = { capabilityEnabled: true, domain };
  const sql = `UPDATE "${physicalName}" SET title = 'changed' WHERE id = 1`;
  let executed = false;
  const judgment = judgeRawWrite(sql, context);
  const outcome = await applyRawWriteJudgment(sql, context, () => {
    executed = true;
  }).then(
    () => 'fulfilled',
    () => 'rejected'
  );
  return { judgment, outcome, executed };
};

const judgeOn = (logicalName: string, sql: string) =>
  judgeRawWrite(sql, {
    capabilityEnabled: true,
    domain: buildVersionedDomain([
      {
        entityName: 'ReviewedNote',
        namespace: 'public',
        physicalTableNames: [logicalName, `public$${logicalName}`],
        syncType: SyncType.Full
      }
    ])
  });

describe('PKG-working-tree：合法引号表名不得绕过 raw 写门禁', () => {
  it('ASCII 普通表名的对照确实在执行前拒绝', async () => {
    expect(await inspectGuardedWrite('post')).toMatchObject({
      judgment: { kind: 'reject' },
      outcome: 'rejected',
      executed: false
    });
  });

  it.each(['post-name', 'post name', 'café'])('tracked 表 %s 的合法 UPDATE 必须在执行前拒绝', async logicalName => {
    expect(await inspectGuardedWrite(logicalName)).toMatchObject({
      judgment: { kind: 'reject' },
      outcome: 'rejected',
      executed: false
    });
  });

  it('不加引号的非 ASCII 表名同样是合法写，必须拒绝', () => {
    expect(judgeOn('café', `UPDATE public$café SET title = 'changed'`)).toMatchObject({ kind: 'reject' });
  });

  it('引号里的 "" 是转义：表名 a"b 不得被读成 ab', () => {
    expect(judgeOn('a"b', `UPDATE "public$a""b" SET title = 'changed'`)).toMatchObject({ kind: 'reject' });
  });

  it('换算不扩大域：域外的引号表名照常放行', () => {
    expect(judgeOn('post-name', `UPDATE "public$post-archive" SET title = 'changed'`)).toMatchObject({
      kind: 'allow',
      reason: 'out_of_domain'
    });
  });
});
