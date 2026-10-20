/**
 * @fileoverview ERP/MRP 批量导入契约（US-521 导入段）
 *
 * 载荷是已解析的 JSON 记录数组（调用方先 `JSON.parse`），每条记录对应一行存储行，只覆盖
 * 导入 `draft` 头所需的物料、修订、头、逻辑行、替代组、发生项、位号与工序分摊。
 * 替代组成员由发生项的组引用与成员属性承载。各层自然键 = 父对象自然键 + 本层标识列，
 * 以 JSON 数组文本编码（无歧义、可解析回各段）；记录去冗余地把祖先身份列铺平携带。
 *
 * 本模块只做三类预检：自然键重复（AC#10/#11）、父记录依赖缺失（AC#13）、环违约（AC#2/#12）。
 * 应用层不复刻存储层规则（US-521 技术笔记「逐行诊断与原子回滚」）：十进制格式触发器、外键、
 * 区间排他、写入协议等其余违约由事务门面按「实体依赖层排序 + 逐行 SAVEPOINT」的写入循环判定。
 * 诊断只按自然键点名（消息内带 `source_ref`，不按行号），全部收集后按自然键排序输出，
 * 与输入行序无关（AC#5/#6/#10/#12）。
 */

import { BomError } from '../types.js';

/** 导入记录层（与导出契约的同名层一一对应，见 export-contract.ts）。 */
export const IMPORT_KINDS = [
  'item',
  'revision',
  'header',
  'line',
  'substitute_group',
  'occurrence',
  'designator',
  'operation_split'
] as const;

/** 导入记录层。 */
export type ImportKind = (typeof IMPORT_KINDS)[number];

/**
 * 十进制字段清单（US-511 十进制值合同）：出现在记录里就必须是字符串，收到 JSON number 即拒绝
 * （AC#14——精度已在调用方的解析里丢失，不能装作没丢）；`null` 放行（可空字段）。
 * `ratio` 属 US-520 工序分摊子表。
 */
export const DECIMAL_FIELDS = [
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
] as const;

/** 导入记录里的日期列（生效区间两端）：同一日期契约（{@link importDate}）。 */
const DATE_FIELDS = ['effectiveFrom', 'effectiveTo'] as const;

/** 导入契约违约（结构校验 / 自然键构造失败）；消息点名记录下标与字段。 */
export class BomImportContractError extends BomError {
  constructor(
    /** 违约点（如 `records[3].qty` 或 `naturalKey(revision).itemNo`）。 */
    readonly subject: string,
    readonly detail: string
  ) {
    super(`导入契约违约（${subject}）：${detail}`, 'BomImportContractError');
  }
}

/** 各层自然键的标识列（按序：祖先身份段在前，本层标识列在后）。 */
const KEY_SEGMENT_FIELDS: Record<ImportKind, readonly string[]> = {
  item: ['itemNo'],
  revision: ['itemNo', 'revisionNo'],
  header: ['itemNo', 'revisionNo', 'bomType', 'orgId', 'alternativeNo'],
  line: ['itemNo', 'revisionNo', 'bomType', 'orgId', 'alternativeNo', 'lineNo'],
  substitute_group: ['itemNo', 'revisionNo', 'bomType', 'orgId', 'alternativeNo', 'groupCode'],
  occurrence: [
    'itemNo',
    'revisionNo',
    'bomType',
    'orgId',
    'alternativeNo',
    'lineNo',
    'effectiveFrom',
    'childItemNo',
    'unitFrom',
    'lotCodes'
  ],
  designator: [
    'itemNo',
    'revisionNo',
    'bomType',
    'orgId',
    'alternativeNo',
    'lineNo',
    'effectiveFrom',
    'childItemNo',
    'unitFrom',
    'lotCodes',
    'designator'
  ],
  operation_split: [
    'itemNo',
    'revisionNo',
    'bomType',
    'orgId',
    'alternativeNo',
    'lineNo',
    'effectiveFrom',
    'childItemNo',
    'unitFrom',
    'lotCodes',
    'operationSeq'
  ]
};

/** 把标识列值归一为键段文本（数值列取十进制文本、Date 取 ISO 文本——同值同键）。 */
const normalizeKeySegment = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value));

/** ISO 8601 日期起首（`YYYY-MM-DD`，其后为结尾、`T` 或空格接时刻）。 */
const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}(?:$|[T ])/;

