/**
 * @fileoverview EBOM↔MBOM 映射的保存校验、覆盖率与跟进基线（US-516）
 *
 * 保存校验（TS 层）：两侧 `bom_type` / `org_id` 与范围一致（AC#10）；两侧行都必须是范围
 * 成员——源行从 EBOM 根头、目标行从 MBOM 根头出发、逐跳可证明的头链（两侧同一判据；头链一跳 =
 * 前一行存在某个 consume 发生项、后一行所在头是该发生项可选到的、与该侧同类型、与范围同组织的子件头，
 * 不按生效期；precise 行只可达锁定的修订头，AC#12/#15；目标侧本期只按行定义）；路径级映射的
 * `sourceLinePath` 首元素是根头行、逐级相邻、末元素等于 `sourceLineId`（AC#13）。NULL 规则由存储层触发器兜底（AC#9）。
 * 覆盖率（AC#5/#6/#13/#14）与跟进基线/缺口（AC#4/#7/#8/#16~#22）随本文件其余导出：三处都自范围
 * EBOM 根头展开，截断与未裁决（与 assertCompleteResolution 同口径）的展开不当完整结构消费——覆盖率要整棵
 * 结构，不完整即拒绝；缺口与确认跟进逐映射判定（AC#22）：只有源行可能被未裁决跳 / 截断遮住的映射无法判定
 * 并点名那一跳，不影响其它映射。已存发生项消失（草稿头删除 / ECN 撤回取消级联）后，三处按保存的同一判据
 * 重判两侧成员资格与路径相邻性：失效即「路径失效」——覆盖率列入 `invalid` 且不算覆盖，缺口标 `invalid`，
 * 确认跟进拒绝。全部 SQL 走方言占位符绑定。
 */

import { BomMap } from '../entities.js';
import { scopedBomAdapter, type BomLocalAdapter } from './bom-adapter.js';
import { BomMapError } from './bom-map-error.js';
import { bomSqlDialectFor, type BomSqlDialect } from './bom-sql.js';
import { BomConfigError } from './config-condition.js';
import { expandBom, type ExpansionResult } from './expansion.js';
import { BomResolutionError, type ResolutionContext } from './resolution.js';

/** 一条映射的保存输入（scopeId + 六态 + 两侧行 + 可选路径）。 */
export interface MappingSaveInput {
  scopeId: string;
  relation: 'one_to_one' | 'split' | 'merge' | 'added' | 'removed' | 'resequenced';
  sourceLineId?: string | null;
  targetLineId?: string | null;
  /** 路径级映射：自范围 EBOM 根头行起的逻辑行序列（非空、逐级相邻、末元素 = sourceLineId）；行级映射省略。 */
  sourceLinePath?: string[] | null;
}

/** 范围信息（保存校验与覆盖率共用）。 */
export interface MapScopeInfo {
  scopeId: string;
  orgId: string;
  ebomRootHeaderId: string;
  mbomRootHeaderId: string;
}

export { BomMapError } from './bom-map-error.js';

/** IN 列表分块大小（避开两后端的绑定变量上限，与展开同口径）。 */
const CHUNK_SIZE = 200;

/** 绑定参数查询：rawQuery 缺席即显式拒绝（本地适配器必有），绑定值按方言编码，结果双形状归一。 */
const queryRows = async (adapter: BomLocalAdapter, sql: string, params: unknown[] = []): Promise<unknown[][]> => {
  if (!adapter.rawQuery) throw new BomMapError('adapter', `适配器 ${adapter.name} 缺少 rawQuery 读路径`);
  const dialect = bomSqlDialectFor(adapter.name);
  const result = (await adapter.rawQuery(
    sql,
    params.map(value => dialect.encode(value))
  )) as { results?: { rows: unknown[][] }[]; rows?: unknown[][] };
  return Array.isArray(result.results) ? result.results[0].rows : (result.rows ?? []);
};

/** 第 offset 起 count 个占位符（IN 列表用）。 */
const placeholders = (dialect: BomSqlDialect, count: number, offset = 0): string =>
  Array.from({ length: count }, (_, index) => dialect.placeholder(offset + index)).join(', ');

/** 按 IN 列表分块逐块查询并拼接结果行。 */
const queryInChunks = async (
  adapter: BomLocalAdapter,
  ids: string[],
  build: (dialect: BomSqlDialect, chunk: string[]) => { sql: string; params: unknown[] }
): Promise<unknown[][]> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const rows: unknown[][] = [];
  for (let offset = 0; offset < ids.length; offset += CHUNK_SIZE) {
    const built = build(dialect, ids.slice(offset, offset + CHUNK_SIZE));
    rows.push(...(await queryRows(adapter, built.sql, built.params)));
  }
  return rows;
};

/** 读范围。 */
const readScope = async (adapter: BomLocalAdapter, scopeId: string): Promise<MapScopeInfo> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const rows = await queryRows(
    adapter,
    `SELECT "orgId", "ebomRootHeaderId", "mbomRootHeaderId" FROM ${dialect.table('bom_map_scope')} WHERE "id" = ${dialect.placeholder(0)}`,
    [scopeId]
  );
  if (rows.length === 0) throw new BomMapError('scopeId', `范围不存在：${scopeId}`);
  return {
    scopeId,
    orgId: String(rows[0][0]),
    ebomRootHeaderId: String(rows[0][1]),
    mbomRootHeaderId: String(rows[0][2])
  };
};

/** 行所在头（headerId / bomType / orgId）。 */
const lineHeader = async (
  adapter: BomLocalAdapter,
  lineId: string
): Promise<{ headerId: string; bomType: string; orgId: string }> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const rows = await queryRows(
    adapter,
    `SELECT h."id", h."bomType", h."orgId" FROM ${dialect.table('bom_header')} h JOIN ${dialect.table('bom_line')} l ON l."headerId" = h."id" WHERE l."id" = ${dialect.placeholder(0)}`,
    [lineId]
  );
  if (rows.length === 0) throw new BomMapError('lineId', `逻辑行不存在：${lineId}`);
  return { headerId: String(rows[0][0]), bomType: String(rows[0][1]), orgId: String(rows[0][2]) };
};

