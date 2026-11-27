import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BomConfigChar, BomConfigCharValue, BomConfigCondition, BomItem } from '../entities.js';
import { expandBom, whereUsed } from '../resolve/expansion.js';
import { loadHistory, type HistoryHeaderInput } from '../resolve/history-loader.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter } from './test-utils.js';

const january = new Date('2026-01-01T00:00:00Z');
const february = new Date('2026-02-01T00:00:00Z');
const context = { bomType: 'ebom' as const, orgId: 'usage-revisions', asOfDate: new Date('2026-06-01T00:00:00Z') };

const seed = async (
  adapter: BomTestAdapter,
  options: { bothUseC?: boolean; ambiguous?: 'old' | 'new'; oldConditionId?: string } = {}
) => {
  const entries = await Promise.all(
    ['oldRoot', 'newRoot', 'liveRoot', 'upper', 'b', 'c', 'd'].map(async name => {
      const item = adapter.rxdb.entityManager.instantiate(BomItem, { itemNo: crypto.randomUUID() });
      await item.save();
      return [name, item.id] as const;
    })
  );
  const items = Object.fromEntries(entries);
  const itemIds = [items.oldRoot, items.newRoot, items.liveRoot, items.upper, items.b, items.b, items.c, items.d];
  const revisions = itemIds.map(() => crypto.randomUUID());
  const parent = (revisionIndex: number, childItemId: string, childRevisionId: string | null): HistoryHeaderInput => ({
    revisionIndex,
    bomType: context.bomType,
    orgId: context.orgId,
    lines: [{ lineNo: 10, occurrences: [{ childItemId, childRevisionId, qty: '1', effectiveFrom: january }] }]
  });
  const old = parent(0, items.b, revisions[4]);
  old.lines[0].occurrences[0].selectionConditionId = options.oldConditionId;
  const newer = parent(1, items.b, revisions[5]);
  const ambiguous = options.ambiguous === 'old' ? old : newer;
  if (options.ambiguous !== undefined) {
    ambiguous.lines[0].occurrences[0].unitFrom = 1;
    ambiguous.lines[0].occurrences[0].unitTo = 100;
    ambiguous.lines[0].occurrences.push({
      childItemId: items.d,
      qty: '1',
      effectiveFrom: january,
      unitFrom: 101,
      unitTo: 200
    });
  }
  const bNew = parent(5, items.c, null);
  bNew.lines[0].occurrences[0].effectiveFrom = february;
  await loadHistory(adapter, {
    batchNo: crypto.randomUUID(),
    revisions: itemIds.map((itemId, index) => ({
      id: revisions[index],
      itemId,
      revisionNo: index === 5 ? 'B' : 'A',
      effectiveFrom: index === 5 ? february : january
    })),
    headers: [
      old,
      newer,
      parent(2, items.b, null),
      parent(3, items.oldRoot, revisions[0]),
      parent(4, options.bothUseC ? items.c : items.d, null),
      bNew
    ]
  });
  return { items, revisions };
};

const sortedIds = (values: readonly { itemId: string }[]) => values.map(value => value.itemId).sort();

