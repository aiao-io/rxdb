/**
 * @fileoverview US-521 ERP/MRP 契约与双后端原子导入、同快照导出回归。
 *
 * 覆盖契约形状（AC#1）、导出拒绝（AC#8）、十进制字段规则（AC#14）、
 * 导入三类预检——重复（AC#10/#11）、依赖缺失（AC#13）、环诊断（AC#2/#12），以及
 * 诊断与输入行序无关（AC#5/#6）。两种行序的断言用「诊断集合相等」而非数组相等。
 */

import { describe, expect, it } from 'vitest';
import { BomHeader, BomItem, BomItemRevision } from '../entities.js';
import type { BomLocalAdapter } from '../resolve/bom-adapter.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
import {
  BomExportRejectedError,
  EXPORT_CONTRACT_VERSION,
  EXPORT_TABLE_COLUMNS,
  isDecimalString,
  serializeExportRows,
  validateExportReady,
  type BomExportPayload,
  type ExportTable
} from '../resolve/export-contract.js';
import { loadHistory } from '../resolve/history-loader.js';
import {
  BomImportContractError,
  DECIMAL_FIELDS,
  naturalKeyFor,
  parseImportPayload,
  parseNaturalKey,
  validateImportRecords,
  type ExistingBomKeySets,
  type ImportDiagnostic,
  type ImportKind,
  type ImportRecord
} from '../resolve/import-contract.js';
import { exportBom, importBomDraft } from '../resolve/integration.js';
import { DECIMAL_FIELD_DOMAINS } from '../resolve/write-rules.js';
import { BomDecimalFormatError } from '../types.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestBackend } from './test-utils.js';

/* ------------------------------------------------------------------ 构造器 */

/** 六层记录的扁平构造（祖先身份列逐层去冗余铺平——导入契约的要求）。 */
const itemOf = (itemNo: string, ref: string): Record<string, unknown> => ({ kind: 'item', source_ref: ref, itemNo });

const revisionOf = (itemNo: string, revisionNo: string, ref: string): Record<string, unknown> => ({
  kind: 'revision',
  source_ref: ref,
  itemNo,
  revisionNo,
  state: 'draft'
});

const headerOf = (itemNo: string, revisionNo: string, ref: string): Record<string, unknown> => ({
  kind: 'header',
  source_ref: ref,
  itemNo,
  revisionNo,
  bomType: 'ebom',
  orgId: 'org-x',
  alternativeNo: 1,
  state: 'draft',
  baseUom: 'pcs',
  baseQty: '1',
  assemblyScrap: '0'
});

const lineOf = (itemNo: string, revisionNo: string, lineNo: number, ref: string): Record<string, unknown> => ({
  kind: 'line',
  source_ref: ref,
  itemNo,
  revisionNo,
  bomType: 'ebom',
  orgId: 'org-x',
  alternativeNo: 1,
  lineNo
});

const occurrenceOf = (
  itemNo: string,
  revisionNo: string,
  lineNo: number,
  effectiveFrom: string,
  childItemNo: string,
  ref: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({
  kind: 'occurrence',
  source_ref: ref,
  itemNo,
  revisionNo,
  bomType: 'ebom',
  orgId: 'org-x',
  alternativeNo: 1,
  lineNo,
  effectiveFrom,
  childItemNo,
  qty: '1',
  ...extra
});

const designatorOf = (
  itemNo: string,
  revisionNo: string,
  lineNo: number,
  effectiveFrom: string,
  childItemNo: string,
  designator: string,
  ref: string
): Record<string, unknown> => ({
  kind: 'designator',
  source_ref: ref,
  itemNo,
  revisionNo,
  bomType: 'ebom',
  orgId: 'org-x',
  alternativeNo: 1,
  lineNo,
  effectiveFrom,
  childItemNo,
  designator
});

/** 一个完整、可整批通过的迷你 BOM：A001 的 RevA 头下一行发生项挂 B001。 */
const validBatch = (): Record<string, unknown>[] => [
  itemOf('A001', 'i-a'),
  itemOf('B001', 'i-b'),
  revisionOf('A001', 'RevA', 'r-a'),
  revisionOf('B001', 'RevA', 'r-b'),
  headerOf('A001', 'RevA', 'h-a'),
  lineOf('A001', 'RevA', 10, 'l-a'),
  occurrenceOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'o-ab')
];

/** 同批 A→B 与 B→A（判环输入）。 */
const twoWayBatch = (): Record<string, unknown>[] => [
  itemOf('A001', 'i-a'),
  itemOf('B001', 'i-b'),
  revisionOf('A001', 'RevA', 'r-a'),
  revisionOf('B001', 'RevA', 'r-b'),
  headerOf('A001', 'RevA', 'h-a'),
  headerOf('B001', 'RevA', 'h-b'),
  lineOf('A001', 'RevA', 10, 'l-a'),
  lineOf('B001', 'RevA', 10, 'l-b'),
  occurrenceOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'o-ab'),
  occurrenceOf('B001', 'RevA', 10, '2024-01-01', 'A001', 'o-ba')
];

const parse = (records: Record<string, unknown>[]): ImportRecord[] => parseImportPayload(records);

const emptyExisting = (): ExistingBomKeySets => ({
  items: new Set(),
  revisions: new Set(),
  headers: new Set(),
  lines: new Set(),
  occurrences: new Set()
});

const validate = (
  records: Record<string, unknown>[],
  existing: ExistingBomKeySets = emptyExisting()
): { ok: boolean; diagnostics: ImportDiagnostic[] } => validateImportRecords(parse(records), existing);

/** 诊断集合（自然键 + 消息）——两种行序的等价性断言用。 */
const diagSetOf = (result: { diagnostics: ImportDiagnostic[] }): Set<string> =>
  new Set(result.diagnostics.map(diagnostic => `${diagnostic.naturalKey} | ${diagnostic.message}`));