/** 一组头下的全部逻辑行（成员资格用「已存行」：不按生效期、不过滤 ECN，草稿头下的行也算）。 */
const linesOfHeaders = async (adapter: BomLocalAdapter, headerIds: string[]): Promise<string[]> =>
  (
    await queryInChunks(adapter, headerIds, (dialect, chunk) => ({
      sql: `SELECT l."id" FROM ${dialect.table('bom_line')} l WHERE l."headerId" IN (${placeholders(dialect, chunk.length)})`,
      params: chunk
    }))
  ).map(row => String(row[0]));

/** 范围的一侧：成员资格自该侧根头出发，一跳只走与该侧同类型的子件头。 */
interface ScopeSide {
  label: string;
  bomType: 'ebom' | 'mbom';
  rootHeaderId: string;
}

/** 源侧：自 EBOM 根头（行级与路径级映射）。 */
const sourceSide = (scope: MapScopeInfo): ScopeSide => ({
  label: '源行',
  bomType: 'ebom',
  rootHeaderId: scope.ebomRootHeaderId
});

/** 目标侧：自 MBOM 根头（本期只按行定义，不带路径）。 */
const targetSide = (scope: MapScopeInfo): ScopeSide => ({
  label: '目标行',
  bomType: 'mbom',
  rootHeaderId: scope.mbomRootHeaderId
});

/**
 * 头链一跳（AC#12/#15）：给定头（`column = 'headerId'`）或行（`column = 'id'`）上的 consume
 * 发生项可选到的子件头——父修订属于该发生项的子件物料，precise 只认锁定的修订、imprecise 认该物料
 * 任一已发布修订；子件头须与该侧同类型（源侧 EBOM / 目标侧 MBOM）、与范围同组织。不按生效期（物料级并集图只剪枝）。
 */
const childHeadersOf = async (
  adapter: BomLocalAdapter,
  scope: MapScopeInfo,
  side: ScopeSide,
  column: 'headerId' | 'id',
  ids: string[]
): Promise<string[]> =>
  (
    await queryInChunks(adapter, ids, (dialect, chunk) => ({
      sql: [
        `SELECT DISTINCT ch."id" FROM ${dialect.table('bom_line')} l`,
        `JOIN ${dialect.table('bom_line_occurrence')} occ ON occ."lineId" = l."id"`,
        `JOIN ${dialect.table('item_revision')} r ON r."itemId" = occ."childItemId"`,
        `  AND (r."id" = occ."childRevisionId" OR (occ."childRevisionId" IS NULL AND r."state" = 'released'))`,
        `JOIN ${dialect.table('bom_header')} ch ON ch."parentRevisionId" = r."id"`,
        `WHERE l."${column}" IN (${placeholders(dialect, chunk.length)}) AND occ."flowDirection" = 'consume'`,
        `  AND ch."bomType" = ${dialect.placeholder(chunk.length)} AND ch."orgId" = ${dialect.placeholder(chunk.length + 1)}`
      ].join('\n'),
      params: [...chunk, side.bomType, scope.orgId]
    }))
  ).map(row => String(row[0]));

/** 范围成员资格（AC#12/#15，两侧同一判据）：从该侧根头按头链逐层 BFS，返回可达行集合。 */
const reachableLines = async (adapter: BomLocalAdapter, scope: MapScopeInfo, side: ScopeSide): Promise<Set<string>> => {
  const reachable = new Set<string>();
  const visited = new Set<string>([side.rootHeaderId]);
  let frontier = [side.rootHeaderId];
  while (frontier.length > 0) {
    for (const lineId of await linesOfHeaders(adapter, frontier)) reachable.add(lineId);
    frontier = (await childHeadersOf(adapter, scope, side, 'headerId', frontier)).filter(id => !visited.has(id));
    for (const headerId of frontier) visited.add(headerId);
  }
  return reachable;
};

/** 一侧行的类型与组织须与范围一致（AC#10）：违约点名该行、所在头与范围。 */
const assertLineSide = async (
  adapter: BomLocalAdapter,
  scope: MapScopeInfo,
  lineId: string,
  side: ScopeSide
): Promise<void> => {
  const header = await lineHeader(adapter, lineId);
  if (header.bomType !== side.bomType) {
    throw new BomMapError(
      `${side.label} ${lineId}`,
      `所在头 ${header.headerId} 的类型 ${header.bomType} 不是 ${side.bomType.toUpperCase()}（范围 ${scope.scopeId}）`
    );
  }
  if (header.orgId !== scope.orgId) {
    throw new BomMapError(
      `${side.label} ${lineId}`,
      `所在头 ${header.headerId} 的组织 ${header.orgId} 与范围 ${scope.scopeId} 的组织 ${scope.orgId} 不符`
    );
  }
};

/**
 * 范围成员资格的违约文本（AC#12/#15；保存拒绝与「路径失效」同一判据）：行不在该侧根头的可达行集合里
 * 即点名该侧根头；是成员为 null。
 */
const outsideScope = (members: Set<string>, side: ScopeSide, lineId: string): string | null =>
  members.has(lineId) ? null : (
    `不可由范围 ${side.bomType.toUpperCase()} 根头（${side.rootHeaderId}）到达，不是范围成员`
  );

/** 一侧行须是该侧的范围成员（根层的行所在头等于该侧根头，更深的行有一条自根头出发的头链）。 */
const assertScopeMember = async (
  adapter: BomLocalAdapter,
  scope: MapScopeInfo,
  lineId: string,
  side: ScopeSide
): Promise<void> => {
  const outside = outsideScope(await reachableLines(adapter, scope, side), side, lineId);
  if (outside !== null) throw new BomMapError(`${side.label} ${lineId}`, outside);
};

