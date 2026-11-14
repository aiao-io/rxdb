import type { UUID } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { BomEcn, BomHeader, BomLine, BomLineOccurrence } from '../src/entities.js';
import { BomCycleError } from '../src/types.js';
import {
  expectReachMatches,
  installReachDmlAudit,
  readReachDmlCount,
  readReachPairs,
  readReachRows,
  withReachFixture
} from './reach-test-utils.js';

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`BOM ECN可达性 [${backend}]`, () => {
    it('draft新增立即入并集；发布和改期零DML；取消实际删除才退出', async () => {
      await withReachFixture(backend, async fixture => {
        const db = fixture.adapter.rxdb;
        const original = await fixture.add('A', 'B');
        await fixture.add('C', 'D');
        const line = await firstValueFrom(db.entityManager.getRepository(BomLine).get(original.lineId as UUID));
        const header = await firstValueFrom(db.entityManager.getRepository(BomHeader).get(line.headerId as UUID));
        header.state = 'released';
        await header.save();
        const ecn = db.entityManager.instantiate(BomEcn, {
          ecnNo: 'REACH-ECN',
          effectiveDate: new Date('2099-01-01T00:00:00.000Z')
        });
        await ecn.save();
        const additionLine = db.entityManager.instantiate(BomLine, {
          headerId: header.id,
          lineNo: 100,
          ecnInId: ecn.id
        });
        await additionLine.save();
        const addition = db.entityManager.instantiate(BomLineOccurrence, {
          lineId: additionLine.id,
          childItemId: fixture.ids.C,
          qty: '2',
          ecnInId: ecn.id,
          effectiveFrom: ecn.effectiveDate
        });
        await addition.save();
        await expectReachMatches(fixture.adapter);
        expect(await readReachPairs(fixture.adapter)).toContainEqual([
          'ebom',
          'reach-org',
          fixture.ids.A,
          fixture.ids.D
        ]);
        const context = {
          bomType: 'ebom' as const,
          orgId: 'reach-org',
          asOfDate: new Date('2099-01-01T00:00:00.000Z')
        };
        expect((await db.bom.whereUsed(context, { childItemId: fixture.ids.C })).nodes).toEqual([]);
        const before = await readReachRows(fixture.adapter);
        await installReachDmlAudit(fixture.adapter);
        ecn.state = 'released';
        await ecn.save();
        expect(await readReachDmlCount(fixture.adapter)).toBe(0);
        expect(await readReachRows(fixture.adapter)).toEqual(before);
        expect((await db.bom.whereUsed(context, { childItemId: fixture.ids.C })).nodes).toHaveLength(1);
        ecn.effectiveDate = new Date('2099-02-01T00:00:00.000Z');
        await ecn.save();
        expect(await readReachDmlCount(fixture.adapter)).toBe(0);
        expect(await readReachRows(fixture.adapter)).toEqual(before);
        expect((await db.bom.whereUsed(context, { childItemId: fixture.ids.C })).nodes).toEqual([]);
        ecn.state = 'cancelled';
        await ecn.save();
        expect(await readReachDmlCount(fixture.adapter)).toBe(2);
        await expectReachMatches(fixture.adapter);
        expect(await readReachPairs(fixture.adapter)).not.toContainEqual([
          'ebom',
          'reach-org',
          fixture.ids.A,
          fixture.ids.C
        ]);
        expect(await readReachPairs(fixture.adapter)).toContainEqual([
          'ebom',
          'reach-org',
          fixture.ids.C,
          fixture.ids.D
        ]);
      });
    });

    it('draft ECN反向边在发布前即拒绝，撤回已接受发生项同步退出并集', async () => {
      await withReachFixture(backend, async fixture => {
        const db = fixture.adapter.rxdb;
        const original = await fixture.add('A', 'B');
        const line = await firstValueFrom(db.entityManager.getRepository(BomLine).get(original.lineId as UUID));
        const header = await firstValueFrom(db.entityManager.getRepository(BomHeader).get(line.headerId as UUID));
        header.state = 'released';
        await header.save();
        const ecn = db.entityManager.instantiate(BomEcn, {
          ecnNo: 'REACH-DRAFT-ECN',
          effectiveDate: new Date('2099-01-01T00:00:00.000Z')
        });
        await ecn.save();
        const addedLine = db.entityManager.instantiate(BomLine, { headerId: header.id, lineNo: 100, ecnInId: ecn.id });
        await addedLine.save();
        const added = db.entityManager.instantiate(BomLineOccurrence, {
          lineId: addedLine.id,
          childItemId: fixture.ids.C,
          qty: '1',
          effectiveFrom: ecn.effectiveDate,
          ecnInId: ecn.id
        });
        await added.save();
        const before = await readReachRows(fixture.adapter);
        await expect(fixture.add('C', 'A')).rejects.toBeInstanceOf(BomCycleError);
        expect(await readReachRows(fixture.adapter)).toEqual(before);
        await added.remove();
        await expectReachMatches(fixture.adapter);
        expect(await readReachPairs(fixture.adapter)).not.toContainEqual([
          'ebom',
          'reach-org',
          fixture.ids.A,
          fixture.ids.C
        ]);
        await expect(fixture.add('C', 'A')).resolves.toBeDefined();
        await expectReachMatches(fixture.adapter);
      });
    });
  });
}
