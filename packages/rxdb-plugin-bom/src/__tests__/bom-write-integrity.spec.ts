/**
 * @fileoverview 保存期校验的完整性回归（BOM 分支第二轮评审 P1-5 / P2-3 / P2-4 / P2-19 / P3）
 *
 * - P1-5：attr_def 的 dataType / appliesTo 只认白名单，拼错的作用域（约束永远匹配不到实体）与未知类型在保存期拒绝；
 * - P2-4：attr_def.enumValues 写入期只认 null 或 JSON 字符串数组；直连 SQL 写坏的声明在读取侧点名该声明拒绝，
 *   不抛裸 SyntaxError、不把标量当作「无枚举」；
 * - P2-19：变换范围的两根头存在、类型分别为 EBOM / MBOM、组织与范围一致、父件是同一物料（修订可以不同）；
 * - P2-3：保存期校验的读取与写入同一事务——字典变更排在读取了 attr_def 的事务之后时，写入必须已经先提交；
 * - P3：attr_def 只读本作用域的声明（别的作用域里的坏声明不阻塞本作用域写入），整批导入每个作用域只读一次。
 *
 * 双后端（wa-sqlite / pglite）同断言；会改写字典的用例各用独立库，互不污染。
 */

import type { TransactionExecutor, TransactionFun } from '@aiao/rxdb';
import { afterAll, beforeAll, describe, expect, it, vi, type MockInstance } from 'vitest';
import { BomAttrDef, BomHeader, BomItem, BomMapScope } from '../entities.js';
import { BomMapError } from '../resolve/bom-map.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import { BomExtAttrError } from '../resolve/ext-attr.js';
import { loadHistory } from '../resolve/history-loader.js';
import { importBomDraft } from '../resolve/integration.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const BACKENDS: BomTestBackend[] = ['wa-sqlite', 'pglite'];

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const rand = (): string => Math.random().toString(36).slice(2, 10);

/** 被拒时返回错误，成功时返回 undefined（便于逐项断言错误类型与消息）。 */
const failureOf = (promise: Promise<unknown>): Promise<unknown> =>
  promise.then(
    () => undefined,
    (error: unknown) => error
  );

