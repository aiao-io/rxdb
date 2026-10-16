/**
 * @fileoverview BOM 导出契约（US-521 导出段）
 *
 * 稳定、可逐字节复现的导出体：六层主数据按固定列序分桶（列序即契约，ERP/MRP 对接
 * 不靠读源码猜字段），十进制字段按 US-511 十进制值合同以规范十进制串承载。导出只接受
 * 完整结构：展开结果标 `truncated`（US-510）或 `unresolved`（US-508 / US-512 / US-518）
 * 即拒绝（AC#8，与 US-510 AC#11 / US-514 AC#11 同一裁决）。
 *
 * 一次导出的全部读取在同一个快照里完成、`exportedAt` 由调用方给定（本模块不读时钟）——
 * 两次同上下文导出之间无写入时逐字节一致（AC#9）。本模块不接事务/执行面，行批由主会话
 * 的 SELECT（按 {@link EXPORT_TABLE_COLUMNS} 列序）产出后喂入 {@link serializeExportRows}。
 */

import { DECIMAL_CANONICAL_RE } from '../decimal.utils.js';
import { BomDecimalFormatError, BomError } from '../types.js';
import { DECIMAL_FIELDS } from './import-contract.js';

/** 导出契约版本号（进 api-baseline，破坏性变更被门禁拦下，AC#1）。 */
export const EXPORT_CONTRACT_VERSION = '1';

/** 导出层（与导入契约的同名层一一对应，见 import-contract.ts）。 */
export type ExportTable = 'item' | 'revision' | 'header' | 'line' | 'occurrence' | 'designator';

/**
 * 导出体：`version` + 导出时点 + 组织维度（AC#4：`org_id` 在契约里显式）+ resolution
 * manifest（US-508 / AC#9）+ 六层行数组。行是**按 {@link EXPORT_TABLE_COLUMNS} 列序的
 * 位置数组**，十进制字段为规范十进制串。
 */
export interface BomExportPayload {
  version: string;
  exportedAt: string;
  orgId: string;
  manifest: Record<string, unknown>;
  items: unknown[];
  revisions: unknown[];
  headers: unknown[];
  lines: unknown[];
  occurrences: unknown[];
  designators: unknown[];
}

/** 一个层的一批行（主会话按同一层合并多次查询结果后分桶喂入）。 */
export interface ExportRowBatch {
  table: ExportTable;
  values: unknown[][];
}

/**
 * 各层的契约列序（祖先身份列铺平在前、本层数据列在后——与导入契约的扁平记录互逆，
 * 导出体可直接重导）。十进制列 = 本清单与 {@link DECIMAL_FIELDS} 的交集。
 *
 * - `occurrence` 的 `supply_to_vendor`（US-521 AC#3）：只多一个标记、不改展开的路径与
 *   数量，随行进入导出体，采购侧按它筛选即得委外供料清单；
 * - 引用列（如 `routingId`）按 US-521 口径导出：目标库须已有被引用对象，引用不到按依赖
 *   缺失失败（AC#13）；ECN 列、替代组、配置模型等子层首期不经本契约（US-521 范围边界）。
 */
export const EXPORT_TABLE_COLUMNS: Record<ExportTable, readonly string[]> = {
  item: [
    'itemNo',
    'description',
    'serialized',
    'stockUom',
    'uomDecimals',
    'uomConversion',
    'unitPrice',
    'priceUom',
    'priceCurrency',
    'creditPrice',
    'ext'
  ],
  revision: ['itemNo', 'revisionNo', 'state', 'effectiveFrom', 'defaultPhantom', 'historyBatchNo'],
  header: [
    'itemNo',
    'revisionNo',
    'bomType',
    'orgId',
    'alternativeNo',
    'state',
    'baseUom',
    'baseQty',
    'assemblyScrap',
    'assemblyScrapConvention',
    'costLotQty',
    'routingId',
    'historyBatchNo',
    'ext'
  ],
  line: ['itemNo', 'revisionNo', 'bomType', 'orgId', 'alternativeNo', 'lineNo'],
  occurrence: [
    'itemNo',
    'revisionNo',
    'bomType',
    'orgId',
    'alternativeNo',
    'lineNo',
    'effectiveFrom',
    'childItemNo',
    'childRevisionNo',
    'effectiveTo',
    'qty',
    'uom',
    'qtyFormula',
    'formulaGrammarVersion',
    'isFixedQty',
    'tierGroupNo',
    'lotsizeFrom',
    'lotsizeTo',
    'componentScrap',
    'componentScrapConvention',
    'componentScrapFixed',
    'uomConversion',
    'phantomOverride',
    'designatorManaged',
    'supplyToVendor',
    'flowDirection',
    'substituteRole',
    'substitutePriority',
    'usageProbability',
    'equivQty',
    'operationSeq',
    'unitFrom',
    'unitTo',
    'lotCodes',
    'ext'
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
    'designator'
  ]
};

/**
 * 规范十进制串判定（与 {@link DECIMAL_CANONICAL_RE} 同口径——存储层触发器与入口校验
 * 共用同一份定义）：无符号、无指数、无前导零（单个 `0` 除外）、小数无尾随零。
 */
export const isDecimalString = (value: unknown): value is string =>
  typeof value === 'string' && DECIMAL_CANONICAL_RE.test(value);

/** 导出拒绝（截断 / 未解析结构、契约形状违约）。 */
export class BomExportRejectedError extends BomError {
  constructor(readonly detail: string) {
    super(`导出被拒绝：${detail}`, 'BomExportRejectedError');
  }
}