/**
 * 导入契约的日期值：Date，或以 ISO 8601 日期起首的文本，且须解析为有效时刻。
 *
 * @remarks
 * 数值（epoch）等其余形态一律拒绝——`new Date("0")` 在 V8 上静默解析为 2000-01-01，
 * 非法文本则在 `toISOString()` 处抛裸 RangeError；两者都不能带进自然键与存储。
 *
 * @param subject - 违约点（如 `records[3].effectiveTo`）
 * @param value - 日期值
 * @returns 有效时刻
 * @throws {@link BomImportContractError} 非 Date / 非 ISO 日期文本 / 无效时刻
 */
export const importDate = (subject: string, value: unknown): Date => {
  const date =
    value instanceof Date ? value
    : typeof value === 'string' && ISO_DATE_PREFIX.test(value) ? new Date(value)
    : null;
  if (date === null || Number.isNaN(date.getTime())) {
    const shown =
      typeof value === 'string' ? JSON.stringify(value)
      : value instanceof Date ? 'Invalid Date'
      : typeof value;
    throw new BomImportContractError(subject, `必须是 ISO 8601 日期文本或 Date，收到 ${shown}`);
  }
  return date;
};

/** 批次集合键段：存储文本（JSON 数组）或数组，须是字符串数组（与解析侧 parseLotCodes 同口径）；去重排序。 */
const lotCodesSegment = (kind: ImportKind, value: unknown): string => {
  if (value === undefined || value === null) return '';
  const subject = `naturalKey(${kind}).lotCodes`;
  let codes: unknown = value;
  if (typeof value === 'string') {
    try {
      codes = JSON.parse(value);
    } catch {
      throw new BomImportContractError(subject, `批次集合不是合法 JSON 数组文本：${value}`);
    }
  }
  if (!Array.isArray(codes) || codes.some(code => typeof code !== 'string')) {
    throw new BomImportContractError(subject, `批次集合必须是字符串数组，收到 ${JSON.stringify(value)}`);
  }
  return JSON.stringify([...new Set(codes as string[])].sort());
};

/**
 * 按「父键 + 标识列」构造自然键（JSON 数组文本，如 `["revision","A001","RevA"]`）。
 *
 * @param kind - 记录层
 * @param data - 记录数据（须携带本层全部标识列）
 * @returns 自然键文本
 *
 * @throws {@link BomImportContractError} 标识列缺失或为空、批次集合不是字符串数组、生效日不是有效日期
 *   （点名自然键与字段，不逃逸 TypeError / SyntaxError / RangeError）
 *
 * @remarks 库内已有键集（{@link ExistingBomKeySets}）也用本函数构造，保证同口径可比。
 */
export const naturalKeyFor = (kind: ImportKind, data: Record<string, unknown>): string => {
  const segments = KEY_SEGMENT_FIELDS[kind].map(field => {
    const value = data[field];
    if (field === 'unitFrom') return value == null ? '' : String(value);
    if (field === 'lotCodes') return lotCodesSegment(kind, value);
    if (value === undefined || value === null || (typeof value === 'string' && value.length === 0)) {
      throw new BomImportContractError(`naturalKey(${kind}).${field}`, '自然键组成列缺失或为空');
    }
    return field === 'effectiveFrom' ?
        importDate(`naturalKey(${kind}).${field}`, value).toISOString()
      : normalizeKeySegment(value);
  });
  return JSON.stringify([kind, ...segments]);
};

/**
 * 把自然键文本解析回层与标识列段（{@link naturalKeyFor} 的逆操作；
 * 判环时从库内键集还原物料边用）。
 *
 * @param key - 自然键文本
 * @returns 层与标识列段（不含层名本身）
 *
 * @throws {@link BomImportContractError} 不是本契约产出的自然键文本
 */