/** 把输入反序跑一遍（AC#5/#6/#10/#12：诊断与行序无关）。 */
const assertOrderIndependent = (records: Record<string, unknown>[], existing: ExistingBomKeySets): void => {
  const forward = validateImportRecords(parse(records), existing);
  const reversed = validateImportRecords(parse([...records].reverse()), existing);
  expect(forward.ok).toBe(reversed.ok);
  expect(diagSetOf(forward)).toEqual(diagSetOf(reversed));
};

/** 按契约列序铺一行（未给列填 null；十进制可空列 null 放行）。 */
const rowFor = (table: ExportTable, overrides: Record<string, unknown>): unknown[] =>
  EXPORT_TABLE_COLUMNS[table].map(column => (column in overrides ? overrides[column] : null));

const occurrenceRow = (overrides: Record<string, unknown> = {}): unknown[] =>
  rowFor('occurrence', {
    itemNo: 'A001',
    revisionNo: 'RevA',
    bomType: 'ebom',
    orgId: 'org-x',
    alternativeNo: 1,
    lineNo: 10,
    effectiveFrom: '2024-01-01',
    childItemNo: 'B001',
    qty: '2.5',
    uom: 'pcs',
    flowDirection: 'consume',
    componentScrap: '0',
    componentScrapFixed: '0',
    ...overrides
  });

const serialize = (rows: { table: ExportTable; values: unknown[][] }[]): BomExportPayload =>
  serializeExportRows(rows, {
    orgId: 'org-x',
    exportedAt: '2024-01-01T00:00:00.000Z',
    manifest: { context: { bomType: 'ebom', orgId: 'org-x' }, occurrenceIds: ['occ-1'] }
  });

/* ------------------------------------------------------------------ 导出契约 */

describe('US-521 导出契约（export-contract）', () => {
  it('AC#1 契约形状：版本、时点、组织、manifest 与六层分桶', () => {
    const manifest = { context: { bomType: 'ebom' } };
    const payload = serializeExportRows(
      [
        { table: 'item', values: [rowFor('item', { itemNo: 'A001' })] },
        { table: 'revision', values: [rowFor('revision', { itemNo: 'A001', revisionNo: 'RevA' })] },
        { table: 'header', values: [rowFor('header', { itemNo: 'A001', revisionNo: 'RevA' })] },
        { table: 'line', values: [rowFor('line', { itemNo: 'A001', revisionNo: 'RevA' })] },
        { table: 'occurrence', values: [occurrenceRow()] },
        { table: 'designator', values: [rowFor('designator', { itemNo: 'A001', designator: 'R1' })] }
      ],
      { orgId: 'org-x', exportedAt: '2024-01-01T00:00:00.000Z', manifest }
    );
    expect(EXPORT_CONTRACT_VERSION).toBe('1');
    expect(payload.version).toBe('1');
    expect(payload.version).toBe(EXPORT_CONTRACT_VERSION);
    expect(payload.exportedAt).toBe('2024-01-01T00:00:00.000Z');
    expect(payload.orgId).toBe('org-x');
    expect(payload.manifest).toBe(manifest);
    expect(payload.items).toHaveLength(1);
    expect(payload.revisions).toHaveLength(1);
    expect(payload.headers).toHaveLength(1);
    expect(payload.lines).toHaveLength(1);
    expect(payload.occurrences).toHaveLength(1);
    expect(payload.designators).toHaveLength(1);
    expect((payload.items as unknown[][])[0][0]).toBe('A001');
    // 六层契约列序齐备；AC#3 的 supply_to_vendor 在发生项契约面上
    for (const table of ['item', 'revision', 'header', 'line', 'occurrence', 'designator'] as const) {
      expect(EXPORT_TABLE_COLUMNS[table].length).toBeGreaterThan(0);
    }
    expect(EXPORT_TABLE_COLUMNS.occurrence).toContain('supplyToVendor');
  });

  it('AC#8 truncated 拒绝并点名原因', () => {
    expect(() => validateExportReady({ truncated: { reason: 'depth' } }, [])).toThrow(BomExportRejectedError);
    expect(() => validateExportReady({ truncated: { reason: 'depth' } }, [])).toThrow(/depth/);
    expect(() => validateExportReady({ truncated: { reason: 'depth' } }, [])).toThrow(/截断/);
  });

  it('AC#8 unresolved 拒绝并点名行与候选数', () => {
    const unresolved = [{ lineId: 'line-9', candidates: [{ headerId: 'h-1' }, { headerId: 'h-2' }] }];
    expect(() => validateExportReady({ truncated: null }, unresolved)).toThrow(BomExportRejectedError);
    expect(() => validateExportReady({ truncated: null }, unresolved)).toThrow(/line-9/);
    expect(() => validateExportReady({ truncated: null }, unresolved)).toThrow(/候选 2 项/);
  });

  it('AC#8 truncated 与 unresolved 齐备时一次全部点名', () => {
    expect(() =>
      validateExportReady({ truncated: { reason: 'paths' } }, [{ lineId: 'line-9', candidates: [{}] }])
    ).toThrow(/paths[\s\S]*line-9/);
  });

  it('AC#8 完整结构放行', () => {
    expect(() => validateExportReady({ truncated: null }, [])).not.toThrow();
  });

  it('十进制字段非规范串拒绝并点名表与列', () => {
    expect(() => serialize([{ table: 'occurrence', values: [occurrenceRow({ qty: '1.50' })] }])).toThrow(
      BomDecimalFormatError
    );
    expect(() => serialize([{ table: 'occurrence', values: [occurrenceRow({ qty: '1.50' })] }])).toThrow(
      /occurrence\.qty/
    );
    // 尾随零 / 前导零 / 负号都不是规范串
    for (const bad of ['1.50', '01', '-1']) {
      expect(() => serialize([{ table: 'occurrence', values: [occurrenceRow({ qty: bad })] }])).toThrow(
        BomDecimalFormatError
      );
    }
  });

  it('十进制字段 JSON number 拒绝', () => {
    expect(() => serialize([{ table: 'occurrence', values: [occurrenceRow({ qty: 1.5 })] }])).toThrow(
      BomDecimalFormatError
    );
    expect(() => serialize([{ table: 'header', values: [rowFor('header', { baseQty: 1 })] }])).toThrow(
      BomDecimalFormatError
    );
  });

  it('可空十进制列 null 放行（公式行 qty / 头 costLotQty）', () => {
    const payload = serialize([
      { table: 'occurrence', values: [occurrenceRow({ qty: null, qtyFormula: '2*x' })] },
      { table: 'header', values: [rowFor('header', { costLotQty: null, baseQty: '1', assemblyScrap: '0' })] }
    ]);
    expect(payload.occurrences).toHaveLength(1);
    expect(payload.headers).toHaveLength(1);
  });

  it('行宽与契约列宽不符拒绝', () => {
    const shortRow = rowFor('item', { itemNo: 'A001' }).slice(0, 3);
    expect(() => serialize([{ table: 'item', values: [shortRow] }])).toThrow(BomExportRejectedError);
    expect(() => serialize([{ table: 'item', values: [shortRow] }])).toThrow(/行宽/);
  });

  it('Date 归一为 ISO 文本（两次同输入逐字节一致的基础，AC#9）', () => {
    const iso = '2024-01-01T00:00:00.000Z';
    const payload = serialize([{ table: 'occurrence', values: [occurrenceRow({ effectiveFrom: new Date(iso) })] }]);
    const index = EXPORT_TABLE_COLUMNS.occurrence.indexOf('effectiveFrom');
    expect((payload.occurrences as unknown[][])[0][index]).toBe(iso);
  });

  it('isDecimalString 判定（与 DECIMAL_CANONICAL_RE 同口径）', () => {
    expect(isDecimalString('0')).toBe(true);
    expect(isDecimalString('1.5')).toBe(true);
    expect(isDecimalString('100')).toBe(true);
    expect(isDecimalString('1.50')).toBe(false);
    expect(isDecimalString('01')).toBe(false);
    expect(isDecimalString('-1')).toBe(false);
    expect(isDecimalString('')).toBe(false);
    expect(isDecimalString(1.5)).toBe(false);
    expect(isDecimalString(null)).toBe(false);
  });
});