/** 一组逻辑行所在的头（行 → 头；已不存在的行不在表里）。 */
const headersOfLines = async (adapter: BomLocalAdapter, lineIds: string[]): Promise<Map<string, string>> =>
  new Map(
    (
      await queryInChunks(adapter, [...new Set(lineIds)], (dialect, chunk) => ({
        sql: `SELECT l."id", l."headerId" FROM ${dialect.table('bom_line')} l WHERE l."id" IN (${placeholders(dialect, chunk.length)})`,
        params: chunk
      }))
    ).map(row => [String(row[0]), String(row[1])])
  );

/**
 * 路径的相邻性（AC#13；保存拒绝与「路径失效」同一判据）：首元素所在头是范围 EBOM 根头、逐跳是头链一跳
 * （不按生效期）；断开时点名那一跳（已不存在的行不与任何行相邻），相邻为 null。
 */
const pathBreak = async (adapter: BomLocalAdapter, scope: MapScopeInfo, path: string[]): Promise<string | null> => {
  const headers = await headersOfLines(adapter, path);
  const rootHeader = headers.get(path[0]);
  if (rootHeader === undefined) return `首元素 ${path[0]} 不存在`;
  if (rootHeader !== scope.ebomRootHeaderId) {
    return `首元素所在头 ${rootHeader} 不是范围 EBOM 根头 ${scope.ebomRootHeaderId}`;
  }
  for (let index = 1; index < path.length; index++) {
    const next = headers.get(path[index]);
    const children = await childHeadersOf(adapter, scope, sourceSide(scope), 'id', [path[index - 1]]);
    if (next === undefined || !children.includes(next)) {
      return `第 ${index} 跳（${path[index - 1]} → ${path[index]}）失去相邻性`;
    }
  }
  return null;
};

/** 路径级映射（AC#13）：末元素 = sourceLineId，且首元素是根头行、逐级相邻。 */
const assertSourcePath = async (
  adapter: BomLocalAdapter,
  scope: MapScopeInfo,
  path: string[],
  sourceLineId: string | null | undefined
): Promise<void> => {
  if (path[path.length - 1] !== sourceLineId) throw new BomMapError('sourceLinePath', '末元素必须等于 sourceLineId');
  const broken = await pathBreak(adapter, scope, path);
  if (broken !== null) throw new BomMapError('sourceLinePath', broken);
};

/**
 * 保存映射（US-516）：两侧类型/组织与两侧范围成员资格（源行自 EBOM 根头、目标行自 MBOM 根头，同一判据）、
 * 路径相邻与末元素；通过后经实例的实体构造门面落库（多实例并存时 `new BomMap()` 判不出目标库）。
 */
export const saveMapping = async (adapter: BomLocalAdapter, input: MappingSaveInput): Promise<{ mapId: string }> => {
  const scope = await readScope(adapter, input.scopeId);
  const sourceLineId = input.sourceLineId ?? null;
  const targetLineId = input.targetLineId ?? null;
  const sides: [string, ScopeSide][] = [];
  if (sourceLineId !== null) sides.push([sourceLineId, sourceSide(scope)]);
  if (targetLineId !== null) sides.push([targetLineId, targetSide(scope)]);
  // 两侧类型/组织先于成员资格（头链 BFS）判定
  for (const [lineId, side] of sides) await assertLineSide(adapter, scope, lineId, side);
  for (const [lineId, side] of sides) await assertScopeMember(adapter, scope, lineId, side);
  const path = input.sourceLinePath ?? null;
  if (path !== null && path.length === 0) {
    // 空路径既不是行级（省略路径）也指不到任何路径：存下去后路径键恒为空串，缺口与覆盖率都看不见它
    throw new BomMapError('sourceLinePath', '路径级映射的路径不得为空（至少含源行）；行级映射省略 sourceLinePath');
  }
  if (path !== null) await assertSourcePath(adapter, scope, path, sourceLineId);
  const factory = adapter.rxdb?.entityManager;
  if (factory === undefined) throw new BomMapError('adapter', '保存映射需要实体构造门面（adapter.rxdb.entityManager）');
  const mapping = factory.instantiate(BomMap);
  mapping.scopeId = input.scopeId;
  mapping.relation = input.relation;
  mapping.sourceLineId = sourceLineId;
  mapping.targetLineId = targetLineId;
  mapping.sourceLinePath = path === null ? null : JSON.stringify(path);
  await mapping.save();
  return { mapId: mapping.id };
};

/** 覆盖率结果（AC#5/#6/#13/#14）。 */
export interface MappingCoverageResult {
  scopeId: string;
  /** 已覆盖的（源行, 路径键）对。 */
  covered: { lineId: string; pathKey: string; mappingId: string }[];
  /** 未覆盖的源行与出现路径（未覆盖 ≠ removed，AC#6）。 */
  uncovered: { lineId: string; paths: string[][] }[];
  /**
   * 失效映射（「路径失效」，AC#13）：路径级映射失去相邻性、源行或目标行失去该侧范围成员资格（与保存同一判据，
   * 不按生效期；含只有目标行的 `added`）；不算作任何路径的覆盖。
   */
  invalid: { mappingId: string; reason: string }[];
}

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
  /** 映射的目标行（`removed` 无目标行时为 null）。 */
  targetLineId: string | null;
  /** 无法判定（unresolved / truncated）：点名原因，不算无缺口（AC#22）。 */
  undecidable: { reason: string } | null;
  /**
   * 路径失效（与覆盖率 `invalid` 同一判据与原因文本）：路径级映射失去相邻性、源行或目标行失去该侧范围成员资格；
   * 不算无缺口，也不只靠差异步骤消失来表达。差异照常给出；仍有效为 null。
   */
  invalid: { reason: string } | null;
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

/** 存储的一条映射（JSON 列已解析）。 */
interface StoredMapping {
  id: string;
  scopeId: string;
  relation: string;
  sourceLineId: string | null;
  targetLineId: string | null;
  sourceLinePath: string[] | null;
  baselineSteps: MappingStep[] | null;
}

const MAPPING_COLUMNS = `"id", "scopeId", "relation", "sourceLineId", "targetLineId", "sourceLinePath", "baselineSteps"`;

