/**
 * @fileoverview US-513 阶段B：真实 SQLite/PGlite 的 C01～C14 失败回归。
 *
 * 运行前置是头/发生项的可空 jointCostShare 与 produce 枚举已加入实体声明。
 * 缺少 schema 前置导致的建库或保存错误不算联产业务功能红。
 */
import type { EntityType, TransactionExecutor, TransactionFun, UUID } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  readJointProduction,
  type JointCostRollupContext,
  type JointCostRollupResult,
  type JointProduction
} from '../coproduct.js';
import { BomEcn, BomHeader, BomItem, BomItemRevision, BomLine, BomLineOccurrence } from '../entities.js';
import { rollupCost as rollupCostApi } from '../quantity/cost-api.js';
import { rollupCost } from '../quantity/cost.js';
import { explodeBom } from '../quantity/explosion.js';
import { allocateJointCost } from '../quantity/joint-cost.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import { loadHistory } from '../resolve/history-loader.js';
import type { BomQueryExecutor } from '../resolve/resolver.js';
import { deterministicId } from '../testing/scooter-dataset.js';
import { BomPublishValidationError, BomWriteProtocolError } from '../types.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const day = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const context: JointCostRollupContext = {
  bomType: 'ebom',
  orgId: 'joint-org',
  asOfDate: day('2099-01-01'),
  currency: 'CNY',
  rateDate: day('2099-01-01')
};
const id = (seed: string, key: string): UUID => deterministicId(`joint-cost:${seed}:${key}`);

type JointHeader = BomHeader & { jointCostShare: string | null };
type JointOccurrence = Omit<BomLineOccurrence, 'flowDirection'> & {
  flowDirection: 'consume' | 'by_product' | 'scrap_out' | 'produce';
  jointCostShare: string | null;
};
interface ItemRevision {
  item: BomItem;
  revisionId: UUID;
}
interface JointFixture {
  seed: string;
  primary: ItemRevision;
  secondary: ItemRevision;
  raw: ItemRevision;
  header: JointHeader;
  output: JointOccurrence;
}

const entity = <T extends EntityType>(adapter: BomTestAdapter, type: T, values: Partial<InstanceType<T>> = {}) =>
  adapter.rxdb.entityManager.instantiate(type, values);

const makeItem = async (
  adapter: BomTestAdapter,
  seed: string,
  key: string,
  values: Partial<BomItem> = {}
): Promise<ItemRevision> => {
  const item = entity(adapter, BomItem, {
    id: id(seed, `item:${key}`),
    itemNo: `JOINT-${seed}-${key}`,
    stockUom: 'kg',
    uomDecimals: 9,
    unitPrice: null,
    priceUom: 'kg',
    priceCurrency: 'CNY',
    ...values
  });
  await item.save();
  const revisionId = id(seed, `revision:${key}`);
  await loadHistory(adapter, {
    batchNo: `joint-revision-${seed}-${key}`,
    revisions: [{ id: revisionId, itemId: item.id, revisionNo: 'A', effectiveFrom: day('2026-01-01') }],
    headers: []
  });
  return { item, revisionId };
};

const addLine = async (
  adapter: BomTestAdapter,
  header: BomHeader,
  child: ItemRevision,
  seed: string,
  lineNo: number,
  fields: Partial<Omit<JointOccurrence, 'save'>> = {}
): Promise<JointOccurrence> => {
  const line = entity(adapter, BomLine, { id: id(seed, `line:${lineNo}`), headerId: header.id, lineNo });
  await line.save();
  const occurrence = entity(adapter, BomLineOccurrence, {
    id: id(seed, `occurrence:${lineNo}`),
    lineId: line.id,
    childItemId: child.item.id,
    childRevisionId: child.revisionId,
    qty: '1',
    uom: 'kg',
    effectiveFrom: day('2026-01-01')
  });
  Object.assign(occurrence, { jointCostShare: null, ...fields });
  await occurrence.save();
  return occurrence as unknown as JointOccurrence;
};

const release = async (header: BomHeader): Promise<void> => {
  header.state = 'released';
  await header.save();
};

