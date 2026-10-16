/**
 * @fileoverview US-521 ERP/MRP 集成契约的纯函数级测试（导出契约 + 导入解析/校验）
 *
 * 不接事务/执行面：只测契约形状（AC#1）、导出拒绝（AC#8）、十进制字段规则（AC#14）、
 * 导入三类预检——重复（AC#10/#11）、依赖缺失（AC#13）、环诊断（AC#2/#12），以及
 * 诊断与输入行序无关（AC#5/#6）。两种行序的断言用「诊断集合相等」而非数组相等。
 */

import { describe, expect, it } from 'vitest';
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
import { BomDecimalFormatError } from '../types.js';

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
      expect(parsed.parts).toEqual(Object.values(data).map(value => String(value)));
    }
    expect(() => parseNaturalKey('垃圾文本')).toThrow(BomImportContractError);
    expect(() => parseNaturalKey('["bogus"]')).toThrow(BomImportContractError);
  });

  it('DECIMAL_FIELDS 清单即契约', () => {
    expect([...DECIMAL_FIELDS]).toEqual([
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