/**
 * 映射行 JSON 列的解析（同 parseLotCodes 口径）：两列存储层只验类型不验形状，直连 SQL 可写入任意文本；
 * 坏 JSON 或形状不对即点名映射行与列。这是数据契约破坏，整次查询拒绝——AC#22 的逐映射隔离只针对
 * 展开不完整（未裁决 / 截断），不把损坏行当「无法判定」吞掉。
 */
const parseMappingJson = (mappingId: string, column: string, raw: unknown): unknown => {
  try {
    return JSON.parse(String(raw));
  } catch {
    throw new BomMapError(`映射 ${mappingId} 的 ${column}`, `不是合法 JSON：${String(raw)}`);
  }
};

/** 一个解析步骤的形状：逻辑行 / 发生项是字符串，解析修订是字符串或 null。 */
const isMappingStep = (value: unknown): value is MappingStep => {
  if (typeof value !== 'object' || value === null) return false;
  const step = value as Record<string, unknown>;
  return (
    typeof step['lineId'] === 'string' &&
    typeof step['occurrenceId'] === 'string' &&
    (step['revisionId'] === null || typeof step['revisionId'] === 'string')
  );
};

/** 路径级映射的路径：非空的逻辑行 ID 数组（空路径与保存校验同样拒绝）；NULL = 行级映射。 */
const parseSourceLinePath = (mappingId: string, raw: unknown): string[] | null => {
  if (raw === null) return null;
  const parsed = parseMappingJson(mappingId, 'sourceLinePath', raw);
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some(lineId => typeof lineId !== 'string')) {
    throw new BomMapError(`映射 ${mappingId} 的 sourceLinePath`, `必须是非空的逻辑行 ID 数组：${String(raw)}`);
  }
  return parsed as string[];
};

/** 跟进基线：解析步骤数组；NULL = 未确认过。 */
const parseBaselineSteps = (mappingId: string, raw: unknown): MappingStep[] | null => {
  if (raw === null) return null;
  const parsed = parseMappingJson(mappingId, 'baselineSteps', raw);
  if (!Array.isArray(parsed) || !parsed.every(isMappingStep)) {
    throw new BomMapError(
      `映射 ${mappingId} 的 baselineSteps`,
      `必须是解析步骤数组（lineId / occurrenceId / revisionId）：${String(raw)}`
    );
  }
  return parsed;
};

const storedMapping = (row: unknown[]): StoredMapping => {
  const id = String(row[0]);
  return {
    id,
    scopeId: String(row[1]),
    relation: String(row[2]),
    sourceLineId: row[3] === null ? null : String(row[3]),
    targetLineId: row[4] === null ? null : String(row[4]),
    sourceLinePath: parseSourceLinePath(id, row[5]),
    baselineSteps: parseBaselineSteps(id, row[6])
  };
};

/** 查某范围的映射行。 */
const readMappings = async (adapter: BomLocalAdapter, scopeId: string): Promise<StoredMapping[]> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const rows = await queryRows(
    adapter,
    `SELECT ${MAPPING_COLUMNS} FROM ${dialect.table('bom_map')} WHERE "scopeId" = ${dialect.placeholder(0)} ORDER BY "id"`,
    [scopeId]
  );
  return rows.map(storedMapping);
};

/** 查单条映射。 */
const readMapping = async (adapter: BomLocalAdapter, mappingId: string): Promise<StoredMapping> => {
  const dialect = bomSqlDialectFor(adapter.name);
  const rows = await queryRows(
    adapter,
    `SELECT ${MAPPING_COLUMNS} FROM ${dialect.table('bom_map')} WHERE "id" = ${dialect.placeholder(0)}`,
    [mappingId]
  );
  if (rows.length === 0) throw new BomMapError('mappingId', `映射不存在：${mappingId}`);
  return storedMapping(rows[0]);
};

/** 两侧根头的可达行集合（一次查询内各算一遍，供逐映射判定）。 */
interface ScopeMembers {
  source: Set<string>;
  target: Set<string>;
}

/**
 * 一条映射的「路径失效」原因（与保存同一判据）：路径级映射看相邻性（自根头逐跳，蕴含源行成员资格），
 * 行级映射看源行成员资格，有目标行再看目标行成员资格；仍有效为 null。
 */
const lapseOf = async (
  adapter: BomLocalAdapter,
  scope: MapScopeInfo,
  members: ScopeMembers,
  mapping: StoredMapping
): Promise<string | null> => {
  const reasons: string[] = [];
  if (mapping.sourceLinePath !== null) {
    const broken = await pathBreak(adapter, scope, mapping.sourceLinePath);
    if (broken !== null) reasons.push(`路径 ${mapping.sourceLinePath.join('>')}：${broken}`);
  } else if (mapping.sourceLineId !== null) {
    const outside = outsideScope(members.source, sourceSide(scope), mapping.sourceLineId);
    if (outside !== null) reasons.push(`源行 ${mapping.sourceLineId} ${outside}`);
  }
  if (mapping.targetLineId !== null) {
    const outside = outsideScope(members.target, targetSide(scope), mapping.targetLineId);
    if (outside !== null) reasons.push(`目标行 ${mapping.targetLineId} ${outside}`);
  }
  return reasons.length === 0 ? null : `${reasons.join('；')}（路径失效）`;
};

/**
 * 「路径失效」逐映射判定（US-516：已存发生项经草稿头删除或 ECN 撤回 / 取消级联消失后）：覆盖率、缺口与
 * 确认跟进共用，映射 id → 原因；仍有效的不在表里。
 */
const lapsedMappings = async (
  adapter: BomLocalAdapter,
  scope: MapScopeInfo,
  mappings: StoredMapping[]
): Promise<Map<string, string>> => {
  const lapsed = new Map<string, string>();
  if (mappings.length === 0) return lapsed;
  const members: ScopeMembers = {
    source: await reachableLines(adapter, scope, sourceSide(scope)),
    target: await reachableLines(adapter, scope, targetSide(scope))
  };
  for (const mapping of mappings) {
    const reason = await lapseOf(adapter, scope, members, mapping);
    if (reason !== null) lapsed.set(mapping.id, reason);
  }
  return lapsed;
};