const makeFixture = async (
  adapter: BomTestAdapter,
  options: {
    seed?: string;
    released?: boolean;
    primaryShare?: string | null;
    outputShare?: string;
    rawPrice?: string;
    rawQty?: string;
    assemblyScrap?: string;
    secondary?: ItemRevision;
    joint?: boolean;
    orgId?: string;
  } = {}
): Promise<JointFixture> => {
  const seed = options.seed ?? crypto.randomUUID();
  const primary = await makeItem(adapter, seed, 'primary');
  const secondary = options.secondary ?? (await makeItem(adapter, seed, 'secondary'));
  const raw = await makeItem(adapter, seed, 'raw', { unitPrice: options.rawPrice ?? '2' });
  const header = Object.assign(
    entity(adapter, BomHeader, {
      id: id(seed, 'header'),
      parentRevisionId: primary.revisionId,
      bomType: 'ebom',
      orgId: options.orgId ?? 'joint-org',
      baseUom: 'kg',
      baseQty: '100',
      costLotQty: '100',
      assemblyScrap: options.assemblyScrap ?? '0'
    }),
    {
      jointCostShare:
        options.joint === false ? null
        : options.primaryShare === undefined ? '0.6'
        : options.primaryShare
    }
  );
  await header.save();
  await addLine(adapter, header, raw, seed, 10, { qty: options.rawQty ?? '110' });
  const output =
    options.joint === false ?
      await addLine(adapter, header, raw, seed, 20, { qty: '0', flowDirection: 'consume' })
    : await addLine(adapter, header, secondary, seed, 20, {
        qty: '50',
        flowDirection: 'produce',
        jointCostShare: options.outputShare ?? '0.4'
      });
  if (options.released !== false) await release(header);
  return { seed, primary, secondary, raw, header, output };
};

const cost = (
  adapter: BomTestAdapter,
  fixture: JointFixture,
  overrides: Partial<JointCostRollupContext> = {},
  qty?: string
) =>
  rollupCost(
    adapter,
    { ...context, ...overrides },
    { parentRevisionId: fixture.primary.revisionId },
    qty === undefined ? undefined : { value: qty, uom: 'kg' }
  ) as Promise<JointCostRollupResult>;

const production = (adapter: BomTestAdapter, fixture: JointFixture): Promise<JointProduction | null> =>
  adapter.transaction(async executor =>
    readJointProduction(
      (executor as unknown as BomQueryExecutor).query.bind(executor),
      bomSqlDialectFor(adapter.name),
      {
        context,
        headerId: fixture.header.id,
        plannedQty: { value: '100', uom: 'kg' }
      }
    )
  );

const downstream = async (
  adapter: BomTestAdapter,
  producer: JointFixture,
  options: {
    includePrimary?: boolean;
    qty?: string;
    uom?: string;
    imprecise?: boolean;
  } = {}
): Promise<JointFixture> => {
  const fixture = await makeFixture(adapter, { joint: false, released: false });
  fixture.header.baseQty = '1';
  fixture.header.costLotQty = '1';
  await fixture.header.save();
  const table = bomSqlDialectFor(adapter.name).table('bom_line_occurrence');
  await adapter.rawQuery(
    `DELETE FROM ${table} WHERE "lineId" IN (SELECT "id" FROM ${bomSqlDialectFor(adapter.name).table('bom_line')} WHERE "headerId" = '${fixture.header.id}')`
  );
  await addLine(adapter, fixture.header, producer.secondary, fixture.seed, 30, {
    qty: options.qty ?? '10',
    uom: options.uom ?? 'kg',
    childRevisionId: options.imprecise ? null : producer.secondary.revisionId
  });
  if (options.includePrimary) await addLine(adapter, fixture.header, producer.primary, fixture.seed, 40, { qty: '10' });
  await release(fixture.header);
  return fixture;
};

const replaceOutput = async (
  adapter: BomTestAdapter,
  fixture: JointFixture,
  share: string,
  qty = '40'
): Promise<BomEcn> => {
  const ecn = entity(adapter, BomEcn, { ecnNo: `JOINT-${crypto.randomUUID()}`, effectiveDate: day('2099-01-02') });
  await ecn.save();
  fixture.output.ecnOutId = ecn.id;
  fixture.output.effectiveTo = ecn.effectiveDate;
  await fixture.output.save();
  const replacement = entity(adapter, BomLineOccurrence, {
    lineId: fixture.output.lineId,
    childItemId: fixture.secondary.item.id,
    childRevisionId: fixture.secondary.revisionId,
    qty,
    uom: 'kg',
    effectiveFrom: ecn.effectiveDate,
    ecnInId: ecn.id
  });
  Object.assign(replacement, { flowDirection: 'produce', jointCostShare: share });
  await replacement.save();
  return ecn;
};

