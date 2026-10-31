/**
 * @fileoverview 公式行的用量在下钻与反查两侧同口径（评审 P2-9）
 *
 * 双后端同断言：`ExpansionNode.qty` 的契约是「根节点与公式行为 null」——公式行（qty 列为 NULL、
 * 用量由 qtyFormula 求值）经 where-used 反查到的使用方节点同样是 null，不是字符串 "null"。
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomItem } from '../entities.js';
import { expandBom, whereUsed } from '../resolve/expansion.js';
import {
  buildQuantityFixture,
  createBomTestAdapter,
  disposeBomTestAdapter,
  type BomTestAdapter,
  type BomTestBackend
} from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const context = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: new Date('2026-06-01T00:00:00.000Z') };

for (const backend of BACKENDS) {
  describe(`公式行用量 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    const makeItem = async (itemNo: string): Promise<BomItem> => {
      const item = new BomItem();
      item.itemNo = `${itemNo}-${Math.random().toString(36).slice(2, 8)}`;
      await item.save();
      return item;
    };

    it('where-used 的公式行用量为 null（与下钻同口径），普通行照常给规范十进制串', async () => {
      const parent = await makeItem('wu-parent');
      const formulaChild = await makeItem('wu-formula');
      const plainChild = await makeItem('wu-plain');
      await buildQuantityFixture(adapter, [
        {
          item: parent,
          occurrences: [
            { child: formulaChild, qtyFormula: '2 * 3' },
            { child: plainChild, qty: '2' }
          ]
        }
      ]);

      const formulaUsage = await whereUsed(adapter, context, { childItemId: formulaChild.id });
      expect(formulaUsage.nodes.map(node => [node.itemId, node.qty])).toEqual([[parent.id, null]]);
      const plainUsage = await whereUsed(adapter, context, { childItemId: plainChild.id });
      expect(plainUsage.nodes.map(node => [node.itemId, node.qty])).toEqual([[parent.id, '2']]);

      const expanded = await expandBom(adapter, context, { parentItemId: parent.id });
      const qtyOf = new Map(expanded.nodes.map(node => [node.itemId, node.qty]));
      expect(qtyOf.get(formulaChild.id)).toBeNull();
      expect(qtyOf.get(plainChild.id)).toBe('2');
    });
  });
}
