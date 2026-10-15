/**
 * @fileoverview EBOM↔MBOM 映射的保存校验、覆盖率与跟进基线（US-516）
 *
 * 保存校验（TS 层）：两侧 `bom_type` / `org_id` 与范围一致（AC#10）；源行必须是范围
 * 成员——从 EBOM 根头出发、逐跳可证明的头链（头链一跳 = 前一行存在某个 consume 发生项、
 * 后一行所在头是该发生项可选到的子件头，不按生效期；precise 行只可达锁定的修订头，
 * AC#12/#15）；路径级映射的 `sourceLinePath` 首元素是根头行、逐级相邻、末元素等于
 * `sourceLineId`（AC#13）。NULL 规则由存储层触发器兜底（AC#9）。
 * 覆盖率（AC#5/#6/#13/#14）与跟进基线/缺口（AC#4/#7/#8/#16~#22）随本文件其余导出。
 */

import type { BomLocalAdapter } from './bom-adapter.js';
import { bomSqlDialectFor } from './bom-sql.js';
import type { ResolutionContext } from './resolution.js';

/** rawQuery 双形状归一。 */
const rawRows = (result: unknown): unknown[][] => {
  const shaped = result as { results?: { rows: unknown[][] }[]; rows?: unknown[][] };
  if (Array.isArray(shaped.results)) return shaped.results[0].rows;
  return shaped.rows ?? [];
};

/** 一条映射的保存输入（scopeId + 六态 + 两侧行 + 可选路径）。 */
export interface MappingSaveInput {
  scopeId: string;
  relation: 'one_to_one' | 'split' | 'merge' | 'added' | 'removed' | 'resequenced';
  sourceLineId?: string | null;
  targetLineId?: string | null;
  sourceLinePath?: string[] | null;
}

/** 范围信息（保存校验与覆盖率共用）。 */
export interface MapScopeInfo {
  scopeId: string;
  orgId: string;
  ebomRootHeaderId: string;
  mbomRootHeaderId: string;
}

/** 映射保存违约。 */
export class BomMapError extends Error {
  constructor(
    readonly subject: string,
    message: string
  ) {
    super(`[rxdb-plugin-bom] 映射违约（${subject}）：${message}`);
    this.name = 'BomMapError';
    Object.setPrototypeOf(this, BomMapError.prototype);
  }
}

/** 读范围。 */
const readScope = async (adapter: BomLocalAdapter, scopeId: string): Promise<MapScopeInfo> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const rows = rawRows(await adapter.rawQuery?.(
    `SELECT "id", "orgId", "ebomRootHeaderId", "mbomRootHeaderId" FROM ${dialect.table('bom_map_scope')} WHERE "id" = '${scopeId}'`
  ));
  if (rows.length === 0) throw new BomMapError('scopeId', `范围不存在：${scopeId}`);
  return {
    scopeId,
    orgId: String(rows[0][1]),
    ebomRootHeaderId: String(rows[0][2]),
    mbomRootHeaderId: String(rows[0][3])
  };
};

/** 行所在头（headerId / bomType / orgId）。 */
const lineHeader = async (
  adapter: BomLocalAdapter,
  lineId: string
): Promise<{ headerId: string; bomType: string; orgId: string }> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const rows = rawRows(await adapter.rawQuery?.(
    `SELECT h."id", h."bomType", h."orgId" FROM ${dialect.table('bom_header')} h JOIN ${dialect.table('bom_line')} l ON l."headerId" = h."id" WHERE l."id" = '${lineId}'`
  ));
  if (rows.length === 0) throw new BomMapError('lineId', `逻辑行不存在：${lineId}`);
  return { headerId: String(rows[0][0]), bomType: String(rows[0][1]), orgId: String(rows[0][2]) };
};

/**
 * 范围成员资格（AC#12/#15）：从 EBOM 根头 BFS，一跳 = 行存在 consume 发生项、
 * 目标头是该发生项可选到的子件头（precise 行只可达锁定的修订头；imprecise 行可达
 * 该物料全部已发布头——物料级并集图剪枝，不按生效期）。返回可达行集合。
 */