/** 源侧展开：根级失败（expandBom 直接拒绝：根备选零匹配、配置违约等）全局无法判定；否则给出展开（可能不完整）。 */
type ScopeExpansion = { expansion: ExpansionResult } | { undecidable: string };

/** 根级解析不出的业务原因（解析 / 配置违约）：标无法判定；其余错误原样上抛，不吞。 */
const isUndecidable = (error: unknown): error is Error =>
  error instanceof BomResolutionError || error instanceof BomConfigError;

/**
 * 自范围指定侧根头按上下文展开。上下文须与该侧同类型、同组织；根头由范围钉住、不随上下文重选——
 * 根修订的备选取范围根头自己的编号（`alternativeNo` 只裁决根头），上下文另指即拒绝。
 */
const expandScope = async (
  adapter: BomLocalAdapter,
  scope: MapScopeInfo,
  context: ResolutionContext,
  side: ScopeSide = sourceSide(scope)
): Promise<ScopeExpansion> => {
  const label = side.bomType.toUpperCase();
  const direction = side.bomType === 'ebom' ? '源侧' : '目标侧';
  if (context.bomType !== side.bomType || context.orgId !== scope.orgId) {
    throw new BomMapError(
      'context',
      `上下文 ${context.bomType}/${context.orgId} 与范围 ${side.bomType}/${scope.orgId} 不符：${direction}自范围 ${label} 根头解析`
    );
  }
  const dialect = bomSqlDialectFor(adapter.name);
  const rootRows = await queryRows(
    adapter,
    `SELECT h."parentRevisionId", h."alternativeNo" FROM ${dialect.table('bom_header')} h WHERE h."id" = ${dialect.placeholder(0)}`,
    [side.rootHeaderId]
  );
  if (rootRows.length === 0) throw new BomMapError('scope', `${label} 根头不存在：${side.rootHeaderId}`);
  const alternativeNo = Number(rootRows[0][1]);
  if (context.alternativeNo !== undefined && context.alternativeNo !== alternativeNo) {
    throw new BomMapError(
      'context',
      `上下文备选 ${context.alternativeNo} 与范围 ${label} 根头的备选 ${alternativeNo} 不符：根头由范围钉住`
    );
  }
  try {
    return {
      expansion: await expandBom(adapter, { ...context, alternativeNo }, { parentRevisionId: String(rootRows[0][0]) })
    };
  } catch (error) {
    if (!isUndecidable(error)) throw error;
    return { undecidable: error.message };
  }
};

/** 一处未裁决跳：点名文本 + 被它遮住区域的根物料（多备选 = 该修订的物料；序列 / 批次 = 该行的候选子件）。 */
interface HiddenHop {
  label: string;
  roots: string[];
}

/** 展开的不完整处：触顶项与未裁决跳。 */
interface Incompleteness {
  truncated: string | null;
  hops: HiddenHop[];
}

/** 展开的不完整处；完整为 null（与 assertCompleteResolution 同口径：截断或存在未裁决即不完整）。 */
const incompletenessOf = (expansion: ExpansionResult): Incompleteness | null => {
  const hops = (expansion.unresolved ?? []).map((entry): HiddenHop =>
    entry.lineId === undefined ?
      { label: `修订 ${entry.parentRevisionId} 的备选头未裁决`, roots: [entry.parentItemId] }
    : {
        label: `逻辑行 ${entry.lineId} 的${entry.reason === 'lot' ? '批次（lot）' : '序列（unit）'}候选未裁决`,
        roots: entry.candidates.flatMap(candidate =>
          candidate.childItemId === undefined ? [] : [candidate.childItemId]
        )
      }
  );
  const truncated = expansion.truncated === null ? null : `展开触顶（${expansion.truncated.reason}）`;
  return truncated === null && hops.length === 0 ? null : { truncated, hops };
};

/** 不完整处的点名文本（触顶项与全部未裁决跳）。 */
const describeIncompleteness = (incomplete: Incompleteness): string =>
  [...(incomplete.truncated === null ? [] : [incomplete.truncated]), ...incomplete.hops.map(hop => hop.label)].join(
    '；'
  );

/** 要整棵结构的消费方（覆盖率）：根级失败或展开不完整即拒绝并点名，不把部分展开当完整结构。 */
const decidedExpansion = (expanded: ScopeExpansion, subject: string): ExpansionResult => {
  if ('undecidable' in expanded) throw new BomMapError(subject, `源侧解析无法判定：${expanded.undecidable}`);
  const incomplete = incompletenessOf(expanded.expansion);
  if (incomplete !== null) {
    throw new BomMapError(subject, `源侧解析无法判定：${describeIncompleteness(incomplete)}`);
  }
  return expanded.expansion;
};

/** 展开节点发生项 → 逻辑行（结构归属列创建后不可改）；查不到即契约破坏，显式拒绝。 */
const lineLookup = async (
  adapter: BomLocalAdapter,
  expansion: ExpansionResult
): Promise<(occurrenceId: string) => string> => {
  const ids = [...new Set(expansion.nodes.flatMap(node => (node.occurrenceId === null ? [] : [node.occurrenceId])))];
  const rows = await queryInChunks(adapter, ids, (dialect, chunk) => ({
    sql: `SELECT occ."id", occ."lineId" FROM ${dialect.table('bom_line_occurrence')} occ WHERE occ."id" IN (${placeholders(dialect, chunk.length)})`,
    params: chunk
  }));
  const lines = new Map(rows.map(row => [String(row[0]), String(row[1])]));
  return occurrenceId => {
    const lineId = lines.get(occurrenceId);
    if (lineId === undefined) throw new BomMapError('occurrenceId', `展开路径上的发生项不存在：${occurrenceId}`);
    return lineId;
  };
};

