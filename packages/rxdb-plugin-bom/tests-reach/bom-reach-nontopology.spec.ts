import type { UUID } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { BomHeader, BomInstanceNode, BomItem, BomItemRevision, BomLine, BomLineDesignator } from '../src/entities.js';
import { deterministicId } from '../src/testing/scooter-dataset.js';
import {
  expectReachMatches,
  installReachDmlAudit,
  readReachDmlCount,
  readReachRows,
  withReachFixture
} from './reach-test-utils.js';

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`BOM 非拓扑更新零写入 [${backend}]`, () => {
    it('公式/工序/phantom/换算/位号/发布/安装事实均不重写可达性', async () => {
      await withReachFixture(backend, async fixture => {
        const db = fixture.adapter.rxdb;
        const occurrence = await fixture.add('A', 'B');
        await fixture.add('B', 'C');
        const before = await readReachRows(fixture.adapter);
        await installReachDmlAudit(fixture.adapter);
        const verify = async (): Promise<void> => {
          expect(await readReachDmlCount(fixture.adapter)).toBe(0);
          expect(await readReachRows(fixture.adapter)).toEqual(before);
        };
        occurrence.qty = null;
        occurrence.qtyFormula = '2';
        occurrence.formulaGrammarVersion = '1';
        await occurrence.save();
        await verify();
        occurrence.qty = '1';
        occurrence.qtyFormula = null;
        occurrence.formulaGrammarVersion = null;
        occurrence.operationSeq = 10;
        occurrence.phantomOverride = true;
        await occurrence.save();
        await verify();
        occurrence.operationSeq = null;
        occurrence.designatorManaged = true;
        await occurrence.save();
        const designator = db.entityManager.instantiate(BomLineDesignator, {
          occurrenceId: occurrence.id,
          designator: 'R1'
        });
        await designator.save();
        designator.designator = 'R2';
        await designator.save();
        await designator.remove();
        occurrence.designatorManaged = false;
        await occurrence.save();
        await verify();
        const item = await firstValueFrom(db.entityManager.getRepository(BomItem).get(fixture.ids.B as UUID));
        item.description = '只修改显示信息';
        item.uomConversion = '2';
        await item.save();
        const revision = db.entityManager.instantiate(BomItemRevision, {
          itemId: fixture.ids.B,
          revisionNo: 'B',
          defaultPhantom: true,
          effectiveFrom: new Date('2099-01-01T00:00:00.000Z')
        });
        await revision.save();
        revision.state = 'released';
        await revision.save();
        await verify();
        const line = await firstValueFrom(db.entityManager.getRepository(BomLine).get(occurrence.lineId as UUID));
        line.lineNo = 100;
        await line.save();
        const header = await firstValueFrom(db.entityManager.getRepository(BomHeader).get(line.headerId as UUID));
        header.baseQty = '2';
        await header.save();
        header.state = 'released';
        await header.save();
        await verify();
        const instance = db.entityManager.instantiate(BomInstanceNode, {
          itemRevisionId: deterministicId('reach-test:revision:A'),
          installedAt: new Date('2026-01-01T00:00:00.000Z')
        });
        await instance.save();
        instance.removedAt = new Date('2027-01-01T00:00:00.000Z');
        await instance.save();
        await verify();
        await expectReachMatches(fixture.adapter);
      });
    });
  });
}