const reachableSourceLines = async (
  adapter: BomLocalAdapter,
  scope: MapScopeInfo
): Promise<Set<string>> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const lineTable = dialect.table('bom_line');
  const occurrenceTable = dialect.table('bom_line_occurrence');
  const headerTable = dialect.table('bom_header');
  const revisionTable = dialect.table('item_revision');
  const reachable = new Set<string>();
  const frontier: { headerId: string }[] = [{ headerId: scope.ebomRootHeaderId }];
  const visitedHeaders = new Set<string>([scope.ebomRootHeaderId]);
  while (frontier.length > 0) {
    const current = frontier.shift() as { headerId: string };
    // 本头的全部行（含草稿 ECN 行？成员资格用「已存行」——不按生效期、不过滤 ECN：
    // 行定义是稳定身份；草稿头下的行也算成员（保存期成员资格与解析无关））
    const lineRows = rawRows(await adapter.rawQuery?.(
      `SELECT l."id" FROM ${lineTable} l WHERE l."headerId" = '${current.headerId}'`
    ));
    for (const lineRow of lineRows) {
      const lineId = String(lineRow[0]);
      reachable.add(lineId);
      // 一跳子件头：行发生项（consume）→ 子件头
      const occRows = rawRows(await adapter.rawQuery?.(
        `SELECT occ."childItemId", occ."childRevisionId" FROM ${occurrenceTable} occ WHERE occ."lineId" = '${lineId}' AND occ."flowDirection" = 'consume'`
      ));
      for (const occRow of occRows) {
        const childItemId = String(occRow[0]);
        const childRevisionId = occRow[1] === null ? null : String(occRow[1]);
        const headers = childRevisionId !== null ?
          rawRows(await adapter.rawQuery?.(
            `SELECT h."id" FROM ${headerTable} h JOIN ${revisionTable} r ON r."id" = h."parentRevisionId" WHERE r."itemId" = '${childItemId}' AND r."id" = '${childRevisionId}'`
          ))
        : rawRows(await adapter.rawQuery?.(
          `SELECT h."id" FROM ${headerTable} h JOIN ${revisionTable} r ON r."id" = h."parentRevisionId" WHERE r."itemId" = '${childItemId}' AND r."state" = 'released'`
        ));
        for (const headerRow of headers) {
          const childHeaderId = String(headerRow[0]);
          if (visitedHeaders.has(childHeaderId)) continue;
          visitedHeaders.add(childHeaderId);
          frontier.push({ headerId: childHeaderId });
        }
      }
    }
  }
  return reachable;
};

/**
 * 保存映射（US-516）：两侧类型/组织、范围成员资格、路径相邻与末元素；通过后落库。
 */