/* ------------------------------------------------------------------ 导入解析 */

describe('US-521 导入契约解析（import-contract.parseImportPayload）', () => {
  it('AC#14 十进制字段收到 JSON number 即拒绝并点名字段与记录', () => {
    expect(() => parse([occurrenceOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'o-ab', { qty: 100 })])).toThrow(
      BomImportContractError
    );
    expect(() => parse([occurrenceOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'o-ab', { qty: 100 })])).toThrow(/qty/);
    expect(() => parse([occurrenceOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'o-ab', { qty: 100 })])).toThrow(
      /records\[0\]\.qty/
    );
    // 非 number 的其他 JSON 类型同样拒绝（boolean）
    expect(() => parse([occurrenceOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'o-ab', { qty: true })])).toThrow(
      BomImportContractError
    );
  });

  it('AC#14 十进制字符串与 null 放行（34 位有效数字串原样保留）', () => {
    const digits = '1.234567890123456789012345678901234';
    const records = parse([
      occurrenceOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'o-ab', { qty: digits, componentScrapFixed: null })
    ]);
    expect(records).toHaveLength(1);
    expect(records[0].data.qty).toBe(digits);
  });

  it('结构校验：kind 非法 / 缺身份列 / 缺 source_ref / 非数组', () => {
    expect(() => parseImportPayload({})).toThrow(BomImportContractError);
    expect(() => parse([{ kind: 'bogus', source_ref: 'x', itemNo: 'A001' }])).toThrow(/kind/);
    expect(() =>
      parse([{ kind: 'header', source_ref: 'h-1', itemNo: 'A001', revisionNo: 'RevA', bomType: 'ebom' }])
    ).toThrow(/orgId/);
    expect(() => parse([{ kind: 'item', itemNo: 'A001' }])).toThrow(/source_ref/);
    expect(() =>
      parse([
        {
          kind: 'line',
          source_ref: 'l-1',
          itemNo: 'A001',
          revisionNo: 'RevA',
          bomType: 'ebom',
          orgId: 'org-x',
          alternativeNo: 1,
          lineNo: 1.5
        }
      ])
    ).toThrow(/lineNo/);
  });

  it('自然键构造与解析互逆（六层）', () => {
    const cases: { kind: ImportKind; data: Record<string, unknown> }[] = [
      { kind: 'item', data: { itemNo: 'A001' } },
      { kind: 'revision', data: { itemNo: 'A001', revisionNo: 'RevA' } },
      {
        kind: 'header',
        data: { itemNo: 'A001', revisionNo: 'RevA', bomType: 'ebom', orgId: 'org-x', alternativeNo: 1 }
      },
      {
        kind: 'line',
        data: { itemNo: 'A001', revisionNo: 'RevA', bomType: 'ebom', orgId: 'org-x', alternativeNo: 1, lineNo: 10 }
      },
      {
        kind: 'occurrence',
        data: {
          itemNo: 'A001',
          revisionNo: 'RevA',
          bomType: 'ebom',
          orgId: 'org-x',
          alternativeNo: 1,
          lineNo: 10,
          effectiveFrom: '2024-01-01',
          childItemNo: 'B001'
        }
      },
      {
        kind: 'designator',
        data: {
          itemNo: 'A001',
          revisionNo: 'RevA',
          bomType: 'ebom',
          orgId: 'org-x',
          alternativeNo: 1,
          lineNo: 10,
          effectiveFrom: '2024-01-01',
          childItemNo: 'B001',
          designator: 'R1'
        }
      }
    ];
    for (const { kind, data } of cases) {
      const key = naturalKeyFor(kind, data);
      const parsed = parseNaturalKey(key);
      expect(parsed.kind).toBe(kind);
      expect(naturalKeyFor(kind, data)).toBe(key);
      expect(parsed.parts[0]).toBe(String(data['itemNo']));
    }
    expect(() => parseNaturalKey('垃圾文本')).toThrow(BomImportContractError);
    expect(() => parseNaturalKey('["bogus"]')).toThrow(BomImportContractError);
  });

  it('DECIMAL_FIELDS 清单即契约', () => {
    expect([...DECIMAL_FIELDS]).toEqual([
      'jointCostShare',
      'qty',
      'baseQty',
      'assemblyScrap',
      'componentScrap',
      'componentScrapFixed',
      'lotsizeFrom',
      'lotsizeTo',
      'uomConversion',
      'costLotQty',
      'unitPrice',
      'creditPrice',
      'ratio',
      'usageProbability',
      'equivQty'
    ]);
    // 导入契约的十进制列是入口域规则表（写入入口共用）在导入记录层上的子集：同列同域
    for (const field of DECIMAL_FIELDS) expect(DECIMAL_FIELD_DOMAINS[field]).toBeDefined();
  });

  it('P1-8 自然键构造失败统一为 BomImportContractError（点名自然键与字段），不逃逸裸异常', () => {
    const base = occurrenceOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'o-bad');
    const cases: [string, unknown][] = [
      ['lotCodes', 5],
      ['lotCodes', { A: 1 }],
      ['lotCodes', '{oops'],
      ['lotCodes', '"AB"'],
      ['lotCodes', '[1,2]'],
      ['effectiveFrom', 'not-a-date'],
      ['effectiveFrom', 0],
      ['effectiveFrom', '0']
    ];
    for (const [field, value] of cases) {
      const label = `${field}=${JSON.stringify(value)}`;
      expect(() => naturalKeyFor('occurrence', { ...base, [field]: value }), label).toThrow(BomImportContractError);
      expect(() => naturalKeyFor('occurrence', { ...base, [field]: value }), label).toThrow(
        new RegExp(`naturalKey\\(occurrence\\)\\.${field}`)
      );
      expect(() => parse([{ ...base, [field]: value }]), label).toThrow(BomImportContractError);
    }
    // 非键日期列同一日期契约：epoch 数值不再经 new Date("0") 静默变成 2000-01-01
    expect(() => parse([{ ...base, effectiveTo: 0 }])).toThrow(/records\[0\]\.effectiveTo/);
    expect(() => parse([{ ...base, effectiveTo: 'never' }])).toThrow(BomImportContractError);
    // 合法形态照常：批次集合数组 / JSON 文本、Date 与 ISO 文本同键
    expect(naturalKeyFor('occurrence', { ...base, lotCodes: ['B', 'A'] })).toBe(
      naturalKeyFor('occurrence', { ...base, lotCodes: '["A","B"]' })
    );
    expect(naturalKeyFor('occurrence', { ...base, effectiveFrom: new Date('2024-01-01T00:00:00.000Z') })).toBe(
      naturalKeyFor('occurrence', base)
    );
  });

  it('P1-8 导出体行构造自然键失败：BomImportContractError 点名分桶与行，不逃逸裸异常', async () => {
    const unreachable: BomLocalAdapter = {
      name: 'wa-sqlite',
      transaction: () => Promise.reject(new Error('结构违约应在读库之前拒绝'))
    };
    for (const lotCodes of [5, '{oops']) {
      const payload = serialize([{ table: 'occurrence', values: [occurrenceRow({ lotCodes })] }]);
      await expect(importBomDraft(unreachable, payload)).rejects.toThrow(BomImportContractError);
      await expect(importBomDraft(unreachable, payload)).rejects.toThrow(/occurrences\[0\].*lotCodes/);
    }
  });
});