/**
 * 校验展开结果是否可导出（US-521 AC#8）：标 `truncated` 或存在 `unresolved` 即拒绝，
 * 错误点名原因与涉及的行 / 组——截断或未解析的结构交给 MRP 就是一份看起来正常的错误需求。
 *
 * @param expansion - 展开结果（截断标记；`null` = 完整）
 * @param unresolved - 未解析行（各含候选集合）
 *
 * @throws {@link BomExportRejectedError} 结构不完整（truncated / unresolved 齐备时一次全部点名）
 */
export const validateExportReady = (
  expansion: { truncated: { reason: string } | null },
  unresolved: { lineId: string; candidates: unknown[] }[]
): void => {
  const problems: string[] = [];
  if (expansion.truncated != null) {
    problems.push(`展开结果被截断（原因：${expansion.truncated.reason}），截断结构不是完整结构，不得导出`);
  }
  if (unresolved.length > 0) {
    const named = unresolved.map(item => `${item.lineId}（候选 ${item.candidates.length} 项）`).join('、');
    problems.push(`存在未解析行：${named}，须由调用方裁决后重导`);
  }
  if (problems.length > 0) throw new BomExportRejectedError(problems.join('；'));
};

/** 序列化所需的元数据（由调用方给定，本模块不读时钟）。 */
export interface ExportSerializeMeta {
  /** 组织/工厂（AC#4：组织维度在契约里显式）。 */
  orgId: string;
  /** 导出时点（ISO 文本；同上下文无写入时两次导出逐字节一致，AC#9）。 */
  exportedAt: string;
  /** resolution manifest（US-508 / AC#9）。 */
  manifest: Record<string, unknown>;
}

/** 行值归一（Date → ISO 文本；其余原样——十进制的规范串判定在此之前已完成）。 */
const normalizeCell = (value: unknown): unknown => (value instanceof Date ? value.toISOString() : value);

/** 载荷分桶字段名。 */
const BUCKET_OF: Record<
  ExportTable,
  keyof Pick<BomExportPayload, 'items' | 'revisions' | 'headers' | 'lines' | 'occurrences' | 'designators'>
> = {
  item: 'items',
  revision: 'revisions',
  header: 'headers',
  line: 'lines',
  occurrence: 'occurrences',
  designator: 'designators'
};

/** 某层十进制列的列下标（契约列序 ∩ {@link DECIMAL_FIELDS}）。 */
const decimalIndexesOf = (table: ExportTable): number[] => {
  const columns = EXPORT_TABLE_COLUMNS[table];
  const indexes: number[] = [];
  for (let index = 0; index < columns.length; index += 1) {
    if ((DECIMAL_FIELDS as readonly string[]).includes(columns[index])) indexes.push(index);
  }
  return indexes;
};

/**
 * 把各层行批序列化为导出体：按层分桶；行宽必须与契约列宽一致；十进制字段必须是规范
 * 十进制串（可空列 `null` 放行），非规范即抛、点名表与列——契约只产出可信的十进制文本。
 *
 * @param rows - 各层行批（位置数组，列序见 {@link EXPORT_TABLE_COLUMNS}）
 * @param meta - 组织 / 导出时点 / resolution manifest
 * @returns 导出体
 *
 * @throws {@link BomExportRejectedError} 元数据缺失或行宽与契约不符
 * @throws {@link BomDecimalFormatError} 十进制字段非规范串
 */
export const serializeExportRows = (rows: ExportRowBatch[], meta: ExportSerializeMeta): BomExportPayload => {
  if (typeof meta.orgId !== 'string' || meta.orgId.length === 0) {
    throw new BomExportRejectedError('orgId 必填（组织/工厂维度在契约里显式，AC#4）');
  }
  if (typeof meta.exportedAt !== 'string' || meta.exportedAt.length === 0) {
    throw new BomExportRejectedError('exportedAt 必填（ISO 时间文本，由调用方给定以保持确定性）');
  }
  if (typeof meta.manifest !== 'object' || meta.manifest === null || Array.isArray(meta.manifest)) {
    throw new BomExportRejectedError('manifest 必填（resolution manifest 对象）');
  }
  const payload: BomExportPayload = {
    version: EXPORT_CONTRACT_VERSION,
    exportedAt: meta.exportedAt,
    orgId: meta.orgId,
    manifest: meta.manifest,
    items: [],
    revisions: [],
    headers: [],
    lines: [],
    occurrences: [],
    designators: []
  };
  for (const batch of rows) {
    const columns = EXPORT_TABLE_COLUMNS[batch.table];
    const decimalIndexes = decimalIndexesOf(batch.table);
    for (const row of batch.values) {
      if (row.length !== columns.length) {
        throw new BomExportRejectedError(
          `${batch.table} 层行宽 ${row.length} 与契约列宽 ${columns.length} 不符（列：${columns.join(', ')}）`
        );
      }
      for (const index of decimalIndexes) {
        const value = row[index];
        if (value !== null && !isDecimalString(value)) {
          throw new BomDecimalFormatError(
            `${batch.table}.${columns[index]}`,
            `导出值 ${typeof value === 'string' ? JSON.stringify(value) : typeof value} 不是规范十进制串`
          );
        }
      }
    }
    const bucket = payload[BUCKET_OF[batch.table]];
    for (const row of batch.values) bucket.push(row.map(normalizeCell));
  }
  return payload;
};