export const saveMapping = async (
  adapter: BomLocalAdapter,
  input: MappingSaveInput
): Promise<{ mapId: string }> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const scope = await readScope(adapter, input.scopeId);

  // 两侧类型与组织（AC#10）
  if (input.sourceLineId !== null && input.sourceLineId !== undefined) {
    const source = await lineHeader(adapter, input.sourceLineId);
    if (source.bomType !== 'ebom') {
      throw new BomMapError(`源行 ${input.sourceLineId}`, `所在头类型 ${source.bomType} 不是 EBOM`);
    }
    if (source.orgId !== scope.orgId) {
      throw new BomMapError(`源行 ${input.sourceLineId}`, `所在头组织 ${source.orgId} 与范围 ${scope.orgId} 不符`);
    }
  }
  if (input.targetLineId !== null && input.targetLineId !== undefined) {
    const target = await lineHeader(adapter, input.targetLineId);
    if (target.bomType !== 'mbom') {
      throw new BomMapError(`目标行 ${input.targetLineId}`, `所在头类型 ${target.bomType} 不是 MBOM`);
    }
    if (target.orgId !== scope.orgId) {
      throw new BomMapError(`目标行 ${input.targetLineId}`, `所在头组织 ${target.orgId} 与范围 ${scope.orgId} 不符`);
    }
  }

  // 源侧范围成员资格（AC#12/#15）
  if (input.sourceLineId !== null && input.sourceLineId !== undefined) {
    const reachable = await reachableSourceLines(adapter, scope);
    if (!reachable.has(input.sourceLineId)) {
      throw new BomMapError(`源行 ${input.sourceLineId}`, `不可由范围 EBOM 根头（${scope.ebomRootHeaderId}）到达，不是范围成员`);
    }
  }

  // 路径级映射（AC#13）：首元素是根头行、逐级相邻、末元素 = sourceLineId
  if (input.sourceLinePath !== null && input.sourceLinePath !== undefined && input.sourceLinePath.length > 0) {
    const path = input.sourceLinePath;
    if (input.sourceLineId === null || input.sourceLineId === undefined || path[path.length - 1] !== input.sourceLineId) {
      throw new BomMapError('sourceLinePath', '末元素必须等于 sourceLineId');
    }
    // 首元素所在头必须是范围根头
    const first = await lineHeader(adapter, path[0]);
    if (first.headerId !== scope.ebomRootHeaderId) {
      throw new BomMapError('sourceLinePath', `首元素所在头 ${first.headerId} 不是范围 EBOM 根头 ${scope.ebomRootHeaderId}`);
    }
    // 逐级相邻：前一行存在某个 consume 发生项，后一行所在头是该发生项可选到的子件头
    for (let index = 1; index < path.length; index++) {
      const prevLineId = path[index - 1];
      const nextLineId = path[index];
      const next = await lineHeader(adapter, nextLineId);
      const occRows = rawRows(await adapter.rawQuery?.(
        `SELECT occ."childItemId", occ."childRevisionId" FROM ${dialect.table('bom_line_occurrence')} occ WHERE occ."lineId" = '${prevLineId}' AND occ."flowDirection" = 'consume'`
      ));
      const headerTable = dialect.table('bom_header');
      const revisionTable = dialect.table('item_revision');
      let adjacent = false;
      for (const occRow of occRows) {
        const childItemId = String(occRow[0]);
        const childRevisionId = occRow[1] === null ? null : String(occRow[1]);
        const headers = childRevisionId !== null ?
          rawRows(await adapter.rawQuery?.(
            `SELECT h."id" FROM ${headerTable} h JOIN ${revisionTable} r ON r."id" = h."parentRevisionId" WHERE r."itemId" = '${childItemId}' AND r."id" = '${childRevisionId}'`
          ))
        : rawRows(await adapter.rawQuery?.(
          `SELECT h."id" FROM ${headerTable} h JOIN ${revisionTable} r ON r."id" = h."parentRevisionId" WHERE r."itemId" = '${childItemId}' AND r."state" = 'released'`
        ));
        if (headers.some(row => String(row[0]) === next.headerId)) {
          adjacent = true;
          break;
        }
      }
      if (!adjacent) {
        throw new BomMapError('sourceLinePath', `第 ${index} 跳（${prevLineId} → ${nextLineId}）失去相邻性`);
      }
    }
  }

  // 落库
  const mapTable = dialect.table('bom_map');
  const { BomMap } = await import('../entities.js');
  const mapping = new BomMap();
  mapping.scopeId = input.scopeId;
  mapping.relation = input.relation;
  mapping.sourceLineId = input.sourceLineId ?? null;
  mapping.targetLineId = input.targetLineId ?? null;
  mapping.sourceLinePath = input.sourceLinePath !== null && input.sourceLinePath !== undefined ? JSON.stringify(input.sourceLinePath) : null;
  await mapping.save();
  void mapTable;
  return { mapId: mapping.id };
};

/** 覆盖率结果（AC#5/#6/#13/#14）。 */
export interface MappingCoverageResult {
  scopeId: string;
  /** 已覆盖的（源行, 路径键）对。 */
  covered: { lineId: string; pathKey: string; mappingId: string }[];
  /** 未覆盖的源行与出现路径（未覆盖 ≠ removed，AC#6）。 */
  uncovered: { lineId: string; paths: string[][] }[];
  /** 失效映射：路径失去相邻性或行失去成员资格，不静默算覆盖（AC#13）。 */
  invalid: { mappingId: string; reason: string }[];
}

/** 查某范围的映射行。 */
const readMappings = async (
  adapter: BomLocalAdapter,
  scopeId: string
): Promise<{ id: string; relation: string; sourceLineId: string | null; sourceLinePath: string[] | null }[]> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const rows = rawRows(await adapter.rawQuery?.(
    `SELECT "id", "relation", "sourceLineId", "sourceLinePath" FROM ${dialect.table('bom_map')} WHERE "scopeId" = '${scopeId}'`
  ));
  return rows.map(row => ({
    id: String(row[0]),
    relation: String(row[1]),
    sourceLineId: row[2] === null ? null : String(row[2]),
    sourceLinePath: row[3] === null ? null : (JSON.parse(String(row[3])) as string[])
  }));
};