/** 展开里每个逻辑行出现的全部行路径（根头行即一级节点，路径 = 根 → 本行的逻辑行序列）。 */
const sourceLinePaths = (
  expansion: ExpansionResult,
  lineOf: (occurrenceId: string) => string
): Map<string, string[][]> => {
  const linePaths = new Map<string, string[][]>();
  for (const node of expansion.nodes) {
    if (node.occurrenceId === null) continue;
    const lineId = lineOf(node.occurrenceId);
    const paths = linePaths.get(lineId) ?? [];
    paths.push(node.path.map(lineOf));
    linePaths.set(lineId, paths);
  }
  return linePaths;
};

/**
 * 一条有效映射在本次展开里覆盖的路径键：行级 = 源行出现的全部路径，路径级 = 恰为 `sourceLinePath` 的那一条
 * （只认展开里实际出现的路径：评估日下不出现的路径不覆盖任何东西，也不是失效）。
 */
const coveredPathKeys = (mapping: StoredMapping, paths: string[][]): string[] => {
  const keys = paths.map(path => path.join('>'));
  const own = mapping.sourceLinePath?.join('>');
  return own === undefined ? keys : keys.filter(key => key === own);
};

/**
 * 覆盖率查询（AC#5/#6/#13/#14）：展开 EBOM 根，按路径计覆盖——路径级映射只覆盖
 * 那一条路径、行级映射覆盖该逻辑行出现的全部路径；未覆盖报出（不静默视作 removed）；
 * 「路径失效」的映射（路径级失去相邻性、源行或目标行失去成员资格，含 `added`）列入 `invalid`、不算覆盖。
 * 截断 / 未裁决即拒绝。
 */
export const mappingCoverage = async (
  adapter: BomLocalAdapter,
  scopeId: string,
  context: ResolutionContext
): Promise<MappingCoverageResult> => {
  const scope = await readScope(adapter, scopeId);
  const mappings = await readMappings(adapter, scopeId);
  const expansion = decidedExpansion(await expandScope(adapter, scope, context), '覆盖率');
  const linePaths = sourceLinePaths(expansion, await lineLookup(adapter, expansion));
  const lapsed = await lapsedMappings(adapter, scope, mappings);
  const covered: MappingCoverageResult['covered'] = [];
  const invalid: MappingCoverageResult['invalid'] = [];
  const coveredKeys = new Map<string, Set<string>>();
  for (const mapping of mappings) {
    const reason = lapsed.get(mapping.id);
    if (reason !== undefined) {
      invalid.push({ mappingId: mapping.id, reason });
      continue;
    }
    // 只有目标行的 added 不覆盖任何源路径
    if (mapping.sourceLineId === null) continue;
    const lineId = mapping.sourceLineId;
    const seen = coveredKeys.get(lineId) ?? new Set<string>();
    coveredKeys.set(lineId, seen);
    for (const pathKey of coveredPathKeys(mapping, linePaths.get(lineId) ?? []).filter(key => !seen.has(key))) {
      seen.add(pathKey);
      covered.push({ lineId, pathKey, mappingId: mapping.id });
    }
  }
  const uncovered: MappingCoverageResult['uncovered'] = [];
  for (const [lineId, paths] of linePaths) {
    const missing = paths.filter(path => !coveredKeys.get(lineId)?.has(path.join('>')));
    if (missing.length > 0) uncovered.push({ lineId, paths: missing });
  }
  return { scopeId, covered, uncovered, invalid };
};

/** 源行所在头的父物料（判定源行是否落在被遮住区域里）。 */
const sourceParentItems = async (adapter: BomLocalAdapter, lineIds: string[]): Promise<Map<string, string>> =>
  new Map(
    (
      await queryInChunks(adapter, [...new Set(lineIds)], (dialect, chunk) => ({
        sql: [
          `SELECT l."id", r."itemId" FROM ${dialect.table('bom_line')} l`,
          `JOIN ${dialect.table('bom_header')} h ON h."id" = l."headerId"`,
          `JOIN ${dialect.table('item_revision')} r ON r."id" = h."parentRevisionId"`,
          `WHERE l."id" IN (${placeholders(dialect, chunk.length)})`
        ].join('\n'),
        params: chunk
      }))
    ).map(row => [String(row[0]), String(row[1])])
  );

/** 每个未裁决跳遮住的物料：根物料自身及其在并集图（bom_reach，与范围同为 EBOM、同组织）里的全部后代。 */
const hiddenRegions = async (
  adapter: BomLocalAdapter,
  scope: MapScopeInfo,
  hops: HiddenHop[]
): Promise<{ label: string; items: Set<string> }[]> => {
  const roots = [...new Set(hops.flatMap(hop => hop.roots))];
  const rows = await queryInChunks(adapter, roots, (dialect, chunk) => ({
    sql: `SELECT "ancestorItemId", "descendantItemId" FROM ${dialect.table('bom_reach')} WHERE "bomType" = 'ebom' AND "orgId" = ${dialect.placeholder(0)} AND "ancestorItemId" IN (${placeholders(dialect, chunk.length, 1)})`,
    params: [scope.orgId, ...chunk]
  }));
  const descendants = new Map<string, string[]>();
  for (const row of rows) {
    const list = descendants.get(String(row[0])) ?? [];
    list.push(String(row[1]));
    descendants.set(String(row[0]), list);
  }
  return hops.map(hop => ({
    label: hop.label,
    items: new Set(hop.roots.flatMap(root => [root, ...(descendants.get(root) ?? [])]))
  }));
};

/** 展开里出现过的逻辑行与行路径（判定源行 / 指定路径在展开里有没有节点）。 */
interface LocatedLines {
  lines: Set<string>;
  paths: Set<string>;
}

/**
 * 一条映射的逐映射判定（AC#22）：可判定为 null，否则给出点名那一跳的原因。
 * - 路径级：指定路径的节点在展开里存在即可判定（其祖先步骤都已解析），不在即可能被遮住；
 * - 行级：截断即无法判定（未展开处可能还有源行的路径）；源行所在头的父物料落在某个未裁决跳遮住的区域里
 *   （等于其根物料或是其并集图后代）即无法判定并点名该跳；源行在展开里无节点同样无法判定。
 */