export const parseNaturalKey = (key: string): { kind: ImportKind; parts: string[] } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(key);
  } catch {
    throw new BomImportContractError('naturalKey', `无法解析自然键文本：${key}`);
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new BomImportContractError('naturalKey', `自然键必须是 JSON 数组文本：${key}`);
  }
  const [kindValue, ...rest] = parsed;
  if (typeof kindValue !== 'string' || !(IMPORT_KINDS as readonly string[]).includes(kindValue)) {
    throw new BomImportContractError('naturalKey', `未知记录层：${JSON.stringify(kindValue)}`);
  }
  const kind = kindValue as ImportKind;
  if (rest.length !== KEY_SEGMENT_FIELDS[kind].length || !rest.every(part => typeof part === 'string')) {
    throw new BomImportContractError('naturalKey', `段数与 ${kind} 层契约不符：${key}`);
  }
  return { kind, parts: rest as string[] };
};

/** 一条已解析的导入记录：层 + 自然键 + 原始数据（含 `source_ref`）。 */
export interface ImportRecord {
  kind: ImportKind;
  naturalKey: string;
  data: Record<string, unknown>;
}

/**
 * 解析并结构校验导入载荷（已 `JSON.parse` 的 JSON 值）。
 *
 * 结构校验：记录数组；`kind` 合法；`source_ref` 必带（稳定源记录标识，诊断按它点名，
 * 不按行号）；自然键标识列必填（数值列须是有限整数或文本）；十进制字段（{@link DECIMAL_FIELDS}）
 * 收到 JSON number / boolean 等非字符串即拒绝，`null` 放行（可空字段）；生效区间两端须是有效日期
 * （{@link importDate}）；批次集合须是字符串数组。
 * 字符串值原样保留、不做规范化——规范判定只来自存储层触发器，应用层不复刻（US-521 技术笔记）。
 *
 * @param payload - 已解析的 JSON 值（记录数组）
 * @returns 已校验的导入记录
 *
 * @throws {@link BomImportContractError} 结构违约（点名记录下标与字段）
 */
export const parseImportPayload = (payload: unknown): ImportRecord[] => {
  if (!Array.isArray(payload)) {
    throw new BomImportContractError('payload', '必须是记录数组（已解析的 JSON）');
  }
  return payload.map((raw, index) => parseImportRecord(raw, index));
};

/** 解析单条记录（`index` 用于违约点名）。 */
const parseImportRecord = (raw: unknown, index: number): ImportRecord => {
  const where = `records[${index}]`;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new BomImportContractError(where, '必须是 JSON 对象');
  }
  const data = raw as Record<string, unknown>;
  const kind = data['kind'];
  if (typeof kind !== 'string' || !(IMPORT_KINDS as readonly string[]).includes(kind)) {
    throw new BomImportContractError(`${where}.kind`, `必须是 ${IMPORT_KINDS.join('/')} 之一`);
  }
  const importKind = kind as ImportKind;
  if (typeof data['source_ref'] !== 'string' || data['source_ref'].length === 0) {
    throw new BomImportContractError(`${where}.source_ref`, '必带非空字符串（稳定源记录标识，诊断按它点名）');
  }
  for (const field of KEY_SEGMENT_FIELDS[importKind]) {
    if (field === 'unitFrom' || field === 'lotCodes') continue;
    const value = data[field];
    if (value === undefined || value === null || (typeof value === 'string' && value.length === 0)) {
      throw new BomImportContractError(`${where}.${field}`, '必填（自然键组成列）');
    }
    if (
      (typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'number' && (!Number.isFinite(value) || !Number.isInteger(value)))
    ) {
      throw new BomImportContractError(`${where}.${field}`, '必须是有限整数或文本');
    }
  }
  for (const field of DECIMAL_FIELDS) {
    if (!(field in data)) continue;
    const value = data[field];
    if (value !== null && typeof value !== 'string') {
      throw new BomImportContractError(
        `${where}.${field}`,
        `十进制字段必须是字符串，收到 ${typeof value}（精度已在调用方的 JSON 解析中丢失，拒绝导入）`
      );
    }
  }
  for (const field of DATE_FIELDS) {
    if (data[field] != null) importDate(`${where}.${field}`, data[field]);
  }
  return { kind: importKind, naturalKey: naturalKeyFor(importKind, data), data };
};

/** 库内已有的自然键集（按层；由事务门面用 {@link naturalKeyFor} 构造，保证同口径）。 */
export interface ExistingBomKeySets {
  items: Set<string>;
  revisions: Set<string>;
  headers: Set<string>;
  lines: Set<string>;
  /** 全部发生项，供位号与工序分摊核对父依赖。 */
  occurrences: Set<string>;
  /** 消耗边的发生项键；未提供时沿用 occurrences 的既有判环合同。 */
  consumeOccurrences?: Set<string>;
}