/** 事务执行器的观察代理：只截获 query（保存期校验读走它），其余成员绑定回真实执行器。 */
const observeQueries = (executor: TransactionExecutor, onQuery: (sql: string) => void): TransactionExecutor =>
  new Proxy(executor, {
    get(target, property) {
      if (property === 'query') {
        return (sql: string, params?: readonly unknown[]) => {
          onQuery(sql);
          return target.query(sql, params);
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    }
  });

/**
 * 包住适配器的 transaction：每个事务回调拿到观察代理；事务结束后把「本事务是否读过 attr_def」交给
 * afterTransaction（它用未被包住的原始 transaction 另开事务，不会再被观察）。
 */
const observeTransactions = (
  adapter: BomTestAdapter,
  hooks: {
    onQuery?: (sql: string) => void;
    afterTransaction?: (readAttrDef: boolean, original: BomTestAdapter['transaction']) => Promise<void>;
  }
): MockInstance => {
  const original = adapter.transaction.bind(adapter) as BomTestAdapter['transaction'];
  const observed = async (fun: TransactionFun, transactionLog?: boolean): Promise<unknown> => {
    let readAttrDef = false;
    const result = await original(
      executor =>
        fun(
          observeQueries(executor, sql => {
            if (sql.includes('attr_def')) readAttrDef = true;
            hooks.onQuery?.(sql);
          })
        ),
      transactionLog
    );
    await hooks.afterTransaction?.(readAttrDef, original);
    return result;
  };
  return vi.spyOn(adapter, 'transaction').mockImplementation(observed as BomTestAdapter['transaction']);
};

for (const backend of BACKENDS) {
  const dialect = bomSqlDialectFor(backend);
  const booleanLiteral = (value: boolean): string => {
    if (backend === 'pglite') return value ? 'TRUE' : 'FALSE';
    return value ? '1' : '0';
  };

  /** 直连 SQL 写一条 attr_def（绕过仓储，模拟存量坏数据）。 */
  const insertAttrDefRaw = (
    adapter: BomTestAdapter,
    row: { code: string; dataType: string; appliesTo: string; enumValues: string | null }
  ) =>
    adapter.rawQuery(
      `INSERT INTO ${dialect.table('attr_def')} ("id", "code", "dataType", "enumValues", "appliesTo", "createdAt", "updatedAt", "required") VALUES (${[0, 1, 2, 3, 4, 5, 6].map(index => dialect.placeholder(index)).join(', ')}, ${booleanLiteral(false)})`,
      [
        crypto.randomUUID(),
        row.code,
        row.dataType,
        row.enumValues,
        row.appliesTo,
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z'
      ]
    );

  describe(`attr_def 声明的写入期校验 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    const attrDef = (data: Partial<BomAttrDef>): BomAttrDef =>
      adapter.rxdb.entityManager.instantiate(BomAttrDef, {
        code: `c-${rand()}`,
        dataType: 'string',
        appliesTo: 'item',
        ...data
      });

    it('P1-5：拼错的 appliesTo 与未知 dataType 在保存期拒绝并点名，补丁改坏同样拒绝', async () => {
      const misspelled = await failureOf(attrDef({ appliesTo: 'bom_line' as BomAttrDef['appliesTo'] }).save());
      expect(misspelled).toBeInstanceOf(BomExtAttrError);
      expect(String((misspelled as Error).message)).toMatch(/appliesTo.*bom_line/);
      const unknownType = await failureOf(attrDef({ dataType: 'foobar' as BomAttrDef['dataType'] }).save());
      expect(unknownType).toBeInstanceOf(BomExtAttrError);
      expect(String((unknownType as Error).message)).toMatch(/dataType.*foobar/);
      const accepted = attrDef({ dataType: 'number', appliesTo: 'bom_line_occurrence' });
      await accepted.save();
      accepted.appliesTo = 'bom_lines' as BomAttrDef['appliesTo'];
      await expect(accepted.save()).rejects.toBeInstanceOf(BomExtAttrError);
      const stored = await adapter.rawQuery(
        `SELECT COUNT(*) FROM ${dialect.table('attr_def')} WHERE "appliesTo" NOT IN ('item', 'bom_header', 'bom_line_occurrence') OR "dataType" NOT IN ('string', 'number', 'boolean', 'date')`
      );
      expect(Number(stored.rows[0][0])).toBe(0);
    });

    it('P2-4：enumValues 写入期只认 null 或 JSON 字符串数组', async () => {
      for (const enumValues of ['not json', '5', '"yes"', '{"yes":1}', '["yes",1]']) {
        const failure = await failureOf(attrDef({ enumValues }).save());
        expect(failure, enumValues).toBeInstanceOf(BomExtAttrError);
        expect(String((failure as Error).message), enumValues).toMatch(/enumValues/);
      }
      await expect(attrDef({ enumValues: '["yes","no"]' }).save()).resolves.toBeDefined();
      await expect(attrDef({ enumValues: '[]' }).save()).resolves.toBeDefined();
      await expect(attrDef({ enumValues: null }).save()).resolves.toBeDefined();
    });
  });

  describe(`attr_def 读取侧 [${backend}]`, () => {
    it('P2-4：直连 SQL 写坏的 enumValues 点名该声明拒绝——不抛裸 SyntaxError，标量也不当作「无枚举」', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        await insertAttrDefRaw(adapter, {
          code: 'grade',
          dataType: 'string',
          appliesTo: 'item',
          enumValues: 'not json'
        });
        const item = adapter.rxdb.entityManager.instantiate(BomItem, { itemNo: `p24-${rand()}`, ext: '{"grade":"x"}' });
        const broken = await failureOf(item.save());
        expect(broken).toBeInstanceOf(BomExtAttrError);
        expect(String((broken as Error).message)).toMatch(/grade.*item.*enumValues/);
        await adapter.rawQuery(`UPDATE ${dialect.table('attr_def')} SET "enumValues" = '5' WHERE "code" = 'grade'`);
        const scalar = await failureOf(item.save());
        expect(scalar).toBeInstanceOf(BomExtAttrError);
        expect(String((scalar as Error).message)).toMatch(/grade.*enumValues/);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });

    it('P3：只读本作用域的声明——别的作用域里的坏声明不阻塞本作用域写入，本作用域照常 fail-fast', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        await insertAttrDefRaw(adapter, {
          code: 'legacy',
          dataType: 'foobar',
          appliesTo: 'bom_header',
          enumValues: null
        });
        const item = adapter.rxdb.entityManager.instantiate(BomItem, { itemNo: `p3-${rand()}` });
        await expect(item.save()).resolves.toBeDefined();
        await loadHistory(adapter, {
          batchNo: `batch-${rand()}`,
          revisions: [{ itemId: item.id, revisionNo: 'A', effectiveFrom: day('2020-01-01') }],
          headers: []
        });
        const revisionId = String(
          (
            await adapter.rawQuery(
              `SELECT "id" FROM ${dialect.table('item_revision')} WHERE "itemId" = ${dialect.placeholder(0)}`,
              [item.id]
            )
          ).rows[0][0]
        );
        const header = adapter.rxdb.entityManager.instantiate(BomHeader, {
          parentRevisionId: revisionId,
          bomType: 'ebom',
          orgId: 'org-x'
        });
        await expect(header.save()).rejects.toThrow(/legacy.*dataType/);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });
  });

  describe(`保存期校验与写入同一事务 [${backend}]`, () => {
    /**
     * 在「读取了 attr_def 的第一个事务」结束后立刻把 grade 改成必填（直连 SQL，模拟并发改字典），
     * 并在同一事务里先用 probe 判定被测写入是否已经提交。
     */
    const armDictionaryChange = (
      adapter: BomTestAdapter,
      defId: string,
      probe: (executor: TransactionExecutor) => Promise<boolean>
    ): { spy: MockInstance; committedBeforeChange: () => boolean | undefined } => {
      let committedBeforeChange: boolean | undefined;
      const spy = observeTransactions(adapter, {
        afterTransaction: async (readAttrDef, original) => {
          if (!readAttrDef || committedBeforeChange !== undefined) return;
          committedBeforeChange = await original(async executor => {
            const committed = await probe(executor);
            await executor.query(
              `UPDATE ${dialect.table('attr_def')} SET "required" = ${booleanLiteral(true)} WHERE "id" = ${dialect.placeholder(0)}`,
              [defId]
            );
            return committed;
          }, false);
        }
      });
      return { spy, committedBeforeChange: () => committedBeforeChange };
    };

    it('P2-3：创建与更新的字典读取同写入一个事务——字典随后变必填时写入已先提交（可串行化）', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const def = adapter.rxdb.entityManager.instantiate(BomAttrDef, {
          code: 'grade',
          dataType: 'string',
          appliesTo: 'item',
          required: false
        });
        await def.save();
        const item = adapter.rxdb.entityManager.instantiate(BomItem, { itemNo: `p23-${rand()}` });
        const create = armDictionaryChange(adapter, def.id, async executor => {
          const rows = await executor.query(
            `SELECT COUNT(*) FROM ${dialect.table('item')} WHERE "id" = ${dialect.placeholder(0)}`,
            [item.id]
          );
          return Number(rows.rows[0][0]) > 0;
        });
        const created = await failureOf(item.save());
        create.spy.mockRestore();
        expect({ failure: created, committedBeforeChange: create.committedBeforeChange() }).toEqual({
          failure: undefined,
          committedBeforeChange: true
        });

        await adapter.rawQuery(
          `UPDATE ${dialect.table('attr_def')} SET "required" = ${booleanLiteral(false)} WHERE "id" = ${dialect.placeholder(0)}`,
          [def.id]
        );
        item.ext = '{"grade":"A"}';
        await item.save();
        item.ext = '{}';
        const update = armDictionaryChange(adapter, def.id, async executor => {
          const rows = await executor.query(
            `SELECT "ext" FROM ${dialect.table('item')} WHERE "id" = ${dialect.placeholder(0)}`,
            [item.id]
          );
          return rows.rows[0][0] === '{}';
        });
        const updated = await failureOf(item.save());
        update.spy.mockRestore();
        expect({ failure: updated, committedBeforeChange: update.committedBeforeChange() }).toEqual({
          failure: undefined,
          committedBeforeChange: true
        });
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });

    it('P3：整批导入每个作用域只读一次 attr_def，不随行数放大', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        let attrDefReads = 0;
        const spy = observeTransactions(adapter, {
          onQuery: sql => {
            if (sql.includes('attr_def')) attrDefReads += 1;
          }
        });
        const key = rand();
        const identity = {
          itemNo: `IMP-${key}`,
          revisionNo: 'RevA',
          bomType: 'ebom',
          orgId: 'org-x',
          alternativeNo: 1
        };
        const lineNos = [10, 20, 30, 40, 50];
        const result = await importBomDraft(adapter, [
          { kind: 'item', source_ref: 'i-p', itemNo: `IMP-${key}` },
          { kind: 'item', source_ref: 'i-c', itemNo: `IMC-${key}` },
          { kind: 'revision', source_ref: 'r-p', itemNo: `IMP-${key}`, revisionNo: 'RevA', state: 'draft' },
          {
            kind: 'header',
            source_ref: 'h-p',
            ...identity,
            state: 'draft',
            baseUom: 'pcs',
            baseQty: '1',
            assemblyScrap: '0'
          },
          ...lineNos.map(lineNo => ({ kind: 'line', source_ref: `l-${lineNo}`, ...identity, lineNo })),
          ...lineNos.map(lineNo => ({
            kind: 'occurrence',
            source_ref: `o-${lineNo}`,
            ...identity,
            lineNo,
            effectiveFrom: '2024-01-01',
            childItemNo: `IMC-${key}`,
            qty: '1'
          }))
        ]);
        spy.mockRestore();
        expect(result.diagnostics).toEqual([]);
        expect(result.committed).toBe(true);
        expect(attrDefReads).toBe(3);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });
  });

  describe(`变换范围根头配对 [${backend}]`, () => {
    let adapter: BomTestAdapter;

    beforeAll(async () => {
      adapter = await createBomTestAdapter(backend);
    });

    afterAll(async () => {
      await disposeBomTestAdapter(adapter).catch(() => undefined);
    });

    const newItem = async (): Promise<BomItem> => {
      const item = adapter.rxdb.entityManager.instantiate(BomItem, { itemNo: `scope-${rand()}` });
      await item.save();
      return item;
    };

    /** 物料的一个修订（经历史通道装载为已发布修订；同一物料的已发布修订生效日须互异）。 */
    const revisionOf = async (item: BomItem, revisionNo: string, effectiveFrom: string): Promise<string> => {
      await loadHistory(adapter, {
        batchNo: `batch-${rand()}`,
        revisions: [{ itemId: item.id, revisionNo, effectiveFrom: day(effectiveFrom) }],
        headers: []
      });
      const rows = await adapter.rawQuery(
        `SELECT "id" FROM ${dialect.table('item_revision')} WHERE "itemId" = ${dialect.placeholder(0)} AND "revisionNo" = ${dialect.placeholder(1)}`,
        [item.id, revisionNo]
      );
      return String(rows.rows[0][0]);
    };

    const draftHeader = async (revisionId: string, bomType: 'ebom' | 'mbom', orgId: string): Promise<BomHeader> => {
      const header = adapter.rxdb.entityManager.instantiate(BomHeader, {
        parentRevisionId: revisionId,
        bomType,
        orgId
      });
      await header.save();
      return header;
    };

    const scopeOf = (orgId: string, ebom: BomHeader, mbom: BomHeader): BomMapScope =>
      adapter.rxdb.entityManager.instantiate(BomMapScope, {
        orgId,
        ebomRootHeaderId: ebom.id,
        mbomRootHeaderId: mbom.id
      });

    it('P2-19：两根头组织与范围一致、类型分别为 EBOM / MBOM，否则保存期点名拒绝', async () => {
      // 同一修订可同时挂 EBOM 与 MBOM 头（头唯一键含类型与组织）
      const revision = await revisionOf(await newItem(), 'A', '2020-01-01');
      const ebom = await draftHeader(revision, 'ebom', 'org-x');
      const mbom = await draftHeader(revision, 'mbom', 'org-x');
      const foreignMbom = await draftHeader(revision, 'mbom', 'org-y');
      const rejected = async (scope: BomMapScope, pattern: RegExp): Promise<void> => {
        const failure = await failureOf(scope.save());
        expect(failure).toBeInstanceOf(BomMapError);
        expect(String((failure as Error).message)).toMatch(pattern);
      };
      await rejected(scopeOf('org-x', ebom, foreignMbom), /mbomRootHeaderId.*org-y.*org-x/);
      await rejected(scopeOf('org-y', ebom, mbom), /ebomRootHeaderId.*org-x.*org-y/);
      await rejected(scopeOf('org-x', mbom, ebom), /ebomRootHeaderId.*mbom.*EBOM/);
      const scope = scopeOf('org-x', ebom, mbom);
      await expect(scope.save()).resolves.toBeDefined();
      scope.orgId = 'org-y';
      await expect(scope.save()).rejects.toBeInstanceOf(BomMapError);
      const stored = await adapter.rawQuery(
        `SELECT "orgId" FROM ${dialect.table('bom_map_scope')} WHERE "id" = ${dialect.placeholder(0)}`,
        [scope.id]
      );
      expect(stored.rows).toEqual([['org-x']]);
    });

    it('P2-19：两根头的父件须是同一物料（修订可以不同），创建与改指别的物料都点名拒绝', async () => {
      const item = await newItem();
      const other = await newItem();
      const ebom = await draftHeader(await revisionOf(item, 'A', '2020-01-01'), 'ebom', 'org-x');
      const revisedMbom = await draftHeader(await revisionOf(item, 'B', '2021-01-01'), 'mbom', 'org-x');
      const foreignItemMbom = await draftHeader(await revisionOf(other, 'A', '2020-01-01'), 'mbom', 'org-x');
      const failure = await failureOf(scopeOf('org-x', ebom, foreignItemMbom).save());
      expect(failure).toBeInstanceOf(BomMapError);
      expect(String((failure as Error).message)).toMatch(/mbomRootHeaderId.*父件物料/);
      expect(String((failure as Error).message)).toContain(other.id);
      expect(String((failure as Error).message)).toContain(item.id);
      const scope = scopeOf('org-x', ebom, revisedMbom);
      await expect(scope.save()).resolves.toBeDefined();
      scope.mbomRootHeaderId = foreignItemMbom.id;
      await expect(scope.save()).rejects.toBeInstanceOf(BomMapError);
      const stored = await adapter.rawQuery(
        `SELECT "mbomRootHeaderId" FROM ${dialect.table('bom_map_scope')} WHERE "ebomRootHeaderId" = ${dialect.placeholder(0)}`,
        [ebom.id]
      );
      expect(stored.rows).toEqual([[revisedMbom.id]]);
    });
  });
}