describe.each(['wa-sqlite', 'pglite'] as const)('反查修订路径回归 [%s]', backend => {
  let adapter: BomTestAdapter;
  beforeAll(async () => {
    adapter = await createBomTestAdapter(backend);
  });
  afterAll(async () => {
    await disposeBomTestAdapter(adapter);
  });

  it('旧修订不使用C，锁旧版整机与它的上层整机都不能进入C的反查结果', async () => {
    const { items } = await seed(adapter);
    const expanded = await expandBom(adapter, context, { parentItemId: items.oldRoot });
    expect(expanded.nodes.some(node => node.itemId === items.c)).toBe(false);
    const result = await whereUsed(adapter, context, { childItemId: items.c });
    expect(sortedIds(result.nodes)).toEqual([items.b, items.newRoot, items.liveRoot].sort());
    expect(result.nodes.filter(node => node.depth === 2).every(node => node.path.length === 2)).toBe(true);
  });

  it('锁旧版的合法路径仍可上溯，imprecise已解析为新版时不能接到旧版', async () => {
    const { items } = await seed(adapter);
    const result = await whereUsed(adapter, context, { childItemId: items.d });
    expect(sortedIds(result.nodes)).toEqual([items.b, items.oldRoot, items.upper].sort());
    expect(result.nodes.find(node => node.itemId === items.upper)?.path).toHaveLength(3);
  });

  it('imprecise在新修订生效前解析为旧版，生效后解析为新版', async () => {
    const { items } = await seed(adapter);
    const earlier = await whereUsed(adapter, { ...context, asOfDate: january }, { childItemId: items.d });
    const later = await whereUsed(adapter, context, { childItemId: items.d });
    expect(earlier.nodes.some(node => node.itemId === items.liveRoot)).toBe(true);
    expect(later.nodes.some(node => node.itemId === items.liveRoot)).toBe(false);
  });

  it('两个修订都使用C时按各自修订连接，整机不会因交叉拼接重复返回', async () => {
    const { items, revisions } = await seed(adapter, { bothUseC: true });
    const result = await whereUsed(adapter, context, { childItemId: items.c });
    expect(
      result.nodes
        .filter(node => node.itemId === items.b)
        .map(node => node.revisionId)
        .sort()
    ).toEqual([revisions[4], revisions[5]].sort());
    expect(sortedIds(result.nodes)).toEqual(
      [items.b, items.b, items.oldRoot, items.newRoot, items.liveRoot, items.upper].sort()
    );
  });

  it('直接按B物料反查仍包含锁旧版、锁新版和imprecise的所有使用方', async () => {
    const { items } = await seed(adapter);
    const result = await whereUsed(adapter, context, { childItemId: items.b });
    expect(sortedIds(result.nodes)).toEqual([items.oldRoot, items.newRoot, items.liveRoot, items.upper].sort());
  });

  it('被修订匹配排除的祖先不占路径预算', async () => {
    const { items } = await seed(adapter);
    const result = await whereUsed(adapter, context, { childItemId: items.c }, { budgets: { paths: 3 } });
    expect(result.nodes).toHaveLength(3);
    expect(result.truncated).toBeNull();
  });

  it('只包含旧修订的歧义逻辑行不污染新版路径的未裁决结果', async () => {
    const { items } = await seed(adapter, { ambiguous: 'old' });
    const result = await whereUsed(adapter, context, { childItemId: items.c });
    expect(sortedIds(result.nodes)).toEqual([items.b, items.newRoot, items.liveRoot].sort());
    expect(result.unresolved).toBeUndefined();
  });

  it('无关旧修订路径的必填配置不能阻断新版反查', async () => {
    const feature = adapter.rxdb.entityManager.instantiate(BomConfigChar, {
      orgId: context.orgId,
      code: `C${crypto.randomUUID().replaceAll('-', '')}`,
      required: true
    });
    await feature.save();
    await adapter.rxdb.entityManager.instantiate(BomConfigCharValue, { charId: feature.id, value: 'red' }).save();
    const condition = adapter.rxdb.entityManager.instantiate(BomConfigCondition, {
      orgId: context.orgId,
      grammarVersion: '1',
      expression: `${feature.code} = red`
    });
    await condition.save();
    const { items } = await seed(adapter, { oldConditionId: condition.id });
    const result = await whereUsed(adapter, context, { childItemId: items.c });
    expect(sortedIds(result.nodes)).toEqual([items.b, items.newRoot, items.liveRoot].sort());
    expect(result.unresolved).toBeUndefined();
  });

  it('包含匹配修订的歧义逻辑行仍报告未裁决，给定序列后恢复路径', async () => {
    const { items } = await seed(adapter, { ambiguous: 'new' });
    const unresolved = await whereUsed(adapter, context, { childItemId: items.c });
    expect(unresolved.unresolved).toHaveLength(1);
    const resolved = await whereUsed(adapter, { ...context, unit: 50 }, { childItemId: items.c });
    expect(sortedIds(resolved.nodes)).toEqual([items.b, items.newRoot, items.liveRoot].sort());
    expect(resolved.unresolved).toBeUndefined();
  });
});