/** occurrenceId → lineId 映射。 */
const lineIdOfOccurrence = async (adapter: BomLocalAdapter, occurrenceIds: string[]): Promise<Map<string, string>> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const map = new Map<string, string>();
  if (occurrenceIds.length === 0) return map;
  const inList = occurrenceIds.map(id => `'${id}'`).join(', ');
  const rows = rawRows(await adapter.rawQuery?.(
    `SELECT occ."id", occ."lineId" FROM ${dialect.table('bom_line_occurrence')} occ WHERE occ."id" IN (${inList})`
  ));
  for (const row of rows) map.set(String(row[0]), String(row[1]));
  return map;
};

/**
 * 覆盖率查询（AC#5/#6/#13/#14）：展开 EBOM 根，按路径计覆盖——路径级映射只覆盖
 * 那一条路径、行级映射覆盖该逻辑行出现的全部路径；未覆盖报出（不静默视作 removed）；
 * 失去相邻性的路径级映射与失去成员资格的行级映射标「路径失效」。
 */
export const mappingCoverage = async (
  adapter: BomLocalAdapter,
  scopeId: string,
  context: ResolutionContext
): Promise<MappingCoverageResult> => {
  const scope = await readScope(adapter, scopeId);
  const mappings = await readMappings(adapter, scopeId);
  // EBOM 根头的父修订（展开入口）
  const dialect = bomSqlDialectFor(adapter.name);
  const rootRows = rawRows(await adapter.rawQuery?.(
    `SELECT h."parentRevisionId" FROM ${dialect.table('bom_header')} h WHERE h."id" = '${scope.ebomRootHeaderId}'`
  ));
  if (rootRows.length === 0) throw new BomMapError('scope', 'EBOM 根头不存在');
  const rootRevisionId = String(rootRows[0][0]);
  const { expandBom } = await import('./expansion.js');
  let expansion: Awaited<ReturnType<typeof expandBom>>;
  try {
    expansion = await expandBom(adapter, context, { parentRevisionId: rootRevisionId });
  } catch (error) {
    throw new BomMapError('覆盖率', error instanceof Error ? error.message : String(error));
  }
  if (expansion.truncated !== null) {
    throw new BomMapError('覆盖率', `展开触顶（${expansion.truncated.reason}），无法判定覆盖率`);
  }
  // 展开路径 → 行序列（occurrenceId → lineId；节点行 = node.occurrenceId）
  const occurrenceIds = [...new Set(expansion.nodes.flatMap(node => [...node.path, ...(node.occurrenceId ? [node.occurrenceId] : [])]))];
  const lineOfOcc = await lineIdOfOccurrence(adapter, occurrenceIds);
  const linePaths = new Map<string, string[][]>();
  for (const node of expansion.nodes) {
    // node.path 是「根 → 本节点」的完整发生项序列（本节点行在末元素）
    if (node.path.length === 0) continue; // 根节点没有行
    const linePath = node.path.map(occId => lineOfOcc.get(occId) ?? occId);
    const leafLineId = linePath[linePath.length - 1];
    const list = linePaths.get(leafLineId) ?? [];
    list.push(linePath);
    linePaths.set(leafLineId, list);
  }
  // 根头的行（expandBom 不含根头行）：以空前缀路径登记
  const rootLineRows = rawRows(await adapter.rawQuery?.(
    `SELECT l."id" FROM ${dialect.table('bom_line')} l WHERE l."headerId" = '${scope.ebomRootHeaderId}'`
  ));
  for (const row of rootLineRows) {
    const rootLineId = String(row[0]);
    const list = linePaths.get(rootLineId) ?? [];
    list.push([rootLineId]);
    linePaths.set(rootLineId, list);
  }
  // 成员资格（失效判定）
  const reachable = await reachableSourceLines(adapter, scope);
  const covered: MappingCoverageResult['covered'] = [];
  const invalid: MappingCoverageResult['invalid'] = [];
  const coveredLinePaths = new Map<string, Set<string>>();
  for (const mapping of mappings) {
    if (mapping.relation === 'added') continue; // 无源行
    const sourceLineId = mapping.sourceLineId as string;
    if (!reachable.has(sourceLineId)) {
      invalid.push({ mappingId: mapping.id, reason: `源行 ${sourceLineId} 失去范围成员资格（路径失效）` });
      continue;
    }
    const paths = linePaths.get(sourceLineId) ?? [];
    if (mapping.sourceLinePath !== null) {
      const pathKey = mapping.sourceLinePath.join('>');
      // 相邻 = 展开路径以映射路径为前缀（源行以下的子路径不影响相邻性判定）
      const stillAdjacent = paths.some(path => {
        const full = path.join('>');
        return full === pathKey || full.startsWith(`${pathKey}>`);
      });
      if (!stillAdjacent) {
        invalid.push({ mappingId: mapping.id, reason: `路径 ${pathKey} 失去相邻性（路径失效）` });
        continue;
      }
      const set = coveredLinePaths.get(sourceLineId) ?? new Set<string>();
      set.add(pathKey);
      coveredLinePaths.set(sourceLineId, set);
      covered.push({ lineId: sourceLineId, pathKey, mappingId: mapping.id });
    } else {
      for (const path of paths) {
        const pathKey = path.join('>');
        const set = coveredLinePaths.get(sourceLineId) ?? new Set<string>();
        if (set.has(pathKey)) continue; // 同一路径只计一次
        set.add(pathKey);
        coveredLinePaths.set(sourceLineId, set);
        covered.push({ lineId: sourceLineId, pathKey, mappingId: mapping.id });
      }
    }
  }
  // 未覆盖：展开中出现过、但没有任何映射覆盖的（行, 路径）
  const uncovered: MappingCoverageResult['uncovered'] = [];
  for (const [lineId, paths] of linePaths) {
    const coveredKeys = coveredLinePaths.get(lineId) ?? new Set<string>();
    const missing = paths.filter(path => !coveredKeys.has(path.join('>')));
    if (missing.length > 0) {
      uncovered.push({ lineId, paths: missing });
    }
  }
  return { scopeId, covered, uncovered, invalid };
};