/** 一条失败诊断：按自然键点名，消息内带 `source_ref`；与输入行序无关。 */
export interface ImportDiagnostic {
  naturalKey: string;
  kind: ImportKind;
  message: string;
}

/** 校验结果：`ok` = 无诊断；诊断已按自然键（再按消息文本）排序，完全确定。 */
export interface ImportValidationResult {
  ok: boolean;
  diagnostics: ImportDiagnostic[];
}

/** 各层的中文名（诊断消息用）。 */
const KIND_TEXT: Record<ImportKind, string> = {
  item: '物料',
  revision: '修订',
  header: '头',
  line: '逻辑行',
  occurrence: '发生项',
  designator: '位号',
  substitute_group: '替代组',
  operation_split: '工序分摊'
};

/** 结构父层（物料为根，无父）。 */
const PARENT_KIND: Record<ImportKind, ImportKind | null> = {
  item: null,
  revision: 'item',
  header: 'revision',
  line: 'header',
  occurrence: 'line',
  designator: 'occurrence',
  substitute_group: 'header',
  operation_split: 'occurrence'
};

/** 取某层的库内键集（父层不会超过 occurrence）。 */
const existingSetOf = (existing: ExistingBomKeySets, kind: ImportKind): Set<string> | null => {
  switch (kind) {
    case 'item':
      return existing.items;
    case 'revision':
      return existing.revisions;
    case 'header':
      return existing.headers;
    case 'line':
      return existing.lines;
    case 'occurrence':
      return existing.occurrences;
    case 'designator':
    case 'substitute_group':
    case 'operation_split':
      return null;
  }
};

/** 记录的结构父引用（根层为 null）。 */
const parentRefOf = (record: ImportRecord): { kind: ImportKind; key: string } | null => {
  const parentKind = PARENT_KIND[record.kind];
  if (parentKind === null) return null;
  return { kind: parentKind, key: naturalKeyFor(parentKind, record.data) };
};

/** 记录的 `source_ref`（parse 已保证非空字符串）。 */
const refOf = (record: ImportRecord): string => String(record.data['source_ref']);

/** 把边属主（批内记录自然键）还原为 `source_ref`。 */
const refOfOwner = (byKey: Map<string, ImportRecord[]>, owner: string): string => {
  const ownerRecords = byKey.get(owner);
  if (ownerRecords === undefined || ownerRecords.length === 0) {
    throw new BomImportContractError('cycle', `边属主 ${owner} 不在本批记录中（契约破坏）`);
  }
  return refOf(ownerRecords[0]);
};

/** 判环图的一条边（`owner`：库内边为 null，批内边为该记录的自然键）。 */
interface GraphEdge {
  to: string;
  owner: string | null;
}

const addGraphEdge = (graph: Map<string, GraphEdge[]>, from: string, to: string, owner: string | null): void => {
  const edges = graph.get(from);
  if (edges) edges.push({ to, owner });
  else graph.set(from, [{ to, owner }]);
};

/** 文本比较（码元序，确定性）。 */
const compareText = (a: string, b: string): number =>
  a < b ? -1
  : a > b ? 1
  : 0;

const duplicateIdentity = (record: ImportRecord): string => {
  if (!['occurrence', 'designator', 'operation_split'].includes(record.kind)) return record.naturalKey;
  const { parts } = parseNaturalKey(record.naturalKey);
  const childIndex = KEY_SEGMENT_FIELDS[record.kind].indexOf('childItemNo');
  return JSON.stringify([record.kind, ...parts.filter((_, index) => index !== childIndex)]);
};

/** 出边按（目标、属主）排序：DFS 选路与图构造顺序无关（诊断确定性）。 */
const sortedEdgesOf = (graph: Map<string, GraphEdge[]>, node: string): GraphEdge[] =>
  (graph.get(node) ?? []).slice().sort((a, b) => compareText(a.to, b.to) || compareText(a.owner ?? '', b.owner ?? ''));

/**
 * 沿父指针回溯 `start → target` 的节点路径与路径上各边的属主（不可达为 null）。
 */