const mappingUndecidable = (
  mapping: StoredMapping,
  located: LocatedLines,
  parentItemId: string | undefined,
  incomplete: Incompleteness,
  regions: { label: string; items: Set<string> }[]
): string | null => {
  if (mapping.sourceLinePath !== null) {
    if (located.paths.has(mapping.sourceLinePath.join('>'))) return null;
    return `指定路径在展开里无节点，可能被遮住：${describeIncompleteness(incomplete)}`;
  }
  if (incomplete.truncated !== null) return `${incomplete.truncated}：源行可能还有未展开的路径`;
  const covering = regions.filter(region => parentItemId !== undefined && region.items.has(parentItemId));
  if (covering.length > 0) return covering.map(region => region.label).join('；');
  if (located.lines.has(mapping.sourceLineId as string)) return null;
  return `源行在展开里无节点，可能被遮住：${describeIncompleteness(incomplete)}`;
};

/** 不完整展开下逐映射判定（映射 id → 原因；可判定的不在表里）；完整展开返回空表。 */
const undecidableReasons = async (
  adapter: BomLocalAdapter,
  scope: MapScopeInfo,
  expansion: ExpansionResult,
  lineOf: (occurrenceId: string) => string,
  mappings: StoredMapping[]
): Promise<Map<string, string>> => {
  const reasons = new Map<string, string>();
  const incomplete = incompletenessOf(expansion);
  if (incomplete === null) return reasons;
  const located: LocatedLines = { lines: new Set(), paths: new Set() };
  for (const node of expansion.nodes) {
    if (node.occurrenceId === null) continue;
    located.lines.add(lineOf(node.occurrenceId));
    located.paths.add(node.path.map(lineOf).join('>'));
  }
  const parents = await sourceParentItems(
    adapter,
    mappings.map(mapping => mapping.sourceLineId as string)
  );
  const regions = await hiddenRegions(adapter, scope, incomplete.hops);
  for (const mapping of mappings) {
    const reason = mappingUndecidable(
      mapping,
      located,
      parents.get(mapping.sourceLineId as string),
      incomplete,
      regions
    );
    if (reason !== null) reasons.set(mapping.id, reason);
  }
  return reasons;
};

/**
 * 收集映射作用范围内「到源行为止」的解析步骤：行级 = 源行全部展开路径的步骤并集，路径级 = 逻辑行
 * 序列恰为 `sourceLinePath` 的那条路径；每步带该发生项解析所得的子件修订（同一展开内与路径无关）。
 * 源行以下的结构不在内，由其下各行自己的映射负责。
 */
const collectSteps = (
  expansion: ExpansionResult,
  lineOf: (occurrenceId: string) => string,
  sourceLineId: string,
  sourceLinePath: string[] | null
): MappingStep[] => {
  const revisions = new Map(expansion.nodes.map(node => [node.occurrenceId, node.revisionId]));
  const targetKey = sourceLinePath?.join('>');
  const steps = new Map<string, MappingStep>();
  for (const node of expansion.nodes) {
    if (node.occurrenceId === null || lineOf(node.occurrenceId) !== sourceLineId) continue;
    if (targetKey !== undefined && node.path.map(lineOf).join('>') !== targetKey) continue;
    for (const occurrenceId of node.path) {
      const lineId = lineOf(occurrenceId);
      steps.set(`${lineId}:${occurrenceId}`, { lineId, occurrenceId, revisionId: revisions.get(occurrenceId) ?? null });
    }
  }
  return [...steps.values()];
};

/**
 * 确认跟进（AC#7/#19）：把映射的基线整体推进到当前解析依据（到源行为止的解析步骤集合）
 * 与当前目标发生项；不是只改末端发生项。与缺口同一逐映射判定：本映射「路径失效」，或源侧解析可能被
 * 截断 / 未裁决遮住（或根级解析失败）即拒绝并点名，基线不动；展开别处不完整不影响本映射。
 * 非空目标须属于映射目标行，且出现在范围 MBOM 根头的当前解析结果中；校验、解析与基线写入共用一个事务。
 */
export const confirmMapping = async (
  adapter: BomLocalAdapter,
  mappingId: string,
  targetOccurrenceId: string | null,
  context: ResolutionContext
): Promise<void> =>
  adapter.transaction(async executor => {
    await confirmMappingSnapshot(scopedBomAdapter(adapter, executor), mappingId, targetOccurrenceId, context);
  }, false);

const assertTargetOccurrence = async (
  adapter: BomLocalAdapter,
  scope: MapScopeInfo,
  mapping: StoredMapping,
  occurrenceId: string,
  context: ResolutionContext
): Promise<void> => {
  if (mapping.targetLineId === null) {
    throw new BomMapError('targetOccurrenceId', `映射 ${mapping.id} 无目标行，不能确认目标发生项 ${occurrenceId}`);
  }
  const dialect = bomSqlDialectFor(adapter.name);
  const rows = await queryRows(
    adapter,
    `SELECT "lineId" FROM ${dialect.table('bom_line_occurrence')} WHERE "id" = ${dialect.placeholder(0)}`,
    [occurrenceId]
  );
  if (rows.length === 0) throw new BomMapError('targetOccurrenceId', `目标发生项不存在：${occurrenceId}`);
  if (String(rows[0][0]) !== mapping.targetLineId) {
    throw new BomMapError('targetOccurrenceId', `发生项 ${occurrenceId} 不属于目标行 ${mapping.targetLineId}`);
  }
  const expanded = await expandScope(
    adapter,
    scope,
    { ...context, bomType: 'mbom', alternativeNo: undefined },
    targetSide(scope)
  );
  if ('undecidable' in expanded) {
    throw new BomMapError('targetOccurrenceId', `目标侧解析无法判定：${expanded.undecidable}`);
  }
  if (!expanded.expansion.nodes.some(node => node.occurrenceId === occurrenceId)) {
    throw new BomMapError('targetOccurrenceId', `目标发生项 ${occurrenceId} 不在当前上下文的目标侧解析结果中`);
  }
};