/* ------------------------------------------------------------------ 导入校验 */

describe('US-521 导入校验（import-contract.validateImportRecords）', () => {
  it('完整批 + 空库 → 通过（AC#7 的草稿入口前提）', () => {
    expect(validate(validBatch())).toEqual({ ok: true, diagnostics: [] });
    expect(validate([])).toEqual({ ok: true, diagnostics: [] });
  });

  it('AC#11 同一条记录重复出现两次 → 两条都失败（duplicate_key），不静默去重', () => {
    const batch = validBatch();
    batch.push(occurrenceOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'o-ab'));
    const result = validate(batch);
    expect(result.ok).toBe(false);
    const duplicates = result.diagnostics.filter(diagnostic => diagnostic.message.includes('duplicate_key'));
    expect(duplicates).toHaveLength(2);
    expect(duplicates[0].naturalKey).toBe(duplicates[1].naturalKey);
    expect(duplicates[0].message).toBe(duplicates[1].message);
    expect(duplicates[0].message).toContain('o-ab');
    assertOrderIndependent(batch, emptyExisting());
  });

  it('AC#10 两条记录自然键相同、qty 分别为 1 与 2 → 两条都失败并列出双方 source_ref', () => {
    const batch = [...validBatch(), occurrenceOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'q-2', { qty: '2' })];
    const result = validate(batch);
    expect(result.ok).toBe(false);
    const duplicates = result.diagnostics.filter(diagnostic => diagnostic.message.includes('duplicate_key'));
    expect(duplicates).toHaveLength(2);
    for (const diagnostic of duplicates) {
      expect(diagnostic.message).toContain('o-ab');
      expect(diagnostic.message).toContain('q-2');
    }
    assertOrderIndependent(batch, emptyExisting());
  });

  it('序列下界与批次集合进入发生项自然键，批次集合顺序不改变自然键', () => {
    const old = occurrenceOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'old', { unitTo: 136 });
    const next = occurrenceOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'next', { unitFrom: 137 });
    expect(naturalKeyFor('occurrence', old)).not.toBe(naturalKeyFor('occurrence', next));
    expect(naturalKeyFor('occurrence', { ...old, lotCodes: '["B","A"]' })).toBe(
      naturalKeyFor('occurrence', { ...old, lotCodes: '["A","B","A"]' })
    );
    expect(validate([...validBatch().filter(record => record.kind !== 'occurrence'), old, next]).ok).toBe(true);
  });

  it('AC#13 行引用的头不在本批也不在库 → 依赖缺失；两种行序同诊断', () => {
    const batch = [lineOf('A001', 'RevA', 10, 'l-a')];
    const result = validate(batch);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain('依赖缺失');
    expect(result.diagnostics[0].message).toContain('父头');
    expect(result.diagnostics[0].message).toContain('l-a');
    assertOrderIndependent(batch, emptyExisting());
  });

  it('AC#13 头在本批（即使靠后位置）→ 不报依赖缺失；两种行序同诊断', () => {
    const batch = [
      lineOf('A001', 'RevA', 10, 'l-a'),
      headerOf('A001', 'RevA', 'h-a'),
      revisionOf('A001', 'RevA', 'r-a'),
      itemOf('A001', 'i-a')
    ];
    expect(validate(batch).ok).toBe(true);
    assertOrderIndependent(batch, emptyExisting());
  });

  it('AC#13 头在库内 → 不报依赖缺失（库内键集与自然键同口径）', () => {
    const existing = emptyExisting();
    existing.headers.add(naturalKeyFor('header', headerOf('A001', 'RevA', 'h-a')));
    existing.revisions.add(naturalKeyFor('revision', revisionOf('A001', 'RevA', 'r-a')));
    existing.items.add(naturalKeyFor('item', itemOf('A001', 'i-a')));
    expect(validate([lineOf('A001', 'RevA', 10, 'l-a')], existing).ok).toBe(true);
  });

  it('AC#2 同批 A→B 与 B→A → 自然键靠后的那条失败并报环路径，点名另一条 source_ref', () => {
    const batch = twoWayBatch();
    const result = validate(batch);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    const diagnostic = result.diagnostics[0];
    expect(diagnostic.kind).toBe('occurrence');
    // 失败的是自然键靠后的 o-ba（键含父件 B001，码元序大于 A001）
    expect(diagnostic.naturalKey).toBe(
      naturalKeyFor('occurrence', occurrenceOf('B001', 'RevA', 10, '2024-01-01', 'A001', 'o-ba'))
    );
    expect(diagnostic.message).toContain('环违约');
    expect(diagnostic.message).toContain('B001 → A001 → B001');
    expect(diagnostic.message).toContain('o-ab');
    assertOrderIndependent(batch, emptyExisting());
  });

  it('AC#2 与库内边成环 → 拒绝并给环路径', () => {
    const existing = emptyExisting();
    existing.occurrences.add(
      naturalKeyFor('occurrence', occurrenceOf('B001', 'RevA', 10, '2024-01-01', 'A001', 'lib-ba'))
    );
    const result = validate(validBatch(), existing);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].message).toContain('A001 → B001 → A001');
    assertOrderIndependent(validBatch(), existing);
  });

  it('AC#2 自环拒绝并报路径', () => {
    const batch = [...validBatch(), occurrenceOf('A001', 'RevA', 10, '2024-02-01', 'A001', 'o-aa')];
    const result = validate(batch);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some(diagnostic => diagnostic.message.includes('自环'))).toBe(true);
    expect(result.diagnostics.some(diagnostic => diagnostic.message.includes('A001 → A001'))).toBe(true);
  });

  it('flow_direction 非 consume 的边不入判环图（US-513）', () => {
    const batch = [
      ...twoWayBatch().slice(0, 8),
      occurrenceOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'o-ab', { flowDirection: 'by_product' }),
      occurrenceOf('B001', 'RevA', 10, '2024-01-01', 'A001', 'o-ba')
    ];
    expect(validate(batch).ok).toBe(true);
  });

  it('AC#5 两处失败全报，诊断按自然键排序（与输入顺序无关）', () => {
    // 输入顺序：B 行在前、A 行在后；按自然键应输出 A 行在前
    const batch = [lineOf('B001', 'RevA', 10, 'l-b'), lineOf('A001', 'RevA', 10, 'l-a')];
    const result = validate(batch);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0].naturalKey < result.diagnostics[1].naturalKey).toBe(true);
    expect(result.diagnostics[0].naturalKey).toContain('A001');
    expect(result.diagnostics[1].naturalKey).toContain('B001');
    expect(result.diagnostics[0].message).toContain('l-a');
    expect(result.diagnostics[1].message).toContain('l-b');
    assertOrderIndependent(batch, emptyExisting());
  });

  it('AC#15 位号子表随发生项进批（依赖存在即通过；位号计数不在导入时判）', () => {
    const batch = [
      ...validBatch(),
      designatorOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'R1', 'd-1'),
      designatorOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'R2', 'd-2')
    ];
    expect(validate(batch).ok).toBe(true);
  });

  it('AC#15 位号引用不在本批也不在库的发生项 → 依赖缺失', () => {
    const batch = [designatorOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'R1', 'd-1')];
    const result = validate(batch);
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].message).toContain('父发生项');
  });

  it('依赖缺失按层分别点名（修订缺物料 / 头缺修订）', () => {
    const result = validate([revisionOf('A001', 'RevA', 'r-a'), headerOf('B001', 'RevA', 'h-b')]);
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics.some(diagnostic => diagnostic.message.includes('父物料'))).toBe(true);
    expect(result.diagnostics.some(diagnostic => diagnostic.message.includes('父修订'))).toBe(true);
  });
});