for (const backend of ['wa-sqlite', 'pglite'] satisfies BomTestBackend[]) {
  describe(`联产品与联合成本 [${backend}]`, () => {
    let adapter: BomTestAdapter;
    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });
    afterAll(async () => {
      await disposeBomTestAdapter(adapter);
    });

    it('C01 两输出手工golden：净220，分配132/88，单位1.32/1.76', async () => {
      const fixture = await makeFixture(adapter);
      const result = await cost(adapter, fixture);
      expect(result.root.batchCost).toBe('132');
      expect(result.root.unitCost).toBe('1.32');
      expect(result.root.jointCost?.netCost).toBe('220');
      expect(result.root.jointCost?.outputs.map(output => [output.qty, output.batchCost, output.unitCost])).toEqual([
        ['100', '132', '1.32'],
        ['50', '88', '1.76']
      ]);
    });

    it('C02 比例批量与装配损耗：投入变121，联产品仍50而不是55', async () => {
      const scaled = await makeFixture(adapter);
      expect(
        (
          await rollupCostApi(
            adapter,
            context,
            { parentRevisionId: scaled.primary.revisionId },
            { value: '1000', uom: 'kg' }
          )
        ).root.jointCost?.outputs.map(output => [output.qty, output.batchCost])
      ).toEqual([
        ['1000', '1320'],
        ['500', '880']
      ]);
      const loss = await makeFixture(adapter, { assemblyScrap: '0.1' });
      const exploded = await explodeBom(
        adapter,
        context,
        { parentRevisionId: loss.primary.revisionId },
        { plannedQty: { value: '100', uom: 'kg' } }
      );
      expect(exploded.requirementLines.find(line => line.itemId === loss.raw.item.id)?.qty).toBe('121');
      expect(exploded.outputs.find(output => ['produce'].includes(output.direction))?.qty).toBe('50');
      expect((await cost(adapter, loss)).root.jointCost?.outputs.map(output => output.batchCost)).toEqual([
        '145.2',
        '96.8'
      ]);
    });

    it('C03 份额域即时拒绝：仓储和直连SQL不接受负值、超1或超9位小数', async () => {
      const fixture = await makeFixture(adapter, { released: false });
      for (const share of ['-0.1', '1.1', '0.1234567891']) {
        fixture.output.jointCostShare = share;
        await expect(fixture.output.save()).rejects.toThrow(/jointCostShare|份额/);
        const dialect = bomSqlDialectFor(adapter.name);
        await expect(
          adapter.rawQuery(
            `UPDATE ${dialect.table('bom_line_occurrence')} SET "jointCostShare" = ${dialect.placeholder(0)} WHERE "id" = ${dialect.placeholder(1)}`,
            [share, fixture.output.id]
          )
        ).rejects.toThrow(/jointCostShare|份额/);
      }
    });

    it('C03 仓储把等值输入规范为0.4，直连SQL拒绝0.40', async () => {
      const fixture = await makeFixture(adapter, { released: false });
      fixture.output.jointCostShare = '0.40';
      fixture.output.qty = '050.0';
      await fixture.output.save();
      expect(fixture.output.jointCostShare).toBe('0.4');
      expect(fixture.output.qty).toBe('50');
      const dialect = bomSqlDialectFor(adapter.name);
      await expect(
        adapter.rawQuery(
          `UPDATE ${dialect.table('bom_line_occurrence')} SET "jointCostShare" = '0.40' WHERE "id" = '${fixture.output.id}'`
        )
      ).rejects.toThrow(/jointCostShare|份额/);
    });

    it('C04 草稿可暂缺份额，发布精确要求1且不自动归一化', async () => {
      for (const primaryShare of ['0.5', '0.7', null]) {
        const fixture = await makeFixture(adapter, { released: false, primaryShare });
        await expect(release(fixture.header)).rejects.toBeInstanceOf(BomPublishValidationError);
      }
      const zero = await makeFixture(adapter, { primaryShare: '1', outputShare: '0' });
      expect((await cost(adapter, zero)).root.jointCost?.outputs.map(output => output.batchCost)).toEqual(['220', '0']);
    });

    it('C05 禁止的produce字段即时拒绝；同快照读取精确发布输出身份', async () => {
      for (const fields of [
        { qty: '0' },
        { childRevisionId: null },
        { isFixedQty: true },
        { componentScrap: '0.1' },
        { unitFrom: 1 },
        { unitTo: 5 },
        { lotCodes: '["L1"]' }
      ]) {
        const fixture = await makeFixture(adapter, { released: false });
        Object.assign(fixture.output, fields);
        await expect(fixture.output.save()).rejects.toThrow(/produce|联产|输出/);
      }
      // 选择条件同样不许挂在 produce 行上（仓储先校验条件存在，这里直连 SQL 直达存储层守卫）：
      // 序列 / 批次 / 配置三维门控因此对 produce 行恒为空，联产读取不需要再过一遍三维过滤
      const gated = await makeFixture(adapter, { released: false });
      const dialect = bomSqlDialectFor(adapter.name);
      await expect(
        adapter.rawQuery(
          `UPDATE ${dialect.table('bom_line_occurrence')} SET "selectionConditionId" = ${dialect.placeholder(0)} WHERE "id" = ${dialect.placeholder(1)}`,
          [crypto.randomUUID(), gated.output.id]
        )
      ).rejects.toThrow(/selectionConditionId:produce/);
      const valid = await makeFixture(adapter);
      expect((await production(adapter, valid))?.outputs.map(output => [output.revisionId, output.share])).toEqual([
        [valid.primary.revisionId, '0.6'],
        [valid.secondary.revisionId, '0.4']
      ]);
    });

    it('C05 同切片重复输出修订发布拒绝，头父件不可再写produce', async () => {
      const duplicate = await makeFixture(adapter, { released: false, outputShare: '0.2' });
      await addLine(adapter, duplicate.header, duplicate.secondary, duplicate.seed, 30, {
        qty: '50',
        flowDirection: 'produce',
        jointCostShare: '0.2'
      });
      await expect(release(duplicate.header)).rejects.toThrow(/重复|输出/);
      const self = await makeFixture(adapter, { released: false });
      await expect(
        addLine(adapter, self.header, self.primary, self.seed, 30, {
          qty: '1',
          flowDirection: 'produce',
          jointCostShare: '0'
        })
      ).rejects.toThrow(/主产物|produce|联产/);
    });

    it('C05 输出错误单位、外物料修订、未发布与phantom修订均被真实存储拒绝', async () => {
      const fixture = await makeFixture(adapter, { released: false });
      fixture.output.uom = 's';
      await expect(fixture.output.save()).rejects.toThrow(/produce|联产|输出/);
      fixture.output.uom = 'kg';
      fixture.output.childRevisionId = fixture.raw.revisionId;
      await expect(fixture.output.save()).rejects.toThrow(/produce|联产|输出/);
      const draft = entity(adapter, BomItemRevision, {
        itemId: fixture.secondary.item.id,
        revisionNo: 'B',
        effectiveFrom: day('2099-02-01')
      });
      await draft.save();
      fixture.output.childRevisionId = draft.id;
      await expect(fixture.output.save()).rejects.toThrow(/produce|联产|输出/);
      draft.defaultPhantom = true;
      draft.state = 'released';
      await draft.save();
      await expect(fixture.output.save()).rejects.toThrow(/produce|联产|输出/);
    });

    it('C06 共同34位量子：极大金额稳定舍入，尾差保持34位且精确合计', async () => {
      const fixture = await makeFixture(adapter, {
        released: false,
        primaryShare: '0.1',
        outputShare: '0.2',
        rawQty: '1',
        rawPrice: '9999999999999999999999999999999999'
      });
      const third = await makeItem(adapter, fixture.seed, 'third');
      await addLine(adapter, fixture.header, third, fixture.seed, 30, {
        qty: '25',
        flowDirection: 'produce',
        jointCostShare: '0.7'
      });
      await release(fixture.header);
      const outputs = (await production(adapter, fixture))!.outputs;
      const allocated = allocateJointCost('9999999999999999999999999999999999', outputs);
      expect(allocated.outputs.map(output => output.batchCost)).toEqual([
        '1000000000000000000000000000000000',
        '2000000000000000000000000000000000',
        '6999999999999999999999999999999999'
      ]);
      expect(allocateJointCost(allocated.netCost, [...outputs].reverse())).toEqual(allocated);
      expect(allocated.outputs.reduce((sum, output) => sum + BigInt(output.batchCost), 0n).toString()).toBe(
        allocated.netCost
      );
    });

    it('C06 最小正份额与零净成本不会越精度或伪造缺失', async () => {
      const fixture = await makeFixture(adapter, { primaryShare: '0.999999999', outputShare: '0.000000001' });
      const outputs = (await production(adapter, fixture))!.outputs;
      expect(
        allocateJointCost('9999999999999999999999999999999999', outputs).outputs.map(output => output.batchCost)
      ).toEqual(['9999999989999999999999999999999999', '10000000000000000000000000']);
      expect(allocateJointCost('0', outputs).outputs.map(output => [output.batchCost, output.unitCost])).toEqual([
        ['0', '0'],
        ['0', '0']
      ]);
    });

    it('C06 排序末项为零份额时恒为0，尾差只交最后正份额输出', async () => {
      const fixture = await makeFixture(adapter, { released: false, primaryShare: '0.5', outputShare: '0.5' });
      const third = await makeItem(adapter, fixture.seed, 'zero-output');
      await addLine(adapter, fixture.header, third, fixture.seed, 30, {
        qty: '25',
        flowDirection: 'produce',
        jointCostShare: '0'
      });
      await release(fixture.header);
      const outputs = (await production(adapter, fixture))!.outputs;
      expect(
        allocateJointCost('9999999999999999999999999999999999', outputs).outputs.map(output => output.batchCost)
      ).toEqual(['5000000000000000000000000000000000', '4999999999999999999999999999999999', '0']);
      expect(
        allocateJointCost('-9999999999999999999999999999999999', outputs).outputs.map(output => output.batchCost)
      ).toEqual(['-5000000000000000000000000000000000', '-4999999999999999999999999999999999', '0']);
    });

    it('C07 副产先抵减再分配，废料与produce的creditPrice不抵减', async () => {
      const fixture = await makeFixture(adapter, { released: false });
      fixture.secondary.item.creditPrice = '999';
      await fixture.secondary.item.save();
      const byproduct = await makeItem(adapter, fixture.seed, 'byproduct', { creditPrice: '0.5' });
      const scrap = await makeItem(adapter, fixture.seed, 'scrap', { creditPrice: '99' });
      await addLine(adapter, fixture.header, byproduct, fixture.seed, 30, { qty: '10', flowDirection: 'by_product' });
      await addLine(adapter, fixture.header, scrap, fixture.seed, 40, { qty: '3', flowDirection: 'scrap_out' });
      await release(fixture.header);
      const result = await cost(adapter, fixture);
      expect(result.root.jointCost?.netCost).toBe('215');
      expect(result.root.jointCost?.outputs.map(output => output.batchCost)).toEqual(['129', '86']);
      expect(result.root.credits.map(credit => credit.amount)).toEqual(['5']);
    });

    it('C08 下游显式消费第二输出10kg，计价17.6而不是整批220', async () => {
      const producer = await makeFixture(adapter);
      const consumer = await downstream(adapter, producer);
      const result = await cost(adapter, consumer, {
        jointCostSources: { [producer.secondary.revisionId]: producer.header.id }
      });
      expect(result.root.material.map(line => [line.demand, line.unitCost, line.amount])).toEqual([
        ['10', '1.76', '17.6']
      ]);
      expect(result.root.batchCost).toBe('17.6');
      const grams = await downstream(adapter, producer, { qty: '10000', uom: 'g' });
      const converted = await cost(adapter, grams, {
        jointCostSources: { [producer.secondary.revisionId]: producer.header.id }
      });
      expect(converted.root.material.map(line => [line.demand, line.demandUom, line.amount])).toEqual([
        ['10', 'kg', '17.6']
      ]);
    });

    it('C09 即使单一来源也须显式选择，多来源和错组织/修订来源不偷偷回退单价', async () => {
      const first = await makeFixture(adapter);
      first.secondary.item.unitPrice = '999';
      await first.secondary.item.save();
      const consumer = await downstream(adapter, first);
      await expect(cost(adapter, consumer)).rejects.toThrow(/联产.*来源|来源.*未解析/);
      const second = await makeFixture(adapter, { secondary: first.secondary });
      await expect(cost(adapter, consumer)).rejects.toMatchObject({
        payload: expect.objectContaining({ candidates: expect.arrayContaining([first.header.id, second.header.id]) })
      });
      await expect(
        cost(adapter, consumer, { jointCostSources: { [first.secondary.revisionId]: consumer.header.id } })
      ).rejects.toThrow(/来源|输出修订/);
      const wrongOrg = await makeFixture(adapter, { secondary: first.secondary, orgId: 'other-org' });
      await expect(
        cost(adapter, consumer, { jointCostSources: { [first.secondary.revisionId]: wrongOrg.header.id } })
      ).rejects.toThrow(/组织|来源/);
      const selected = await cost(adapter, consumer, {
        jointCostSources: { [first.secondary.revisionId]: second.header.id }
      });
      expect(selected.root.batchCost).toBe('17.6');
    });

    it('C10 consume结构图仍无环，派生生产头成本环明确拒绝', async () => {
      const producer = await makeFixture(adapter, { released: false });
      const consumer = await downstream(adapter, producer);
      await addLine(adapter, producer.header, consumer.primary, producer.seed, 30, { qty: '1' });
      await release(producer.header);
      await expect(
        cost(adapter, producer, { jointCostSources: { [producer.secondary.revisionId]: producer.header.id } })
      ).rejects.toThrow(/生产头.*环|联产.*环/);
    });

    it('C09 precise锁版与imprecise新修订各取显式来源，不按物料串用成本', async () => {
      const first = await makeFixture(adapter);
      const revision = entity(adapter, BomItemRevision, {
        itemId: first.secondary.item.id,
        revisionNo: 'B',
        effectiveFrom: day('2099-01-01')
      });
      await revision.save();
      revision.state = 'released';
      await revision.save();
      const second = await makeFixture(adapter, {
        secondary: { item: first.secondary.item, revisionId: revision.id },
        rawPrice: '3'
      });
      const precise = await downstream(adapter, first);
      const imprecise = await downstream(adapter, first, { imprecise: true });
      const jointCostSources = { [first.secondary.revisionId]: first.header.id, [revision.id]: second.header.id };
      expect((await cost(adapter, precise, { jointCostSources })).root.batchCost).toBe('17.6');
      expect((await cost(adapter, imprecise, { jointCostSources, asOfDate: day('2080-01-01') })).root.batchCost).toBe(
        '17.6'
      );
      expect((await cost(adapter, imprecise, { jointCostSources })).root.batchCost).toBe('26.4');
      await expect(
        cost(adapter, imprecise, { jointCostSources: { [first.secondary.revisionId]: first.header.id } })
      ).rejects.toThrow(/联产.*来源/);
    });

    it('C11 ECN发布按转换后运行投影拒绝份额缺口并回滚', async () => {
      const fixture = await makeFixture(adapter);
      const ecn = await replaceOutput(adapter, fixture, '0.3');
      ecn.state = 'released';
      await expect(ecn.save()).rejects.toBeInstanceOf(BomPublishValidationError);
      expect((await cost(adapter, fixture, { asOfDate: day('2099-01-03') })).root.jointCost?.outputs[1].qty).toBe('50');
    });

    it('C11 合法ECN发布/改期/取消按运行日期恢复产出与单位成本', async () => {
      const fixture = await makeFixture(adapter);
      const ecn = await replaceOutput(adapter, fixture, '0.4');
      ecn.state = 'released';
      await ecn.save();
      expect((await cost(adapter, fixture, { asOfDate: day('2099-01-02') })).root.jointCost?.outputs[1].unitCost).toBe(
        '2.2'
      );
      ecn.effectiveDate = day('2099-01-03');
      await ecn.save();
      expect((await cost(adapter, fixture, { asOfDate: day('2099-01-02') })).root.jointCost?.outputs[1].unitCost).toBe(
        '1.76'
      );
      ecn.state = 'cancelled';
      await ecn.save();
      expect((await cost(adapter, fixture, { asOfDate: day('2099-01-03') })).root.jointCost?.outputs[1].unitCost).toBe(
        '1.76'
      );
    });

    it('C12 已发布头主份额不可修改，ECN不能直接把旧单产头升级联产', async () => {
      const fixture = await makeFixture(adapter);
      fixture.header.jointCostShare = '0.7';
      await expect(fixture.header.save()).rejects.toBeInstanceOf(BomWriteProtocolError);
      const old = await makeFixture(adapter, { joint: false });
      const ecn = entity(adapter, BomEcn, {
        ecnNo: `JOINT-UPGRADE-${crypto.randomUUID()}`,
        effectiveDate: day('2099-01-02')
      });
      await ecn.save();
      const line = entity(adapter, BomLine, { headerId: old.header.id, lineNo: 30, ecnInId: ecn.id });
      await line.save();
      const output = entity(adapter, BomLineOccurrence, {
        lineId: line.id,
        childItemId: old.secondary.item.id,
        childRevisionId: old.secondary.revisionId,
        qty: '50',
        uom: 'kg',
        effectiveFrom: ecn.effectiveDate,
        ecnInId: ecn.id
      });
      Object.assign(output, { flowDirection: 'produce', jointCostShare: '0.4' });
      await output.save();
      ecn.state = 'released';
      await expect(ecn.save()).rejects.toBeInstanceOf(BomPublishValidationError);
    });

    it('C13 同ID异库与来源选择不串缓存，结果记录真实来源依据', async () => {
      const first = await makeFixture(adapter);
      const consumer = await downstream(adapter, first);
      const selected = await cost(adapter, consumer, {
        jointCostSources: { [first.secondary.revisionId]: first.header.id }
      });
      expect(selected.jointManifest?.sources).toContainEqual(
        expect.objectContaining({
          outputRevisionId: first.secondary.revisionId,
          producerHeaderId: first.header.id,
          outputOccurrenceId: first.output.id,
          share: '0.4',
          qty: '50',
          uom: 'kg'
        })
      );
      const other = await createBomTestAdapter(backend);
      try {
        const second = await makeFixture(other, { seed: first.seed, rawPrice: '3' });
        expect((await cost(other, second)).root.jointCost?.outputs.map(output => output.batchCost)).toEqual([
          '198',
          '132'
        ]);
        expect((await cost(adapter, first)).root.jointCost?.outputs.map(output => output.batchCost)).toEqual([
          '132',
          '88'
        ]);
      } finally {
        await disposeBomTestAdapter(other);
      }
    });

    it('C14 旧单产默认结果不附空joint字段，副产/废料行为逐字保持', async () => {
      const fixture = await makeFixture(adapter, { joint: false });
      const before = await cost(adapter, fixture);
      expect(before.root.batchCost).toBe('220');
      expect(before.root.unitCost).toBe('2.2');
      expect(Object.hasOwn(before.root, 'jointCost')).toBe(false);
      expect(Object.hasOwn(before, 'jointManifest')).toBe(false);
      expect(await production(adapter, fixture)).toBeNull();
      expect(await cost(adapter, fixture)).toEqual(before);
    });

    it.each([
      { submitted: '0.40', edited: '0.7', stored: '0.4' },
      { submitted: '0.5', edited: '0.4', stored: '0.5' }
    ])('份额提交$submitted期间改为$edited，保存回填保留新编辑或撤回', async ({ submitted, edited, stored }) => {
      const fixture = await makeFixture(adapter, { released: false });
      const original = adapter.transaction.bind(adapter) as BomTestAdapter['transaction'];
      let entered!: () => void;
      let resume!: () => void;
      const reached = new Promise<void>(resolve => {
        entered = resolve;
      });
      const gate = new Promise<void>(resolve => {
        resume = resolve;
      });
      let blocked = false;
      // 保存期校验读与写入同一事务：在事务执行器的 query 上卡住第一次 attr_def 读取
      const paused = (executor: TransactionExecutor): TransactionExecutor =>
        new Proxy(executor, {
          get(target, property) {
            if (property === 'query') {
              return async (sql: string, params?: readonly unknown[]) => {
                if (!blocked && sql.includes('attr_def')) {
                  blocked = true;
                  entered();
                  await gate;
                }
                return target.query(sql, params);
              };
            }
            const value: unknown = Reflect.get(target, property, target);
            return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
          }
        });
      const observed = (fun: TransactionFun, transactionLog?: boolean): Promise<unknown> =>
        original(executor => fun(paused(executor)), transactionLog);
      const spy = vi.spyOn(adapter, 'transaction').mockImplementation(observed as BomTestAdapter['transaction']);
      try {
        fixture.output.jointCostShare = submitted;
        fixture.output.ext = '{}';
        const saving = fixture.output.save();
        await reached;
        fixture.output.jointCostShare = edited;
        resume();
        await saving;
        expect(fixture.output.jointCostShare).toBe(edited);
        const storedShare = () =>
          adapter.transaction(
            async executor =>
              (
                await executor.query(
                  `SELECT "jointCostShare" FROM ${bomSqlDialectFor(adapter.name).table('bom_line_occurrence')} WHERE "id" = '${fixture.output.id}'`
                )
              ).rows[0][0]
          );
        expect(await storedShare()).toBe(stored);
        await fixture.output.save();
        expect(await storedShare()).toBe(edited);
      } finally {
        resume();
        spy.mockRestore();
      }
    });
  });
}