const tracePath = (
  parent: Map<string, string>,
  edgeOwner: Map<string, string | null>,
  start: string,
  target: string
): { nodes: string[]; owners: (string | null)[] } | null => {
  const nodes: string[] = [target];
  let current = target;
  while (current !== start) {
    const previous = parent.get(current);
    if (previous === undefined) return null;
    nodes.push(previous);
    current = previous;
  }
  nodes.reverse();
  const owners: (string | null)[] = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    owners.push(edgeOwner.get(nodes[index + 1]) ?? null);
  }
  return { nodes, owners };
};

/**
 * 从 `start` 到 `target` 的确定性 DFS（迭代栈，深链不爆调用栈）。
 *
 * @returns 节点路径与路径上各边属主；不可达为 null
 */
const findGraphPath = (
  graph: Map<string, GraphEdge[]>,
  start: string,
  target: string
): { nodes: string[]; owners: (string | null)[] } | null => {
  const stack: string[] = [start];
  const visited = new Set<string>([start]);
  const parent = new Map<string, string>();
  const edgeOwner = new Map<string, string | null>();
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    for (const edge of sortedEdgesOf(graph, node)) {
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      parent.set(edge.to, node);
      edgeOwner.set(edge.to, edge.owner);
      if (edge.to === target) {
        return tracePath(parent, edgeOwner, start, target);
      }
      stack.push(edge.to);
    }
  }
  return null;
};

/**
 * 校验一批导入记录（重复 / 依赖缺失 / 环三类预检），返回**全部**失败行的诊断。
 *
 * - 重复：自然键相同的多条记录（无论载荷同否）**全部**记 `duplicate_key`，不进写入序列（AC#10/#11）；
 * - 依赖缺失：父记录既不在本批也不在库（AC#13，US-521 口径只看「本批 ∪ 库」）；
 * - 环：对整批 + 库内并集图按确定性写入序列逐边模拟（AC#2/#12）——生效的发生项按自然键
 *   升序入图，入图即成环的那条记环诊断（路径 + 与之冲突记录的 `source_ref`）；自环直接拒绝；
 *   `flow_direction` 非 consume 的边不入图（US-513）。
 *
 * 确定性口径（US-521 技术笔记「诊断的确定性」）：重复组与依赖失败者不进写入序列，其边不参与
 * 判环（存储层同样写不进去）；父记录在本批但因重复 / 自身依赖失败而不入序列时，本函数不重复
 * 诊断，由事务门面 SAVEPOINT 循环按存储层拒绝报出。诊断全部收集后按自然键（再按消息文本）排序
 * 输出，与输入行序无关。
 *
 * @param records - 已解析的导入记录（{@link parseImportPayload} 产出）
 * @param existing - 库内已有自然键集
 * @returns 校验结果（`ok` = 无诊断，可整批提交）
 */