for (const backend of ['wa-sqlite', 'pglite'] satisfies BomTestBackend[]) {
  describe(`US-521 原子导入与快照导出 [${backend}]`, () => {
    it('AC#5/#6/#14：逐行收集结构与存储错误，千行整批回滚且诊断与行序无关', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const batch: Record<string, unknown>[] = Array.from({ length: 1000 }, (_, index) => ({
          kind: 'item',
          source_ref: `row-${index}`,
          itemNo: `I-${index}`
        }));
        batch[9]['unitPrice'] = 1.25;
        batch[499]['uomConversion'] = '-1';
        const forward = await importBomDraft(adapter, batch);
        const reverse = await importBomDraft(adapter, [...batch].reverse());
        expect(forward.committed).toBe(false);
        expect(forward.diagnostics).toEqual(reverse.diagnostics);
        expect(forward.diagnostics).toHaveLength(2);
        expect(forward.diagnostics.map(row => row.message).join('|')).toMatch(/row-9/);
        expect(forward.diagnostics.map(row => row.message).join('|')).toMatch(/row-499/);
        const result = await adapter.rawQuery(`SELECT COUNT(*) FROM ${bomSqlDialectFor(backend).table('item')}`);
        expect(Number(result.rows[0][0])).toBe(0);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    }, 60000);

    it('AC#7/#15：导入保留草稿，99 位号可导入但发布 qty100 被拒绝', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const batch = validBatch().map(record =>
          record.kind === 'revision' ? { ...record, effectiveFrom: '2099-01-01' } : record
        );
        const occurrence = batch.find(record => record.kind === 'occurrence')!;
        occurrence['qty'] = '100';
        occurrence['designatorManaged'] = true;
        for (let index = 0; index < 99; index += 1) {
          batch.push(designatorOf('A001', 'RevA', 10, '2024-01-01', 'B001', `R${index}`, `d-${index}`));
        }
        const imported = await importBomDraft(adapter, batch);
        expect(imported.committed).toBe(true);
        expect(imported.headerIds).toHaveLength(1);
        const header = (await adapter.getRepository(BomHeader).find({ where: { combinator: 'and', rules: [] } }))[0];
        expect(header.state).toBe('draft');
        const revisions = await adapter
          .getRepository(BomItemRevision)
          .find({ where: { combinator: 'and', rules: [] } });
        expect(revisions.every(revision => revision.state === 'draft')).toBe(true);
        for (const revision of revisions)
          await adapter.getRepository(BomItemRevision).update(revision, { state: 'released' });
        await expect(adapter.getRepository(BomHeader).update(header, { state: 'released' })).rejects.toThrow(
          /99.*100|100.*99/
        );
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });

    it('AC#2/#10/#12：成对环与重复自然键诊断确定，错误批不留数据', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const batch = [...twoWayBatch(), itemOf('DUP', 'duplicate-a'), itemOf('DUP', 'duplicate-b')];
        const forward = await importBomDraft(adapter, batch);
        const reverse = await importBomDraft(adapter, [...batch].reverse());
        expect(forward).toEqual(reverse);
        expect(forward.committed).toBe(false);
        expect(forward.diagnostics).toHaveLength(3);
        const cycle = forward.diagnostics.find(row => row.message.includes('环'))!;
        expect(cycle.message).toContain('o-ab');
        expect(cycle.message).toContain('o-ba');
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });

    it('AC#6：存储层区间重叠诊断使用源记录身份，两种行序逐字一致', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const batch = [...validBatch(), occurrenceOf('A001', 'RevA', 10, '2024-02-01', 'B001', 'overlap')];
        const forward = await importBomDraft(adapter, batch);
        const reversed = await importBomDraft(adapter, [...batch].reverse());
        expect(forward).toEqual(reversed);
        expect(forward.committed).toBe(false);
        expect(forward.diagnostics).toHaveLength(1);
        expect(forward.diagnostics[0].message).toContain('overlap');
        expect(forward.diagnostics[0].message).toContain('o-ab');
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });

    it('同键记录含 JSON number 时，全部参与者仍报 duplicate_key 且与行序无关', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const batch = [
          ...validBatch(),
          occurrenceOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'numeric-duplicate', { qty: 2 })
        ];
        const result = await importBomDraft(adapter, batch);
        expect(result).toEqual(await importBomDraft(adapter, [...batch].reverse()));
        const duplicates = result.diagnostics.filter(row => row.message.includes('duplicate_key'));
        expect(duplicates).toHaveLength(2);
        expect(duplicates.map(row => row.message).join('|')).toMatch(/o-ab/);
        expect(duplicates.map(row => row.message).join('|')).toMatch(/numeric-duplicate/);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });

    it('草稿导入入口拒绝 ECN 标记与既有已发布头的成员写入', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const batch = validBatch();
        const withEcn = batch.map(record =>
          record.kind === 'occurrence' ? { ...record, ecnInId: '00000000-0000-4000-8000-000000000001' } : record
        );
        const rejected = await importBomDraft(adapter, withEcn);
        expect(rejected.committed).toBe(false);
        expect(rejected.diagnostics.some(row => row.message.includes('ECN'))).toBe(true);
        expect((await importBomDraft(adapter, batch)).committed).toBe(true);
        const header = (await adapter.getRepository(BomHeader).find({ where: { combinator: 'and', rules: [] } }))[0];
        await adapter.getRepository(BomHeader).update(header, { state: 'released' });
        const appended = await importBomDraft(adapter, [lineOf('A001', 'RevA', 20, 'append-released')]);
        expect(appended.committed).toBe(false);
        expect(appended.diagnostics[0].message).toMatch(/草稿|已发布/);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });

    it('已落地子表：替代组及成员关联与工序分摊随草稿原子导入', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const batch = validBatch();
        const occurrence = batch.find(record => record.kind === 'occurrence')!;
        occurrence['substituteGroupCode'] = 'G';
        occurrence['substituteRole'] = 'primary';
        occurrence['substitutePriority'] = 1;
        batch.push({
          ...headerOf('A001', 'RevA', 'group'),
          kind: 'substitute_group',
          groupCode: 'G',
          strategy: 'priority'
        });
        batch.push({
          ...occurrenceOf('A001', 'RevA', 10, '2024-01-01', 'B001', 'split'),
          kind: 'operation_split',
          operationSeq: 10,
          ratio: '1'
        });
        const imported = await importBomDraft(adapter, [...batch].reverse());
        expect(imported.committed).toBe(true);
        const dialect = bomSqlDialectFor(backend);
        const result = await adapter.rawQuery(
          `SELECT occ."substituteGroupId", g."code", s."ratio" FROM ${dialect.table('bom_line_occurrence')} occ JOIN ${dialect.table('bom_substitute_group')} g ON g."id" = occ."substituteGroupId" JOIN ${dialect.table('bom_line_operation_split')} s ON s."occurrenceId" = occ."id"`
        );
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].slice(1)).toEqual(['G', '1']);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });

    it('非 consume 发生项可追加位号与工序分摊，库内产出边不参与新增消耗边判环', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const initial = validBatch().map(record =>
          record.kind === 'occurrence' ? { ...record, flowDirection: 'by_product' } : record
        );
        initial.push(lineOf('A001', 'RevA', 20, 'scrap-line'));
        initial.push(occurrenceOf('A001', 'RevA', 20, '2024-01-01', 'B001', 'scrap', { flowDirection: 'scrap_out' }));
        expect((await importBomDraft(adapter, initial)).committed).toBe(true);
        const appended: Record<string, unknown>[] = [
          headerOf('B001', 'RevA', 'reverse-header'),
          lineOf('B001', 'RevA', 10, 'reverse-line'),
          occurrenceOf('B001', 'RevA', 10, '2024-01-01', 'A001', 'reverse-consume')
        ];
        for (const lineNo of [10, 20]) {
          appended.push(
            designatorOf('A001', 'RevA', lineNo, '2024-01-01', 'B001', `D${lineNo}`, `designator-${lineNo}`)
          );
          appended.push({
            ...occurrenceOf('A001', 'RevA', lineNo, '2024-01-01', 'B001', `split-${lineNo}`),
            kind: 'operation_split',
            operationSeq: 10,
            ratio: '1'
          });
        }
        expect(await importBomDraft(adapter, [...appended].reverse())).toMatchObject({
          committed: true,
          diagnostics: []
        });
        const dialect = bomSqlDialectFor(backend);
        const result = await adapter.rawQuery(
          `SELECT occ."flowDirection", d."designator", s."ratio" FROM ${dialect.table('bom_line_occurrence')} occ JOIN ${dialect.table('bom_line_designator')} d ON d."occurrenceId" = occ."id" JOIN ${dialect.table('bom_line_operation_split')} s ON s."occurrenceId" = occ."id" ORDER BY occ."flowDirection"`
        );
        expect(result.rows).toEqual([
          ['by_product', 'D10', '1'],
          ['scrap_out', 'D20', '1']
        ]);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });

    it('真实写入序列只用成功落库的边判环，保存失败的前序边不让后序边背锅', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const batch = twoWayBatch().map(record =>
          record['source_ref'] === 'o-ab' ? { ...record, unitFrom: 0 } : record
        );
        const result = await importBomDraft(adapter, batch);
        expect(result).toEqual(await importBomDraft(adapter, [...batch].reverse()));
        expect(result.committed).toBe(false);
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0].message).toMatch(/o-ab.*unitFrom|o-ab.*序列/);
        expect(result.diagnostics.some(row => row.message.includes('o-ba'))).toBe(false);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });

    it('AC#5/#13：多条缺路线引用在保存点内分别诊断，外层整批回滚', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const batch = validBatch().filter(record => record.kind === 'item' || record.kind === 'revision');
        batch.push({
          ...headerOf('A001', 'RevA', 'missing-routing-1'),
          routingId: '00000000-0000-4000-8000-000000000001'
        });
        batch.push({
          ...headerOf('A001', 'RevA', 'missing-routing-2'),
          alternativeNo: 2,
          routingId: '00000000-0000-4000-8000-000000000002'
        });
        const imported = await importBomDraft(adapter, batch);
        expect(imported.committed).toBe(false);
        expect(imported.diagnostics).toHaveLength(2);
        expect(imported.diagnostics[0].message).toContain('missing-routing-1');
        expect(imported.diagnostics[1].message).toContain('missing-routing-2');
        const result = await adapter.rawQuery(`SELECT COUNT(*) FROM ${bomSqlDialectFor(backend).table('item')}`);
        expect(Number(result.rows[0][0])).toBe(0);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });

    it('手选替代导出补齐组内主件，导入新库后可完整发布', async () => {
      const source = await createBomTestAdapter(backend);
      let destination: Awaited<ReturnType<typeof createBomTestAdapter>> | undefined;
      try {
        const items: BomItem[] = [];
        for (const itemNo of ['ROUND-P', 'ROUND-M', 'ROUND-S']) {
          const item = new BomItem();
          item.itemNo = itemNo;
          await item.save();
          items.push(item);
        }
        await loadHistory(source, {
          batchNo: 'roundtrip-group',
          revisions: items.map(item => ({ itemId: item.id, revisionNo: 'A', effectiveFrom: new Date('2099-01-01') })),
          headers: [
            {
              revisionIndex: 0,
              bomType: 'ebom',
              orgId: 'org-x',
              lines: items.slice(1).map((child, index) => ({
                lineNo: (index + 1) * 10,
                occurrences: [{ childItemId: child.id, qty: '1', effectiveFrom: new Date('2099-01-01') }]
              })),
              substituteGroups: [
                {
                  code: 'G',
                  strategy: 'manual',
                  allowMix: false,
                  members: [
                    { occurrenceIndex: 0, role: 'primary', equivQty: '1' },
                    { occurrenceIndex: 1, role: 'substitute', equivQty: '1' }
                  ]
                }
              ]
            }
          ]
        });
        const payload = await exportBom(
          source,
          {
            bomType: 'ebom',
            orgId: 'org-x',
            asOfDate: new Date('2099-01-02'),
            substituteSelections: { G: { memberKey: items[2].id } }
          },
          { parentItemId: items[0].id }
        );
        expect(payload.requirementLines).toHaveLength(1);
        expect(payload.occurrences).toHaveLength(2);
        destination = await createBomTestAdapter(backend);
        const imported = await importBomDraft(destination, payload);
        expect(imported).toMatchObject({ committed: true, diagnostics: [] });
        for (const revision of await destination
          .getRepository(BomItemRevision)
          .find({ where: { combinator: 'and', rules: [] } })) {
          await destination.getRepository(BomItemRevision).update(revision, { state: 'released' });
        }
        const header = (
          await destination.getRepository(BomHeader).find({ where: { combinator: 'and', rules: [] } })
        )[0];
        await expect(destination.getRepository(BomHeader).update(header, { state: 'released' })).resolves.toBeDefined();
      } finally {
        if (destination !== undefined) await disposeBomTestAdapter(destination);
        await disposeBomTestAdapter(source);
      }
    });

    it('根头选备选 2 时子装配按其唯一已发布头补齐替代组成员；子装配多备选即拒绝导出', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const items: Record<string, BomItem> = {};
        for (const key of ['ALT-R', 'ALT-S', 'ALT-S2', 'ALT-L', 'ALT-P1', 'ALT-P2']) {
          const item = new BomItem();
          item.itemNo = key;
          await item.save();
          items[key] = item;
        }
        const from = new Date('2020-01-01T00:00:00.000Z');
        const line = (lineNo: number, child: BomItem) => ({
          lineNo,
          occurrences: [{ childItemId: child.id, qty: '1', effectiveFrom: from }]
        });
        await loadHistory(adapter, {
          batchNo: 'alt-root-groups',
          revisions: ['ALT-R', 'ALT-S', 'ALT-S2'].map(key => ({
            itemId: items[key].id,
            revisionNo: 'A',
            effectiveFrom: from
          })),
          headers: [
            {
              revisionIndex: 0,
              bomType: 'ebom',
              orgId: 'org-x',
              alternativeNo: 1,
              lines: [line(10, items['ALT-L']), line(20, items['ALT-S2'])]
            },
            {
              revisionIndex: 0,
              bomType: 'ebom',
              orgId: 'org-x',
              alternativeNo: 2,
              lines: [line(10, items['ALT-S']), line(20, items['ALT-P1']), line(30, items['ALT-P2'])],
              substituteGroups: [
                {
                  code: 'G',
                  strategy: 'manual',
                  allowMix: false,
                  members: [
                    { occurrenceIndex: 1, role: 'primary', equivQty: '1' },
                    { occurrenceIndex: 2, role: 'substitute', equivQty: '1' }
                  ]
                }
              ]
            },
            { revisionIndex: 1, bomType: 'ebom', orgId: 'org-x', lines: [line(10, items['ALT-L'])] },
            { revisionIndex: 2, bomType: 'ebom', orgId: 'org-x', alternativeNo: 1, lines: [line(10, items['ALT-L'])] },
            { revisionIndex: 2, bomType: 'ebom', orgId: 'org-x', alternativeNo: 2, lines: [line(10, items['ALT-L'])] }
          ]
        });
        const context = {
          bomType: 'ebom' as const,
          orgId: 'org-x',
          asOfDate: new Date('2021-01-01T00:00:00.000Z'),
          alternativeNo: 2,
          substituteSelections: { G: { memberKey: items['ALT-P2'].id } }
        };
        const payload = await exportBom(adapter, context, { parentItemId: items['ALT-R'].id });
        const childColumn = EXPORT_TABLE_COLUMNS.occurrence.indexOf('childItemNo');
        expect((payload.occurrences as unknown[][]).map(row => row[childColumn]).sort()).toEqual(
          ['ALT-L', 'ALT-P1', 'ALT-P2', 'ALT-S'].sort()
        );
        expect(payload.headers).toHaveLength(2);
        // 备选 1 下挂的子装配 ALT-S2 有两个已发布备选头：alternativeNo 只裁决根头，导出按不完整结构拒绝
        await expect(
          exportBom(
            adapter,
            { bomType: 'ebom', orgId: 'org-x', asOfDate: context.asOfDate, alternativeNo: 1 },
            { parentItemId: items['ALT-R'].id }
          )
        ).rejects.toThrow(/备选|候选|alternativeNo/);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });

    it('AC#3/#4/#8/#9/#14：导出数量与主数据同快照，供料标记不改变需求且两次完全一致', async () => {
      const adapter = await createBomTestAdapter(backend);
      try {
        const parent = new BomItem();
        parent.itemNo = 'EXPORT-P';
        await parent.save();
        const child = new BomItem();
        child.itemNo = 'EXPORT-C';
        child.uomDecimals = 40;
        await child.save();
        const qty = '1.234567890123456789012345678901234';
        await loadHistory(adapter, {
          batchNo: 'export-batch',
          revisions: [{ itemId: parent.id, revisionNo: 'A', effectiveFrom: new Date('2020-01-01') }],
          headers: [
            {
              revisionIndex: 0,
              bomType: 'ebom',
              orgId: 'org-x',
              lines: [
                {
                  lineNo: 10,
                  occurrences: [
                    { childItemId: child.id, qty, supplyToVendor: true, effectiveFrom: new Date('2020-01-01') }
                  ]
                }
              ]
            }
          ]
        });
        const context = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: new Date('2021-01-01') };
        const options = { plannedQty: { value: '1', uom: 'pcs' } };
        const target = { parentItemId: parent.id };
        const marked = await exportBom(adapter, context, target, options);
        expect(marked.requirementLines).toHaveLength(1);
        expect(marked.requirementLines[0].qty).toBe(qty);
        const field = EXPORT_TABLE_COLUMNS.occurrence.indexOf('supplyToVendor');
        expect((marked.occurrences[0] as unknown[])[field]).toBe(true);
        expect((marked.occurrences[0] as unknown[])[EXPORT_TABLE_COLUMNS.occurrence.indexOf('qty')]).toBe(qty);
        expect(JSON.stringify(await exportBom(adapter, context, target, options))).toBe(JSON.stringify(marked));
        await expect(exportBom(adapter, context, target, { ...options, budgets: { depth: 0 } })).rejects.toThrow(
          /截断/
        );
        const foreign = await exportBom(adapter, { ...context, orgId: 'org-other' }, target, options).catch(() => null);
        expect(foreign === null || foreign.headers.length === 0).toBe(true);
      } finally {
        await disposeBomTestAdapter(adapter);
      }
    });
  });
}
