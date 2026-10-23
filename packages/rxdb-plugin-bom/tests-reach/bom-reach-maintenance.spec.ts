import { describe, expect, it } from 'vitest';
import { bomSqlDialectFor } from '../src/resolve/bom-sql.js';
import { BomCycleError } from '../src/types.js';
import {
  clearReachDmlAudit,
  expectReachMatches,
  installReachDmlAudit,
  readReachDmlCount,
  readReachPairs,
  readReachRows,
  withReachFixture
} from './reach-test-utils.js';

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`BOM 可达性待接入的真实存储回归 [${backend}]`, () => {
    it('正长度物料对按类型和组织隔离，草稿已接受发生项也在闭包中', async () => {
      await withReachFixture(backend, async fixture => {
        await fixture.add('A', 'B');
        await fixture.add('B', 'C');
        await fixture.add('B', 'A', { bomType: 'mbom' });
        await fixture.add('B', 'A', { orgId: 'other-org' });
        await expectReachMatches(fixture.adapter);
        const pairs = await readReachPairs(fixture.adapter);
        expect(pairs).toHaveLength(5);
        expect(pairs).toContainEqual(['ebom', 'reach-org', fixture.ids.A, fixture.ids.C]);
        expect(pairs).toContainEqual(['mbom', 'reach-org', fixture.ids.B, fixture.ids.A]);
        expect(pairs.every(row => row[2] !== row[3])).toBe(true);
      });
    });

    it('插入只补祖先×后代，新边作用域外的所有记录完全不变', async () => {
      await withReachFixture(backend, async fixture => {
        await fixture.add('A', 'B');
        await fixture.add('C', 'D');
        await fixture.add('E', 'X', { orgId: 'other-org' });
        const before = await readReachRows(fixture.adapter);
        await installReachDmlAudit(fixture.adapter);
        await fixture.add('B', 'C');
        await expectReachMatches(fixture.adapter);
        expect(await readReachDmlCount(fixture.adapter)).toBe(4);
        const after = await readReachRows(fixture.adapter);
        const orgIndex = before.columns.indexOf('orgId');
        expect(after.rows.filter(row => row[orgIndex] === 'other-org')).toEqual(
          before.rows.filter(row => row[orgIndex] === 'other-org')
        );
        expect(await readReachPairs(fixture.adapter)).toHaveLength(7);
      });
    });

    it('重复边和替代菱形路径被删除时保留支持关系，最后支持删除才退出', async () => {
      await withReachFixture(backend, async fixture => {
        const first = await fixture.add('A', 'B');
        const duplicate = await fixture.add('A', 'B');
        await fixture.add('B', 'D');
        const alternate = await fixture.add('A', 'C');
        await fixture.add('C', 'D');
        await expectReachMatches(fixture.adapter);
        await first.remove();
        await expectReachMatches(fixture.adapter);
        await duplicate.remove();
        await expectReachMatches(fixture.adapter);
        expect(await readReachPairs(fixture.adapter)).toContainEqual([
          'ebom',
          'reach-org',
          fixture.ids.A,
          fixture.ids.D
        ]);
        await alternate.remove();
        await expectReachMatches(fixture.adapter);
        expect(await readReachPairs(fixture.adapter)).not.toContainEqual([
          'ebom',
          'reach-org',
          fixture.ids.A,
          fixture.ids.D
        ]);
      });
    });

    it('qty、损耗和日期修改的闭包DML严格为零，全部审计字段也不重写', async () => {
      await withReachFixture(backend, async fixture => {
        const occurrence = await fixture.add('A', 'B');
        await fixture.add('B', 'C');
        const before = await readReachRows(fixture.adapter);
        await installReachDmlAudit(fixture.adapter);
        occurrence.qty = '9';
        await occurrence.save();
        occurrence.componentScrap = '0.1';
        await occurrence.save();
        occurrence.effectiveFrom = new Date('2027-01-01T00:00:00.000Z');
        await occurrence.save();
        const dialect = bomSqlDialectFor(fixture.adapter.name);
        await fixture.adapter.transaction(async executor => {
          await executor.query(
            `UPDATE ${dialect.table('bom_line_occurrence')} SET "qty" = '11' WHERE "id" = ${dialect.placeholder(0)}`,
            [occurrence.id]
          );
        });
        expect(await readReachDmlCount(fixture.adapter)).toBe(0);
        expect(await readReachRows(fixture.adapter)).toEqual(before);
        await expectReachMatches(fixture.adapter);
      });
    });

    it('端点更新等于删除旧边并加入新边，方向切换只保留consume', async () => {
      await withReachFixture(backend, async fixture => {
        const occurrence = await fixture.add('A', 'B');
        await fixture.add('B', 'C');
        occurrence.childItemId = fixture.ids.D;
        await occurrence.save();
        await expectReachMatches(fixture.adapter);
        expect(await readReachPairs(fixture.adapter)).not.toContainEqual([
          'ebom',
          'reach-org',
          fixture.ids.A,
          fixture.ids.C
        ]);
        occurrence.flowDirection = 'by_product';
        await occurrence.save();
        await expectReachMatches(fixture.adapter);
        expect(await readReachPairs(fixture.adapter)).not.toContainEqual([
          'ebom',
          'reach-org',
          fixture.ids.A,
          fixture.ids.D
        ]);
        occurrence.flowDirection = 'consume';
        await occurrence.save();
        await expectReachMatches(fixture.adapter);
        expect(await readReachPairs(fixture.adapter)).toContainEqual([
          'ebom',
          'reach-org',
          fixture.ids.A,
          fixture.ids.D
        ]);
      });
    });

    it('直连SQL成环与非法归属更新被拒后，可达表和DML计数完全不变', async () => {
      await withReachFixture(backend, async fixture => {
        const first = await fixture.add('A', 'B');
        const occurrence = await fixture.add('B', 'C');
        const before = await readReachRows(fixture.adapter);
        await installReachDmlAudit(fixture.adapter);
        const dialect = bomSqlDialectFor(fixture.adapter.name);
        await expect(
          fixture.adapter.transaction(async executor => {
            await executor.query(
              `UPDATE ${dialect.table('bom_line_occurrence')} SET "childItemId" = ${dialect.placeholder(0)} WHERE "id" = ${dialect.placeholder(1)}`,
              [fixture.ids.A, occurrence.id]
            );
          })
        ).rejects.toThrow(/bom_cycle/);
        expect(await readReachRows(fixture.adapter)).toEqual(before);
        expect(await readReachDmlCount(fixture.adapter)).toBe(0);
        await expect(
          fixture.adapter.transaction(async executor => {
            await executor.query(
              `UPDATE ${dialect.table('bom_line_occurrence')} SET "lineId" = ${dialect.placeholder(0)} WHERE "id" = ${dialect.placeholder(1)}`,
              [first.lineId, occurrence.id]
            );
          })
        ).rejects.toThrow(/bom_write_protocol/);
        expect(await readReachRows(fixture.adapter)).toEqual(before);
        expect(await readReachDmlCount(fixture.adapter)).toBe(0);
        await expect(fixture.add('C', 'A')).rejects.toBeInstanceOf(BomCycleError);
        expect(await readReachRows(fixture.adapter)).toEqual(before);
      });
    });

    it('显式事务回滚同时恢复端点和派生表，触发器不能留下半次增量', async () => {
      await withReachFixture(backend, async fixture => {
        const occurrence = await fixture.add('A', 'B');
        await fixture.add('B', 'C');
        const before = await readReachRows(fixture.adapter);
        await installReachDmlAudit(fixture.adapter);
        await clearReachDmlAudit(fixture.adapter);
        const dialect = bomSqlDialectFor(fixture.adapter.name);
        await expect(
          fixture.adapter.transaction(async executor => {
            await executor.query(
              `UPDATE ${dialect.table('bom_line_occurrence')} SET "childItemId" = ${dialect.placeholder(0)} WHERE "id" = ${dialect.placeholder(1)}`,
              [fixture.ids.D, occurrence.id]
            );
            throw new Error('主动回滚');
          })
        ).rejects.toThrow('主动回滚');
        expect(await readReachRows(fixture.adapter)).toEqual(before);
        expect(await readReachDmlCount(fixture.adapter)).toBe(0);
        await expectReachMatches(fixture.adapter);
      });
    });
  });
}
