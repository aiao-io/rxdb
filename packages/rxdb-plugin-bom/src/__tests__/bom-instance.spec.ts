/** @fileoverview US-523 实例安装事实、时间查询与写入约束的双后端回归。 */

import { RxDBExclusionViolationError } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { BomInstanceNode, BomItem } from '../entities.js';
import { loadHistory } from '../resolve/history-loader.js';
import { resolveBom } from '../resolve/resolver.js';
import { BomCycleError, BomInstanceError } from '../types.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const INSTALLED = new Date('2026-01-10T08:00:00.000Z');
const CHANGED = new Date('2026-01-20T08:00:00.000Z');

interface InstanceFixture {
  adapter: BomTestAdapter;
  backend: BomTestBackend;
  rootItem: BomItem;
  serialItem: BomItem;
  rootRevisionId: string;
  serialRevisionId: string;
  bulkRevisionId: string;
  serialSourceId: string;
  bulkSourceId: string;
}

const withFixture = async (
  backend: BomTestBackend,
  action: (fixture: InstanceFixture) => Promise<void>
): Promise<void> => {
  const adapter = await createBomTestAdapter(backend);
  try {
    const items: BomItem[] = [];
    for (const [itemNo, serialized] of [
      ['DEVICE', true],
      ['SERIAL-PART', true],
      ['BULK-PART', false]
    ] as const) {
      const item = new BomItem();
      item.itemNo = itemNo;
      item.serialized = serialized;
      await item.save();
      items.push(item);
    }
    const revisionIds = items.map(() => crypto.randomUUID());
    const serialSourceId = crypto.randomUUID();
    const bulkSourceId = crypto.randomUUID();
    await loadHistory(adapter, {
      batchNo: 'instance-master',
      revisions: items.map((item, index) => ({
        id: revisionIds[index],
        itemId: item.id,
        revisionNo: index === 1 ? 'D' : 'A',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
      })),
      headers: [
        {
          revisionIndex: 0,
          bomType: 'ebom',
          orgId: 'instance-org',
          lines: [
            {
              lineNo: 10,
              occurrences: [
                {
                  id: serialSourceId,
                  childItemId: items[1].id,
                  qty: '1',
                  effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
                }
              ]
            },
            {
              lineNo: 20,
              occurrences: [
                {
                  id: bulkSourceId,
                  childItemId: items[2].id,
                  qty: '1',
                  effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
                }
              ]
            }
          ]
        }
      ]
    });
    await action({
      adapter,
      backend,
      rootItem: items[0],
      serialItem: items[1],
      rootRevisionId: revisionIds[0],
      serialRevisionId: revisionIds[1],
      bulkRevisionId: revisionIds[2],
      serialSourceId,
      bulkSourceId
    });
  } finally {
    await disposeBomTestAdapter(adapter);
  }
};

const node = (fixture: InstanceFixture, patch: Partial<BomInstanceNode> = {}): BomInstanceNode =>
  Object.assign(
    new BomInstanceNode(),
    {
      itemRevisionId: fixture.serialRevisionId,
      parentInstanceId: null,
      sourceOccurrenceId: fixture.serialSourceId,
      serialNumber: null,
      lotCode: null,
      installedAt: INSTALLED,
      removedAt: null
    },
    patch
  );

const root = async (fixture: InstanceFixture, serialNumber = 'SN-001'): Promise<BomInstanceNode> => {
  const instance = node(fixture, {
    itemRevisionId: fixture.rootRevisionId,
    sourceOccurrenceId: null,
    serialNumber
  });
  await instance.save();
  return instance;
};

const child = async (
  fixture: InstanceFixture,
  parent: BomInstanceNode,
  patch: Partial<BomInstanceNode> = {}
): Promise<BomInstanceNode> => {
  const instance = node(fixture, {
    parentInstanceId: parent.id,
    serialNumber: `PART-${crypto.randomUUID()}`,
    ...patch
  });
  await instance.save();
  return instance;
};