describe('C13 联产来源与主产物成本共用真实 SQLite 读取快照', () => {
  it('另一连接修改原料价时，两种输出成本不能混合写入前后时点', async () => {
    const dbName = `joint-snap-${crypto.randomUUID().slice(0, 16)}`;
    const reader = await createBomTestAdapter('wa-sqlite', undefined, { dbName, persistent: true });
    let writer: BomTestAdapter | undefined;
    try {
      const producer = await makeFixture(reader);
      const consumer = await downstream(reader, producer, { includePrimary: true });
      const selection = { jointCostSources: { [producer.secondary.revisionId]: producer.header.id } };
      expect((await cost(reader, consumer, selection)).root.batchCost).toBe('30.8');
      writer = await createBomTestAdapter('wa-sqlite', undefined, { dbName, persistent: true });
      const write = writer.rawQuery(`UPDATE "bom$item" SET "unitPrice" = '3' WHERE "id" = '${producer.raw.item.id}'`);
      const during = await cost(reader, consumer, selection);
      await write;
      expect(['30.8', '46.2']).toContain(during.root.batchCost);
      expect((await cost(reader, consumer, selection)).root.batchCost).toBe('46.2');
    } finally {
      if (writer) await disposeBomTestAdapter(writer);
      await disposeBomTestAdapter(reader);
    }
  });
});