export const validateImportRecords = (
  records: ImportRecord[],
  existing: ExistingBomKeySets
): ImportValidationResult => {
  const diagnostics: ImportDiagnostic[] = [];
  const byKey = new Map<string, ImportRecord[]>();
  for (const record of records) {
    const group = byKey.get(record.naturalKey);
    if (group) group.push(record);
    else byKey.set(record.naturalKey, [record]);
  }
  const diagnosed = new Set<ImportRecord>();

  // 1. 自然键重复：组内全部失败，不挑赢家（AC#10/#11）
  const byIdentity = new Map<string, ImportRecord[]>();
  for (const record of records) {
    const key = duplicateIdentity(record);
    const group = byIdentity.get(key);
    if (group === undefined) byIdentity.set(key, [record]);
    else group.push(record);
  }
  for (const group of byIdentity.values()) {
    if (group.length < 2) continue;
    const refs = [...new Set(group.map(refOf))].sort();
    for (const record of group) {
      diagnostics.push({
        naturalKey: record.naturalKey,
        kind: record.kind,
        message: `source_ref ${refOf(record)}：重复自然键（duplicate_key），全部参与者 source_ref：${refs.join('、')}`
      });
      diagnosed.add(record);
    }
  }

  // 2. 依赖缺失：父记录不在本批也不在库（AC#13）
  for (const record of records) {
    if (diagnosed.has(record)) continue;
    const parent = parentRefOf(record);
    if (parent === null) continue;
    const librarySet = existingSetOf(existing, parent.kind);
    if (librarySet === null || byKey.has(parent.key) || librarySet.has(parent.key)) continue;
    diagnostics.push({
      naturalKey: record.naturalKey,
      kind: record.kind,
      message: `source_ref ${refOf(record)}：依赖缺失，父${KIND_TEXT[parent.kind]}自然键 ${parent.key} 不在本批也不在库`
    });
    diagnosed.add(record);
  }

  // 3. 生效集：按实体依赖层（物料 → 修订 → 头 → 逻辑行 → 发生项 → 位号）判定写入序列的参与者
  const effective: Record<ImportKind, Set<string>> = {
    item: new Set(),
    revision: new Set(),
    header: new Set(),
    line: new Set(),
    occurrence: new Set(),
    designator: new Set(),
    substitute_group: new Set(),
    operation_split: new Set()
  };
  for (const kind of IMPORT_KINDS) {
    for (const record of records) {
      if (record.kind !== kind || diagnosed.has(record)) continue;
      const parent = parentRefOf(record);
      const librarySet = parent === null ? null : existingSetOf(existing, parent.kind);
      if (
        parent === null ||
        effective[parent.kind].has(parent.key) ||
        (librarySet !== null && librarySet.has(parent.key))
      ) {
        effective[kind].add(record.naturalKey);
      }
    }
  }

  // 4. 环（AC#2/#12）：库内边 + 生效批内边，按自然键升序模拟确定性写入序列
  const occurrenceRecords = records
    .filter(record => record.kind === 'occurrence' && effective.occurrence.has(record.naturalKey))
    .sort((a, b) => compareText(a.naturalKey, b.naturalKey));
  const occurrenceItemNoIndex = KEY_SEGMENT_FIELDS.occurrence.indexOf('itemNo');
  const occurrenceChildIndex = KEY_SEGMENT_FIELDS.occurrence.indexOf('childItemNo');
  const graphs = new Map<string, Map<string, GraphEdge[]>>();
  const graphFor = (bomType: string, orgId: string): Map<string, GraphEdge[]> => {
    const key = JSON.stringify([bomType, orgId]);
    let graph = graphs.get(key);
    if (graph === undefined) {
      graph = new Map();
      graphs.set(key, graph);
    }
    return graph;
  };
  for (const key of existing.consumeOccurrences ?? existing.occurrences) {
    const { kind, parts } = parseNaturalKey(key);
    if (kind !== 'occurrence') {
      throw new BomImportContractError('existing.occurrences', `自然键不是发生项键：${key}`);
    }
    addGraphEdge(graphFor(parts[2], parts[3]), parts[occurrenceItemNoIndex], parts[occurrenceChildIndex], null);
  }
  for (const record of occurrenceRecords) {
    const graph = graphFor(String(record.data['bomType']), String(record.data['orgId']));
    const flowDirection = record.data['flowDirection'] ?? 'consume';
    if (flowDirection !== 'consume') continue;
    const parentItemNo = String(record.data['itemNo']);
    const childItemNo = String(record.data['childItemNo']);
    if (parentItemNo === childItemNo) {
      diagnostics.push({
        naturalKey: record.naturalKey,
        kind: record.kind,
        message: `source_ref ${refOf(record)}：环违约（自环，路径：${parentItemNo} → ${parentItemNo}）`
      });
      continue;
    }
    const found = findGraphPath(graph, childItemNo, parentItemNo);
    if (found !== null) {
      const conflictRefs = [
        ...new Set(
          found.owners.filter((owner): owner is string => owner !== null).map(owner => refOfOwner(byKey, owner))
        )
      ].sort();
      const path = [parentItemNo, ...found.nodes];
      diagnostics.push({
        naturalKey: record.naturalKey,
        kind: record.kind,
        message:
          `source_ref ${refOf(record)}：环违约（路径：${path.join(' → ')}）` +
          (conflictRefs.length > 0 ? `；与 source_ref ${conflictRefs.join('、')} 的边冲突` : '')
      });
    } else {
      addGraphEdge(graph, parentItemNo, childItemNo, record.naturalKey);
    }
  }

  // 5. 收集全部后按自然键（再按消息文本）排序输出（AC#5/#6/#10/#12）
  diagnostics.sort((a, b) => compareText(a.naturalKey, b.naturalKey) || compareText(a.message, b.message));
  return { ok: diagnostics.length === 0, diagnostics };
};