const table = (fixture: InstanceFixture): string =>
  fixture.backend === 'pglite' ? '"bom"."bom_instance_node"' : '"bom$bom_instance_node"';

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`实例 BOM [${backend}]`, () => {
    it('AC#1/#12：序列号要求取自实际物料，根来源可空，批次件可不带序列号', async () => {
      await withFixture(backend, async fixture => {
        const device = await root(fixture);
        await expect(node(fixture, { parentInstanceId: device.id }).save()).rejects.toBeInstanceOf(BomInstanceError);
        await expect(node(fixture, { parentInstanceId: device.id, serialNumber: '   ' }).save()).rejects.toThrow(
          /SERIAL-PART.*序列|序列.*SERIAL-PART/
        );
        const actualBulk = await child(fixture, device, {
          itemRevisionId: fixture.bulkRevisionId,
          serialNumber: null,
          lotCode: 'BATCH-01'
        });
        const tree = await fixture.adapter.rxdb.bom.expandInstance(device.id);
        expect(tree.nodes.map(value => value.id)).toEqual([device.id, actualBulk.id]);
        expect(tree.nodes[1]).toMatchObject({
          itemRevisionId: fixture.bulkRevisionId,
          itemNo: 'BULK-PART',
          revisionNo: 'A',
          serialNumber: null,
          lotCode: 'BATCH-01',
          sourceOccurrenceId: fixture.serialSourceId,
          parentInstanceId: device.id,
          installedAt: INSTALLED,
          removedAt: null,
          depth: 1,
          path: [device.id, actualBulk.id]
        });
      });
    });

    it('AC#12：直连 INSERT 同样拒绝缺失序列号，错误包含实际物料', async () => {
      await withFixture(backend, async fixture => {
        await expect(
          fixture.adapter.rawQuery(
            `INSERT INTO ${table(fixture)} ("id", "itemRevisionId", "installedAt", "createdAt", "updatedAt") VALUES ('${crypto.randomUUID()}', '${fixture.serialRevisionId}', '${INSTALLED.toISOString()}', '${INSTALLED.toISOString()}', '${INSTALLED.toISOString()}')`
          )
        ).rejects.toThrow(/rxdb:bom_instance:.*SERIAL-PART/);
      });
    });

    it('根可无来源；子节点来源必填；拆卸必须晚于安装，三条外键有效', async () => {
      await withFixture(backend, async fixture => {
        const device = await root(fixture);
        await expect(
          node(fixture, { parentInstanceId: device.id, sourceOccurrenceId: null, serialNumber: 'NO-SOURCE' }).save()
        ).rejects.toThrow();
        await expect(node(fixture, { serialNumber: 'EMPTY-RANGE', removedAt: INSTALLED }).save()).rejects.toThrow();
        await expect(
          node(fixture, { serialNumber: 'REVERSED-RANGE', removedAt: new Date(INSTALLED.getTime() - 1) }).save()
        ).rejects.toThrow();
        await expect(
          node(fixture, { serialNumber: 'BAD-REVISION', itemRevisionId: crypto.randomUUID() }).save()
        ).rejects.toThrow();
        await expect(
          node(fixture, { serialNumber: 'BAD-PARENT', parentInstanceId: crypto.randomUUID() }).save()
        ).rejects.toThrow();
        await expect(
          node(fixture, { serialNumber: 'BAD-SOURCE', sourceOccurrenceId: crypto.randomUUID() }).save()
        ).rejects.toThrow();
      });
    });

    it('AC#2/#6：来源浮动到 E 版后，实际装机仍为 D 版且查询结果逐字不变', async () => {
      await withFixture(backend, async fixture => {
        const device = await root(fixture);
        const part = await child(fixture, device, { serialNumber: 'ACTUAL-D' });
        const before = await fixture.adapter.rxdb.bom.expandInstance(device.id);
        const nextRevisionId = crypto.randomUUID();
        await loadHistory(fixture.adapter, {
          batchNo: 'new-master-revision',
          revisions: [
            {
              id: nextRevisionId,
              itemId: fixture.serialItem.id,
              revisionNo: 'E',
              effectiveFrom: new Date('2026-02-01T00:00:00.000Z')
            }
          ],
          headers: []
        });
        const planned = await resolveBom(
          fixture.adapter,
          {
            bomType: 'ebom',
            orgId: 'instance-org',
            asOfDate: new Date('2026-03-01T00:00:00.000Z')
          },
          { parentItemId: fixture.rootItem.id }
        );
        expect(
          planned.occurrences.find(value => value.occurrenceId === fixture.serialSourceId)?.resolvedChildRevisionId
        ).toBe(nextRevisionId);
        const after = await fixture.adapter.rxdb.bom.expandInstance(device.id);
        expect(after).toEqual(before);
        expect(after.nodes.find(value => value.id === part.id)).toMatchObject({
          itemRevisionId: fixture.serialRevisionId,
          revisionNo: 'D'
        });
      });
    });

    it('AC#3/#4：换件保留历史，毫秒边界按半开区间查询并追溯到整机', async () => {
      await withFixture(backend, async fixture => {
        const device = await root(fixture);
        const oldPart = await child(fixture, device, { serialNumber: 'OLD-PART', lotCode: 'OLD-LOT' });
        oldPart.removedAt = CHANGED;
        await oldPart.save();
        const newPart = await child(fixture, device, {
          serialNumber: 'NEW-PART',
          lotCode: 'NEW-LOT',
          installedAt: CHANGED
        });
        const before = await fixture.adapter.rxdb.bom.expandInstance(device.id, {
          asOfDate: new Date(CHANGED.getTime() - 1)
        });
        const after = await fixture.adapter.rxdb.bom.expandInstance(device.id, { asOfDate: CHANGED });
        const history = await fixture.adapter.rxdb.bom.expandInstance(device.id);
        expect(before.nodes.map(value => value.id)).toEqual([device.id, oldPart.id]);
        expect(after.nodes.map(value => value.id)).toEqual([device.id, newPart.id]);
        expect(history.nodes.map(value => value.id)).toEqual([device.id, oldPart.id, newPart.id]);
        expect(history).toEqual(await fixture.adapter.rxdb.bom.expandInstance(device.id));
        const trace = await fixture.adapter.rxdb.bom.whereUsedInstance({ serialNumber: 'OLD-PART' });
        expect(trace.matches).toHaveLength(1);
        expect(trace.matches[0].root.id).toBe(device.id);
        expect(trace.matches[0].path.map(value => value.id)).toEqual([device.id, oldPart.id]);
        expect(trace.matches[0].node.removedAt).toEqual(CHANGED);
        expect(
          (await fixture.adapter.rxdb.bom.whereUsedInstance({ lotCode: 'OLD-LOT' }, { asOfDate: CHANGED })).matches
        ).toEqual([]);
      });
    });

    it('AC#3：同批次可安装在多台设备，复合目标为 AND，带引号的序列号可精确反查', async () => {
      await withFixture(backend, async fixture => {
        const first = await root(fixture);
        const second = await root(fixture, "SN-'002");
        await child(fixture, first, {
          itemRevisionId: fixture.bulkRevisionId,
          serialNumber: null,
          lotCode: 'SHARED-LOT'
        });
        await child(fixture, second, {
          itemRevisionId: fixture.bulkRevisionId,
          serialNumber: null,
          lotCode: 'SHARED-LOT'
        });
        const result = await fixture.adapter.rxdb.bom.whereUsedInstance({
          lotCode: 'SHARED-LOT',
          itemRevisionId: fixture.bulkRevisionId
        });
        expect(result.matches.map(value => value.root.id).sort()).toEqual([first.id, second.id].sort());
        expect(
          (
            await fixture.adapter.rxdb.bom.whereUsedInstance({
              lotCode: 'SHARED-LOT',
              itemRevisionId: fixture.serialRevisionId
            })
          ).matches
        ).toEqual([]);
        const quoted = await fixture.adapter.rxdb.bom.whereUsedInstance({ serialNumber: "SN-'002" });
        expect(quoted.matches[0].node.id).toBe(second.id);
        expect(quoted.matches[0].path.map(value => value.id)).toEqual([second.id]);
      });
    });

    it('AC#8/#11/#13：同父与异父重叠均拒绝，区间相邻接受', async () => {
      await withFixture(backend, async fixture => {
        const first = await root(fixture);
        const second = await root(fixture, 'SN-002');
        await child(fixture, first, { serialNumber: 'S', removedAt: CHANGED });
        const overlap = new Date('2026-01-15T08:00:00.000Z');
        const conflict = node(fixture, { parentInstanceId: first.id, serialNumber: 'S', installedAt: overlap });
        const error = await conflict.save().then(
          () => undefined,
          (cause: unknown) => cause
        );
        expect(error).toBeInstanceOf(RxDBExclusionViolationError);
        expect((error as Error).message).toContain('2026-01-10');
        expect((error as Error).message).toContain('2026-01-15');
        await expect(
          node(fixture, {
            parentInstanceId: second.id,
            itemRevisionId: fixture.bulkRevisionId,
            serialNumber: 'S',
            installedAt: overlap
          }).save()
        ).rejects.toBeInstanceOf(RxDBExclusionViolationError);
        await child(fixture, second, { serialNumber: 'S', installedAt: CHANGED });
        const atBoundary = await fixture.adapter.rxdb.bom.whereUsedInstance(
          { serialNumber: 'S' },
          { asOfDate: CHANGED }
        );
        expect(atBoundary.matches).toHaveLength(1);
        expect(atBoundary.matches[0].root.id).toBe(second.id);
      });
    });

    it('AC#10：父节点与其余安装事实不可改写，截止后以新记录换父', async () => {
      await withFixture(backend, async fixture => {
        const first = await root(fixture);
        const second = await root(fixture, 'SN-002');
        const part = await child(fixture, first, { serialNumber: 'REINSTALL', lotCode: 'FACT-LOT' });
        const original = await fixture.adapter.rxdb.bom.expandInstance(first.id);
        part.parentInstanceId = second.id;
        await expect(part.save()).rejects.toBeInstanceOf(BomInstanceError);
        const patches = [
          `"parentInstanceId" = '${second.id}'`,
          `"itemRevisionId" = '${fixture.bulkRevisionId}'`,
          `"sourceOccurrenceId" = '${fixture.bulkSourceId}'`,
          `"serialNumber" = 'REWRITTEN'`,
          `"lotCode" = 'REWRITTEN'`,
          `"installedAt" = '2026-01-11T08:00:00.000Z'`
        ];
        for (const patch of patches) {
          await expect(
            fixture.adapter.rawQuery(`UPDATE ${table(fixture)} SET ${patch} WHERE "id" = '${part.id}'`)
          ).rejects.toThrow(/rxdb:bom_instance:/);
        }
        expect(await fixture.adapter.rxdb.bom.expandInstance(first.id)).toEqual(original);
        part.parentInstanceId = first.id;
        part.removedAt = CHANGED;
        await part.save();
        await child(fixture, second, { serialNumber: 'REINSTALL', installedAt: CHANGED });
        expect((await fixture.adapter.rxdb.bom.whereUsedInstance({ serialNumber: 'REINSTALL' })).matches).toHaveLength(
          2
        );
      });
    });

    it('AC#9：自父与后代父写入被拒，实例环不走主数据 unionOnly 错误路径', async () => {
      await withFixture(backend, async fixture => {
        const device = await root(fixture);
        const part = await child(fixture, device);
        const descendant = await child(fixture, part);
        const error = await fixture.adapter
          .rawQuery(
            `UPDATE ${table(fixture)} SET "parentInstanceId" = '${descendant.id}', "sourceOccurrenceId" = '${fixture.serialSourceId}' WHERE "id" = '${device.id}'`
          )
          .then(
            () => undefined,
            (cause: unknown) => cause
          );
        expect(error).toBeDefined();
        expect(error).not.toBeInstanceOf(BomCycleError);
        expect((error as Error).message).toContain('rxdb:bom_instance:');
        const id = crypto.randomUUID();
        await expect(
          fixture.adapter.rawQuery(
            `INSERT INTO ${table(fixture)} ("id", "itemRevisionId", "parentInstanceId", "sourceOccurrenceId", "serialNumber", "installedAt", "createdAt", "updatedAt") VALUES ('${id}', '${fixture.serialRevisionId}', '${id}', '${fixture.serialSourceId}', 'SELF', '${INSTALLED.toISOString()}', '${INSTALLED.toISOString()}', '${INSTALLED.toISOString()}')`
          )
        ).rejects.toThrow(/rxdb:bom_instance:/);
        const firstId = crypto.randomUUID();
        const secondId = crypto.randomUUID();
        await expect(
          fixture.adapter.rawQuery(
            `INSERT INTO ${table(fixture)} ("id", "itemRevisionId", "parentInstanceId", "sourceOccurrenceId", "serialNumber", "installedAt", "createdAt", "updatedAt") VALUES
          ('${firstId}', '${fixture.serialRevisionId}', '${secondId}', '${fixture.serialSourceId}', 'CYCLE-A', '${INSTALLED.toISOString()}', '${INSTALLED.toISOString()}', '${INSTALLED.toISOString()}'),
          ('${secondId}', '${fixture.serialRevisionId}', '${firstId}', '${fixture.serialSourceId}', 'CYCLE-B', '${INSTALLED.toISOString()}', '${INSTALLED.toISOString()}', '${INSTALLED.toISOString()}')`
          )
        ).rejects.toThrow(/rxdb:bom_instance:/);
        expect((await fixture.adapter.rxdb.bom.expandInstance(device.id)).nodes).toHaveLength(3);
      });
    });

    it('点时反查要求整条路径有效；无时点保留已拆卸祖先下的历史', async () => {
      await withFixture(backend, async fixture => {
        const device = await root(fixture);
        await child(fixture, device, { serialNumber: 'HISTORICAL-PATH' });
        device.removedAt = CHANGED;
        await device.save();
        expect((await fixture.adapter.rxdb.bom.expandInstance(device.id, { asOfDate: CHANGED })).nodes).toEqual([]);
        expect(
          (await fixture.adapter.rxdb.bom.whereUsedInstance({ serialNumber: 'HISTORICAL-PATH' }, { asOfDate: CHANGED }))
            .matches
        ).toEqual([]);
        expect(
          (await fixture.adapter.rxdb.bom.whereUsedInstance({ serialNumber: 'HISTORICAL-PATH' })).matches[0].root.id
        ).toBe(device.id);
      });
    });

    it('深度与节点预算显式截断，精确容纳整树时不误标', async () => {
      await withFixture(backend, async fixture => {
        const device = await root(fixture);
        const part = await child(fixture, device);
        await child(fixture, part, { serialNumber: 'DEEPEST' });
        const rootOnly = await fixture.adapter.rxdb.bom.expandInstance(device.id, { maxDepth: 0 });
        expect(rootOnly.nodes.map(value => value.id)).toEqual([device.id]);
        expect(rootOnly.truncated).toBe(true);
        const oneNode = await fixture.adapter.rxdb.bom.expandInstance(device.id, { maxNodes: 1 });
        expect(oneNode.nodes).toHaveLength(1);
        expect(oneNode.truncated).toBe(true);
        const exact = await fixture.adapter.rxdb.bom.expandInstance(device.id, { maxDepth: 2, maxNodes: 3 });
        expect(exact.nodes).toHaveLength(3);
        expect(exact.truncated).toBe(false);
        const trace = await fixture.adapter.rxdb.bom.whereUsedInstance({ serialNumber: 'DEEPEST' }, { maxDepth: 0 });
        expect(trace.matches).toEqual([]);
        expect(trace.truncated).toBe(true);
      });
    });

    it('缺失根与无匹配目标返回空，非法目标、时点及预算明确报错', async () => {
      await withFixture(backend, async fixture => {
        const id = crypto.randomUUID();
        expect(await fixture.adapter.rxdb.bom.expandInstance(id)).toEqual({ rootId: id, nodes: [], truncated: false });
        expect(await fixture.adapter.rxdb.bom.whereUsedInstance({ serialNumber: 'MISSING' })).toEqual({
          matches: [],
          truncated: false
        });
        await expect(fixture.adapter.rxdb.bom.whereUsedInstance({})).rejects.toBeInstanceOf(BomInstanceError);
        await expect(fixture.adapter.rxdb.bom.whereUsedInstance({ lotCode: '   ' })).rejects.toBeInstanceOf(
          BomInstanceError
        );
        for (const options of [
          { maxDepth: -1 },
          { maxDepth: 0.5 },
          { maxNodes: 0 },
          { maxNodes: 1.5 },
          { asOfDate: new Date('invalid') }
        ]) {
          await expect(fixture.adapter.rxdb.bom.expandInstance(id, options)).rejects.toBeInstanceOf(BomInstanceError);
          await expect(
            fixture.adapter.rxdb.bom.whereUsedInstance({ serialNumber: 'MISSING' }, options)
          ).rejects.toBeInstanceOf(BomInstanceError);
        }
      });
    });
  });
}