/** 一条解析步骤（US-516 基线单元）：(逻辑行, 该行有效发生项, 解析所得修订)。 */
export interface MappingStep {
  lineId: string;
  occurrenceId: string;
  revisionId: string | null;
}

/** 缺口查询结果：一条映射的基线/当前差异。 */
export interface MappingGap {
  mappingId: string;
  relation: string;
  targetLineId: string | null;
  /** 无法判定（unresolved / truncated）：点名那一跳与原因，不算无缺口（AC#22）。 */
  undecidable: { reason: string } | null;
  /** 逐步差异：基线步骤 → 当前步骤（null = 消失；kind = 变化类别）。 */
  differences: { baseline: MappingStep; current: MappingStep | null; kind: 'changed' | 'missing' }[];
  /** 当前新出现（基线没有）的步骤。 */
  appeared: MappingStep[];
}

/** 缺口查询结果集。 */
export interface MappingGapsResult {
  scopeId: string;
  gaps: MappingGap[];
}

/** 从展开结果收集「到源行为止」的解析步骤（行级 = 全部路径并集；路径级 = 一条路径）。 */
const collectSteps = (
  expansion: Awaited<ReturnType<typeof import('./expansion.js')['expandBom']>>,
  lineOfOcc: Map<string, string>,
  sourceLineId: string,
  sourceLinePath: string[] | null
): MappingStep[] => {
  const steps = new Map<string, MappingStep>();
  for (const node of expansion.nodes) {
    if (node.path.length === 0) continue;
    const linePath = node.path.map(occId => lineOfOcc.get(occId) ?? occId);
    // 路径级映射只收集该路径；行级收集全部路径
    if (sourceLinePath !== null) {
      const pathKey = linePath.join('>');
      const targetKey = sourceLinePath.join('>');
      if (pathKey !== targetKey && !pathKey.startsWith(`${targetKey}>`)) continue;
    }
    for (let index = 0; index < node.path.length; index++) {
      const occurrenceId = node.path[index];
      const lineId = linePath[index];
      if (sourceLinePath === null) {
        steps.set(`${lineId}:${occurrenceId}`, { lineId, occurrenceId, revisionId: index === node.path.length - 1 ? node.revisionId : null });
      } else {
        // 路径级：到源行为止（含源行）
        if (lineId === sourceLineId || linePath.slice(0, index).includes(sourceLineId)) {
          steps.set(`${lineId}:${occurrenceId}`, { lineId, occurrenceId, revisionId: null });
        }
      }
    }
  }
  // 根头的行（源行可能是根头行）
  if (sourceLinePath === null) {
    // 行级：根头行没有展开节点——由调用方补充
  }
  return [...steps.values()];
};