describe('联产旧持久库触发器升级', () => {
  it.each(['wa-sqlite', 'pglite'] satisfies BomTestBackend[])(
    '%s重连替换旧守卫并完整执行ECN发布/改期/取消',
    async backend => {
      const dbName = `joint-up-${crypto.randomUUID().slice(0, 16)}`;
      let first: BomTestAdapter | undefined = await createBomTestAdapter(backend, undefined, {
        dbName,
        persistent: true
      });
      let reopened: BomTestAdapter | undefined;
      try {
        const fixture = await makeFixture(first);
        const ecn = await replaceOutput(first, fixture, '0.4');
        if (backend === 'wa-sqlite') {
          const guards = [
            ['bom_line_occurrence_released_header_u', 'bom$bom_line_occurrence'],
            ['ecn_publish_trg', 'bom$ecn'],
            ['ecn_reschedule_trg', 'bom$ecn'],
            ['ecn_cancel_trg', 'bom$ecn'],
            ['bom_header_coproduct_immutable', 'bom$bom_header']
          ];
          for (const [name, table] of guards) {
            await first.rawQuery(`DROP TRIGGER IF EXISTS "${name}"`);
            await first.rawQuery(
              `CREATE TRIGGER "${name}" BEFORE UPDATE ON "${table}" BEGIN SELECT RAISE(ABORT, '旧版联合守卫未升级'); END`
            );
          }
        } else {
          for (const name of [
            'bom_line_occurrence__released_header_guard',
            'ecn__state_machine',
            'bom_header__coproduct_immutable'
          ]) {
            await first.rawQuery(
              `CREATE OR REPLACE FUNCTION "bom"."${name}"() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION '旧版联合守卫未升级'; RETURN NEW; END; $$ LANGUAGE plpgsql`
            );
          }
        }
        const dialect = bomSqlDialectFor(backend);
        await expect(
          first.rawQuery(
            `UPDATE ${dialect.table('bom_line_occurrence')} SET "qty" = "qty" WHERE "id" = '${fixture.output.id}'`
          )
        ).rejects.toThrow('旧版联合守卫未升级');
        await disposeBomTestAdapter(first);
        first = undefined;
        reopened = await createBomTestAdapter(backend, undefined, { dbName, persistent: true });
        const candidates = await reopened
          .getRepository(BomLineOccurrence)
          .find({ where: { combinator: 'and', rules: [{ field: 'ecnInId', operator: '=', value: ecn.id }] } });
        await reopened.rxdb.entityManager
          .getRepository(BomLineOccurrence)
          .update(candidates[0], { qty: '80', jointCostShare: '0.4' });
        const ecns = reopened.rxdb.entityManager.getRepository(BomEcn);
        const current = await firstValueFrom(ecns.get(ecn.id));
        await ecns.update(current, { state: 'released' });
        expect(
          (await cost(reopened, fixture, { asOfDate: day('2099-01-02') })).root.jointCost?.outputs[1].unitCost
        ).toBe('1.1');
        await ecns.update(current, { effectiveDate: day('2099-01-03') });
        expect(
          (await cost(reopened, fixture, { asOfDate: day('2099-01-02') })).root.jointCost?.outputs[1].unitCost
        ).toBe('1.76');
        await ecns.update(current, { state: 'cancelled' });
        expect(
          (await cost(reopened, fixture, { asOfDate: day('2099-01-03') })).root.jointCost?.outputs[1].unitCost
        ).toBe('1.76');
        const header = await firstValueFrom(
          reopened.rxdb.entityManager.getRepository(BomHeader).get(fixture.header.id)
        );
        await expect(
          reopened.rxdb.entityManager.getRepository(BomHeader).update(header, { jointCostShare: '0.7' })
        ).rejects.toBeInstanceOf(BomWriteProtocolError);
      } finally {
        if (reopened) await disposeBomTestAdapter(reopened);
        if (first) await disposeBomTestAdapter(first);
      }
    }
  );
});