const confirmMappingSnapshot = async (
  adapter: BomLocalAdapter,
  mappingId: string,
  targetOccurrenceId: string | null,
  context: ResolutionContext
): Promise<void> => {
  const mapping = await readMapping(adapter, mappingId);
  const scope = await readScope(adapter, mapping.scopeId);
  // 失效映射的「当前依据」不再是范围内的结构：推进基线会把失效吞成无缺口
  const lapsed = (await lapsedMappings(adapter, scope, [mapping])).get(mapping.id);
  if (lapsed !== undefined) throw new BomMapError('确认跟进', `映射已失效，基线不动：${lapsed}`);
  const steps: MappingStep[] = [];
  if (mapping.sourceLineId !== null) {
    const expanded = await expandScope(adapter, scope, context);
    if ('undecidable' in expanded) throw new BomMapError('确认跟进', `源侧解析无法判定：${expanded.undecidable}`);
    const lineOf = await lineLookup(adapter, expanded.expansion);
    const reason = (await undecidableReasons(adapter, scope, expanded.expansion, lineOf, [mapping])).get(mapping.id);
    if (reason !== undefined) throw new BomMapError('确认跟进', `源侧解析无法判定，基线不动：${reason}`);
    steps.push(...collectSteps(expanded.expansion, lineOf, mapping.sourceLineId, mapping.sourceLinePath));
  }
  if (targetOccurrenceId !== null) await assertTargetOccurrence(adapter, scope, mapping, targetOccurrenceId, context);
  const dialect = bomSqlDialectFor(adapter.name);
  await queryRows(
    adapter,
    `UPDATE ${dialect.table('bom_map')} SET "targetOccurrenceId" = ${dialect.placeholder(0)}, "baselineSteps" = ${dialect.placeholder(1)} WHERE "id" = ${dialect.placeholder(2)}`,
    [targetOccurrenceId, JSON.stringify(steps), mappingId]
  );
};

/** 步骤身份：逻辑行 + 发生项 + 解析修订，三者同才算同一步。 */
const stepKey = (step: MappingStep): string => `${step.lineId}:${step.occurrenceId}:${step.revisionId ?? ''}`;

/** 缺口项的「路径失效」标记（逐映射判定表里有原因即失效）。 */
const lapseMark = (lapsed: Map<string, string>, mapping: StoredMapping): MappingGap['invalid'] => {
  const reason = lapsed.get(mapping.id);
  return reason === undefined ? null : { reason };
};

/** 一条已确认映射的基线 / 当前逐步比较：消失或变化的基线步骤 + 新出现的当前步骤。 */
const compareSteps = (mapping: StoredMapping, current: MappingStep[], lapsed: Map<string, string>): MappingGap => {
  const baseline = mapping.baselineSteps ?? [];
  const baselineKeys = new Set(baseline.map(stepKey));
  const currentKeys = new Set(current.map(stepKey));
  const currentByLine = new Map(current.map(step => [step.lineId, step]));
  return {
    mappingId: mapping.id,
    relation: mapping.relation,
    targetLineId: mapping.targetLineId,
    undecidable: null,
    invalid: lapseMark(lapsed, mapping),
    differences: baseline
      .filter(step => !currentKeys.has(stepKey(step)))
      .map((step): MappingGap['differences'][number] => {
        const replacement = currentByLine.get(step.lineId) ?? null;
        return { baseline: step, current: replacement, kind: replacement === null ? 'missing' : 'changed' };
      }),
    appeared: current.filter(step => !baselineKeys.has(stepKey(step)))
  };
};

/** 无法判定的缺口项：不算无缺口，点名原因。 */
const undecidableGap = (mapping: StoredMapping, reason: string, lapsed: Map<string, string>): MappingGap => ({
  mappingId: mapping.id,
  relation: mapping.relation,
  targetLineId: mapping.targetLineId,
  undecidable: { reason },
  invalid: lapseMark(lapsed, mapping),
  differences: [],
  appeared: []
});

/**
 * 跟进缺口查询（AC#4/#8/#16~#22）：按 ResolutionContext 自范围根头求当前解析依据，
 * 与基线逐步比较——任一步的发生项或解析修订不同、出现或消失即为缺口。逐映射判定（AC#22）：
 * 根级解析失败时全部无法判定；展开截断 / 含未裁决跳时只有源行可能被遮住的映射标「无法判定」
 * 并点名那一跳，其余映射照常比较。「路径失效」的映射另标 `invalid`（与覆盖率同一判据与原因），
 * 差异照常给出。未确认过（无基线）的映射不列。
 */
export const mappingGaps = async (
  adapter: BomLocalAdapter,
  scopeId: string,
  context: ResolutionContext
): Promise<MappingGapsResult> => {
  const scope = await readScope(adapter, scopeId);
  const mappings = (await readMappings(adapter, scopeId)).filter(
    mapping => mapping.sourceLineId !== null && mapping.baselineSteps !== null
  );
  const expanded = await expandScope(adapter, scope, context);
  const lapsed = await lapsedMappings(adapter, scope, mappings);
  if ('undecidable' in expanded) {
    return { scopeId, gaps: mappings.map(mapping => undecidableGap(mapping, expanded.undecidable, lapsed)) };
  }
  const lineOf = await lineLookup(adapter, expanded.expansion);
  const reasons = await undecidableReasons(adapter, scope, expanded.expansion, lineOf, mappings);
  return {
    scopeId,
    gaps: mappings.map(mapping => {
      const reason = reasons.get(mapping.id);
      if (reason !== undefined) return undecidableGap(mapping, reason, lapsed);
      return compareSteps(
        mapping,
        collectSteps(expanded.expansion, lineOf, mapping.sourceLineId as string, mapping.sourceLinePath),
        lapsed
      );
    })
  };
};