/** 根头行的解析步骤（根头行不在展开节点里）。 */
const rootLineSteps = async (
  adapter: BomLocalAdapter,
  scope: MapScopeInfo,
  sourceLineId: string,
  context: ResolutionContext
): Promise<MappingStep[]> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const rows = rawRows(await adapter.rawQuery?.(
    `SELECT occ."id" FROM ${dialect.table('bom_line_occurrence')} occ WHERE occ."lineId" = '${sourceLineId}'`
  ));
  // 发生项按解析上下文过滤：窗口 + ECN 可见性——根头行在展开时已过同样的过滤（expandBom 的
  // 首层）——这里取「评估日窗口内」的发生项（与 expandBom 的首层同口径）
  const visible = rawRows(await adapter.rawQuery?.(
    `SELECT occ."id" FROM ${dialect.table('bom_line_occurrence')} occ` +
    ` WHERE occ."lineId" = '${sourceLineId}' AND occ."effectiveFrom" <= '${context.asOfDate.toISOString()}'` +
    ` AND (occ."effectiveTo" IS NULL OR occ."effectiveTo" > '${context.asOfDate.toISOString()}')` +
    ` AND (occ."ecnInId" IS NULL OR EXISTS (SELECT 1 FROM ${dialect.table('ecn')} e WHERE e."id" = occ."ecnInId" AND e."state" = 'released'))`
  ));
  void rows;
  return visible.map(row => ({ lineId: sourceLineId, occurrenceId: String(row[0]), revisionId: null }));
};

/**
 * 确认跟进（AC#7/#19）：把映射的基线整体推进到当前解析依据（到源行为止的解析步骤集合）
 * 与当前目标发生项；不是只改末端发生项。
 */
export const confirmMapping = async (
  adapter: BomLocalAdapter,
  mappingId: string,
  targetOccurrenceId: string | null,
  context: ResolutionContext
): Promise<void> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const mapRows = rawRows(await adapter.rawQuery?.(
    `SELECT "id", "relation", "sourceLineId", "sourceLinePath", "scopeId" FROM ${dialect.table('bom_map')} WHERE "id" = '${mappingId}'`
  ));
  if (mapRows.length === 0) throw new BomMapError('mappingId', `映射不存在：${mappingId}`);
  const relation = String(mapRows[0][1]);
  const sourceLineId = mapRows[0][2] === null ? null : String(mapRows[0][2]);
  const sourceLinePath = mapRows[0][3] === null ? null : (JSON.parse(String(mapRows[0][3])) as string[]);
  const scopeId = String(mapRows[0][4]);
  if (relation === 'added' || sourceLineId === null) {
    // added 无源行：基线只有目标发生项
    await adapter.rawQuery?.(
      `UPDATE ${dialect.table('bom_map')} SET "targetOccurrenceId" = ${targetOccurrenceId === null ? 'NULL' : `'${targetOccurrenceId}'`}, "baselineSteps" = '[]' WHERE "id" = '${mappingId}'`
    );
    return;
  }
  const scope = await readScope(adapter, scopeId);
  // 展开 + 步骤收集
  const rootRows = rawRows(await adapter.rawQuery?.(
    `SELECT h."parentRevisionId" FROM ${dialect.table('bom_header')} h WHERE h."id" = '${scope.ebomRootHeaderId}'`
  ));
  const { expandBom } = await import('./expansion.js');
  const expansion = await expandBom(adapter, context, { parentRevisionId: String(rootRows[0][0]) });
  const occurrenceIds = [...new Set(expansion.nodes.flatMap(node => node.path))];
  const lineOfOcc = await lineIdOfOccurrence(adapter, occurrenceIds);
  const steps = collectSteps(expansion, lineOfOcc, sourceLineId, sourceLinePath);
  if (sourceLinePath === null || sourceLinePath[0] === sourceLineId) {
    // 源行是根头行时补根头行步骤
    steps.push(...(await rootLineSteps(adapter, scope, sourceLineId, context)));
  }
  await adapter.rawQuery?.(
    `UPDATE ${dialect.table('bom_map')} SET "targetOccurrenceId" = ${targetOccurrenceId === null ? 'NULL' : `'${targetOccurrenceId}'`}, "baselineSteps" = '${JSON.stringify(steps).replaceAll("'", "''")}' WHERE "id" = '${mappingId}'`
  );
};

/**
 * 跟进缺口查询（AC#4/#8/#16~#22）：按 ResolutionContext 自范围根头求当前解析依据，
 * 与基线逐步比较——任一步的发生项或解析修订不同、出现或消失即为缺口；unresolved /
 * truncated 的映射标「无法判定」（点名原因），不算无缺口。
 */
export const mappingGaps = async (
  adapter: BomLocalAdapter,
  scopeId: string,
  context: ResolutionContext
): Promise<MappingGapsResult> => {
  const scope = await readScope(adapter, scopeId);
  const mappings = await readMappings(adapter, scopeId);
  const dialect = bomSqlDialectFor(adapter.name);
  const rootRows = rawRows(await adapter.rawQuery?.(
    `SELECT h."parentRevisionId" FROM ${dialect.table('bom_header')} h WHERE h."id" = '${scope.ebomRootHeaderId}'`
  ));
  const { expandBom } = await import('./expansion.js');
  let expansion: Awaited<ReturnType<typeof expandBom>>;
  try {
    expansion = await expandBom(adapter, context, { parentRevisionId: String(rootRows[0][0]) });
  } catch (error) {
    // unresolved（备选未定）等：全部映射标「无法判定」
    return {
      scopeId,
      gaps: mappings
        .filter(mapping => mapping.sourceLineId !== null)
        .map(mapping => ({
          mappingId: mapping.id,
          relation: mapping.relation,
          targetLineId: null,
          undecidable: { reason: error instanceof Error ? error.message : String(error) },
          differences: [],
          appeared: []
        }))
    };
  }
  const truncated = expansion.truncated;
  if (truncated !== null) {
    return {
      scopeId,
      gaps: mappings
        .filter(mapping => mapping.sourceLineId !== null)
        .map(mapping => ({
          mappingId: mapping.id,
          relation: mapping.relation,
          targetLineId: null,
          undecidable: { reason: `展开触顶（${truncated.reason}）` },
          differences: [],
          appeared: []
        }))
    };
  }
  const occurrenceIds = [...new Set(expansion.nodes.flatMap(node => node.path))];
  const lineOfOcc = await lineIdOfOccurrence(adapter, occurrenceIds);
  const gaps: MappingGap[] = [];
  for (const mapping of mappings) {
    if (mapping.relation === 'added' || mapping.sourceLineId === null) continue;
    const baselineRows = rawRows(await adapter.rawQuery?.(
      `SELECT "baselineSteps" FROM ${dialect.table('bom_map')} WHERE "id" = '${mapping.id}'`
    ));
    if (baselineRows.length === 0 || baselineRows[0][0] === null) continue; // 未确认过，无基线不列缺口
    const baseline = JSON.parse(String(baselineRows[0][0])) as MappingStep[];
    const current = collectSteps(expansion, lineOfOcc, mapping.sourceLineId, mapping.sourceLinePath);
    if (mapping.sourceLinePath === null || mapping.sourceLinePath[0] === mapping.sourceLineId) {
      current.push(...(await rootLineSteps(adapter, scope, mapping.sourceLineId, context)));
    }
    const currentByLine = new Map<string, MappingStep[]>();
    for (const step of current) {
      const list = currentByLine.get(step.lineId) ?? [];
      list.push(step);
      currentByLine.set(step.lineId, list);
    }
    const baselineByLine = new Map<string, MappingStep[]>();
    for (const step of baseline) {
      const list = baselineByLine.get(step.lineId) ?? [];
      list.push(step);
      baselineByLine.set(step.lineId, list);
    }
    const differences: MappingGap['differences'] = [];
    const appeared: MappingStep[] = [];
    for (const [lineId, baselineSteps] of baselineByLine) {
      const currentSteps = currentByLine.get(lineId) ?? [];
      if (currentSteps.length === 0) {
        for (const step of baselineSteps) {
          differences.push({ baseline: step, current: null, kind: 'missing' });
        }
        continue;
      }
      for (const step of baselineSteps) {
        const match = currentSteps.find(candidate =>
          candidate.occurrenceId === step.occurrenceId && candidate.revisionId === step.revisionId
        );
        if (!match) {
          differences.push({ baseline: step, current: currentSteps[0], kind: 'changed' });
        }
      }
      for (const step of currentSteps) {
        if (!baselineSteps.some(candidate => candidate.occurrenceId === step.occurrenceId && candidate.revisionId === step.revisionId)) {
          appeared.push(step);
        }
      }
    }
    gaps.push({
      mappingId: mapping.id,
      relation: mapping.relation,
      targetLineId: null,
      undecidable: null,
      differences,
      appeared
    });
  }
  return { scopeId, gaps };
};
