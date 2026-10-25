/**
 * @fileoverview BOM 解析 / 展开的 SQL 构造（两后端共用同一份结构，只分叉占位符与表引用）
 *
 * 事务执行器的 `query()` 在 SQLite 家族与 PGlite 上的返回形状已统一为
 * `{ columns, rows }`；本模块只负责按方言生成 SQL 文本。读取全部发生在
 * `adapter.transaction` 里（US-508 AC#15 的一致快照），占位符由 {@link BomSqlDialect} 生成。
 */

/** 占位符与表引用的方言差异。 */
export interface BomSqlDialect {
  /** 第 n 个（0 起）参数的占位符文本。 */
  placeholder(index: number): string;
  /** 表引用（BOM 实体共享 `bom` 命名空间）。 */
  table(table: string): string;
  /** 绑定值编码：SQLite 不支持 Date 绑定，转 ISO 文本；PGlite 原样。 */
  encode(value: unknown): unknown;
}

/** SQLite 方言：`?` 占位符、`bom$表` 表名、Date → ISO 文本。 */
export const sqliteBomDialect: BomSqlDialect = {
  placeholder: () => '?',
  table: table => `"bom$${table}"`,
  encode: value => (value instanceof Date ? value.toISOString() : value)
};

/** PGlite 方言：`$n` 占位符、`bom"."表` 表引用。 */
export const pgliteBomDialect: BomSqlDialect = {
  placeholder: index => `$${index + 1}`,
  table: table => `"bom"."${table}"`,
  encode: value => value
};

/** 按适配器名选方言；未知后端抛错（与触发器后端的口径一致）。 */
export const bomSqlDialectFor = (adapterName: string | undefined): BomSqlDialect => {
  if (adapterName === 'pglite') return pgliteBomDialect;
  if (adapterName && adapterName !== 'http' && adapterName !== 'supabase') return sqliteBomDialect;
  throw new Error(`[rxdb-plugin-bom] 适配器 ${adapterName ?? '(无本地适配器)'} 没有可用的 BOM 解析后端`);
};

/** 已解析发生项查询的参数集合（按顺序绑定）。 */
export interface ResolvedOccurrenceParams {
  asOfDate: Date;
  parentRevisionId: string;
  bomType: string;
  orgId: string;
  alternativeNo?: number;
}

/**
 * imprecise 行的子件修订解析表达式：released 且 `effective_from ≤ 评估日` 的最大
 * effective_from——「最新」的唯一性由 US-508 AC#10 的部分唯一索引保证；评估日前
 * 无已发布修订时为 NULL（该子件按叶子处理，不再下钻）。
 */
const childRevisionExpr = (
  dialect: BomSqlDialect,
  revisionTable: string,
  bind: (value: unknown) => string,
  asOfDate: Date,
  alias: string
): string =>
  `COALESCE(${alias}."childRevisionId", (SELECT r."id" FROM ${revisionTable} r WHERE r."itemId" = ${alias}."childItemId" AND r."state" = 'released' AND r."effectiveFrom" <= ${bind(asOfDate)} ORDER BY r."effectiveFrom" DESC LIMIT 1))`;

/**
 * ECN 可见性（US-515 / US-508 AC#12）：引入侧挂未发布 ECN 的发生项不入结果
 * （draft 与 cancelled 都排除）；ecn 表按方言引用。
 */
const ecnVisibleExpr = (dialect: BomSqlDialect, alias: string): string =>
  `(${alias}."ecnInId" IS NULL OR EXISTS (SELECT 1 FROM ${dialect.table('ecn')} e WHERE e."id" = ${alias}."ecnInId" AND e."state" = 'released'))`;

/**
 * 截止侧采信（US-515 / US-508 AC#12）：`ecn_out_id` 指向 released ECN 时按存储
 * `effective_to` 比较；指向未发布 ECN 的截止不截止（视为 +∞，上界恒过）。
 * 可见性只看 ECN 状态与 `as_of_date`，不读宿主当日（US-508 AC#16）。
 * 注意 `ecnOutId IS NOT NULL` 守卫：无截止标记的行不落入「未发布不采信」分支。
 */
const ecnEffectiveToExpr = (
  dialect: BomSqlDialect,
  alias: string,
  bind: (value: unknown) => string,
  asOfDate: Date
): string =>
  `(${alias}."effectiveTo" IS NULL OR ${alias}."effectiveTo" > ${bind(asOfDate)} OR ` +
  `(${alias}."ecnOutId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${dialect.table('ecn')} e WHERE e."id" = ${alias}."ecnOutId" AND e."state" = 'released')))`;

/**
 * 生成「已解析的发生项」查询：released 头 + 生效窗口含评估日 + 子件修订解析。
 *
 * @param dialect - 方言
 * @param params - 查询参数（返回值含按占位符顺序的参数数组）
 * @returns `{ sql, params }`；行列为 `lineId, lineNo, occurrenceId, childItemId,
 *   childRevisionId, resolvedChildRevisionId, qty, effectiveFrom, effectiveTo`
 *
 * @remarks
 * 首轮没有 `ecn` 实体，`ecn_in_id` / `ecn_out_id` 恒空，可见性退化为只看头状态（US-508）。
 * imprecise 行的子件修订解析用相关子查询取「released 且 effective_from ≤ 评估日」的最大
 * effective_from——「最新」的唯一性由 US-508 AC#10 的部分唯一索引保证。
 */
export const buildResolvedOccurrencesSql = (
  dialect: BomSqlDialect,
  params: ResolvedOccurrenceParams
): { sql: string; params: unknown[] } => {
  const bind: unknown[] = [];
  const p = (value: unknown): string => {
    bind.push(dialect.encode(value));
    return dialect.placeholder(bind.length - 1);
  };

  const occurrence = dialect.table('bom_line_occurrence');
  const line = dialect.table('bom_line');
  const header = dialect.table('bom_header');
  const revision = dialect.table('item_revision');

  const sql = [
    `SELECT`,
    `  l."id" AS "lineId",`,
    `  l."lineNo" AS "lineNo",`,
    `  occ."id" AS "occurrenceId",`,
    `  occ."childItemId" AS "childItemId",`,
    `  occ."childRevisionId" AS "childRevisionId",`,
    `  ${childRevisionExpr(dialect, revision, p, params.asOfDate, 'occ')} AS "resolvedChildRevisionId",`,
    `  occ."qty" AS "qty",`,
    `  occ."qtyFormula" AS "qtyFormula",`,
    `  occ."formulaGrammarVersion" AS "formulaGrammarVersion",`,
    `  occ."effectiveFrom" AS "effectiveFrom",`,
    `  occ."effectiveTo" AS "effectiveTo",`,
    `  occ."unitFrom" AS "unitFrom",`,
    `  occ."unitTo" AS "unitTo",`,
    `  occ."lotCodes" AS "lotCodes",`,
    `  occ."selectionConditionId" AS "selectionConditionId"`,
    `FROM ${occurrence} occ`,
    `JOIN ${line} l ON l."id" = occ."lineId"`,
    `JOIN ${header} h ON h."id" = l."headerId"`,
    `JOIN ${revision} r ON r."id" = h."parentRevisionId"`,
    `WHERE h."state" = 'released'`,
    `  AND h."parentRevisionId" = ${p(params.parentRevisionId)}`,
    `  AND h."bomType" = ${p(params.bomType)}`,
    `  AND h."orgId" = ${p(params.orgId)}`,
    ...(params.alternativeNo !== undefined ? [`  AND h."alternativeNo" = ${p(params.alternativeNo)}`] : []),
    `  AND occ."effectiveFrom" <= ${p(params.asOfDate)}`,
    `  AND ${ecnEffectiveToExpr(dialect, 'occ', p, params.asOfDate)}`,
    `  AND ${ecnVisibleExpr(dialect, 'occ')}`,
    `ORDER BY l."lineNo" ASC, occ."effectiveFrom" ASC, occ."id" ASC`
  ].join('\n');

  return { sql, params: bind };
};

/**
 * 生成「备选头」查询：父修订下的 released 头（按 bom_type / org / 可选 alternative）。
 */
export const buildAlternativeHeadersSql = (
  dialect: BomSqlDialect,
  params: { parentRevisionId: string; bomType: string; orgId: string }
): { sql: string; params: unknown[] } => {
  const bind: unknown[] = [];
  const p = (value: unknown): string => {
    bind.push(dialect.encode(value));
    return dialect.placeholder(bind.length - 1);
  };
  const header = dialect.table('bom_header');
  const sql = [
    `SELECT h."id" AS "headerId", h."alternativeNo" AS "alternativeNo", h."baseUom" AS "baseUom",`,
    `  h."baseQty" AS "baseQty", h."assemblyScrap" AS "assemblyScrap", h."assemblyScrapConvention" AS "assemblyScrapConvention",`,
    `  h."costLotQty" AS "costLotQty", h."routingId" AS "routingId"`,
    `FROM ${header} h`,
    `WHERE h."state" = 'released'`,
    `  AND h."parentRevisionId" = ${p(params.parentRevisionId)}`,
    `  AND h."bomType" = ${p(params.bomType)}`,
    `  AND h."orgId" = ${p(params.orgId)}`,
    `ORDER BY h."alternativeNo" ASC`
  ].join('\n');
  return { sql, params: bind };
};

/**
 * 生成「前沿修订的备选头」查询（US-510 下钻按修订裁决备选）：给定修订集下的 released 头，
 * 行列为 `headerId, parentRevisionId, parentItemId, alternativeNo`，按修订与备选编号排序。
 */
export const buildRevisionHeadersSql = (
  dialect: BomSqlDialect,
  params: { bomType: string; orgId: string; revisionIds: string[] }
): { sql: string; params: unknown[] } => {
  const bind: unknown[] = [];
  const p = (value: unknown): string => {
    bind.push(dialect.encode(value));
    return dialect.placeholder(bind.length - 1);
  };
  const sql = [
    `SELECT h."id" AS "headerId", h."parentRevisionId" AS "parentRevisionId", r."itemId" AS "parentItemId",`,
    `  h."alternativeNo" AS "alternativeNo"`,
    `FROM ${dialect.table('bom_header')} h`,
    `JOIN ${dialect.table('item_revision')} r ON r."id" = h."parentRevisionId"`,
    `WHERE h."state" = 'released'`,
    `  AND h."bomType" = ${p(params.bomType)}`,
    `  AND h."orgId" = ${p(params.orgId)}`,
    `  AND h."parentRevisionId" IN (${params.revisionIds.map(id => p(id)).join(', ')})`,
    `ORDER BY h."parentRevisionId" ASC, h."alternativeNo" ASC`
  ].join('\n');
  return { sql, params: bind };
};

/**
 * 生成「父修订选择」查询：显式 id 或「评估日前已发布的最新修订」（US-508 AC#6）。
 */
export const buildParentRevisionSql = (
  dialect: BomSqlDialect,
  params: { itemId: string; asOfDate: Date; explicitRevisionId?: string }
): { sql: string; params: unknown[] } => {
  const bind: unknown[] = [];
  const p = (value: unknown): string => {
    bind.push(dialect.encode(value));
    return dialect.placeholder(bind.length - 1);
  };
  const revision = dialect.table('item_revision');
  const sql =
    params.explicitRevisionId !== undefined ?
      [
        `SELECT r."id" AS "revisionId", r."itemId" AS "itemId", r."state" AS "state"`,
        `FROM ${revision} r WHERE r."id" = ${p(params.explicitRevisionId)}`
      ].join('\n')
    : [
        `SELECT r."id" AS "revisionId", r."itemId" AS "itemId", r."state" AS "state"`,
        `FROM ${revision} r`,
        `WHERE r."itemId" = ${p(params.itemId)} AND r."state" = 'released' AND r."effectiveFrom" <= ${p(params.asOfDate)}`,
        `ORDER BY r."effectiveFrom" DESC LIMIT 1`
      ].join('\n');
  return { sql, params: bind };
};

/** 按前沿头集取已解析发生项（含头数量语义与子件主数据）的参数集合。 */
export interface HeaderOccurrencesParams {
  asOfDate: Date;
  bomType: string;
  orgId: string;
  /** 前沿头 id 集（非空；调用方分块）。 */
  headerIds: string[];
}

/**
 * 生成「一层数量展开」查询（US-511）：给定前沿头集，返回这些头下已解析的发生项
 * （released 头 + 生效窗口 + 子件修订解析），连同头的基准单位/基准量/装配损耗、
 * 子件物料的库存单位/小数位/换算率、子件修订的 default_phantom（LEFT JOIN，无修订时为 NULL）。
 * 行按 `(lineNo, effectiveFrom, id)` 排序保证同层确定性。
 */
export const buildHeaderOccurrencesSql = (
  dialect: BomSqlDialect,
  params: HeaderOccurrencesParams
): { sql: string; params: unknown[] } => {
  const bind: unknown[] = [];
  const p = (value: unknown): string => {
    bind.push(dialect.encode(value));
    return dialect.placeholder(bind.length - 1);
  };

  const occurrence = dialect.table('bom_line_occurrence');
  const line = dialect.table('bom_line');
  const header = dialect.table('bom_header');
  const revision = dialect.table('item_revision');
  const item = dialect.table('item');

  // 同一表达式在 SELECT 与 JOIN ON 各出现一次：分别构造、各自绑定占位符
  const resolvedSelect = childRevisionExpr(dialect, revision, p, params.asOfDate, 'occ');
  const resolvedJoin = childRevisionExpr(dialect, revision, p, params.asOfDate, 'occ');
  const sql = [
    `SELECT`,
    `  h."id" AS "headerId",`,
    `  h."baseUom" AS "headerBaseUom",`,
    `  h."baseQty" AS "headerBaseQty",`,
    `  h."assemblyScrap" AS "headerAssemblyScrap",`,
    `  h."assemblyScrapConvention" AS "headerAssemblyScrapConvention",`,
    `  h."routingId" AS "headerRoutingId",`,
    `  h."alternativeNo" AS "alternativeNo",`,
    `  h."parentRevisionId" AS "parentRevisionId",`,
    `  r."itemId" AS "parentItemId",`,
    `  l."id" AS "lineId",`,
    `  l."lineNo" AS "lineNo",`,
    `  occ."id" AS "occurrenceId",`,
    `  occ."childItemId" AS "childItemId",`,
    `  occ."childRevisionId" AS "childRevisionId",`,
    `  ${resolvedSelect} AS "resolvedChildRevisionId",`,
    `  occ."qty" AS "qty",`,
    `  occ."qtyFormula" AS "qtyFormula",`,
    `  occ."formulaGrammarVersion" AS "formulaGrammarVersion",`,
    `  occ."isFixedQty" AS "isFixedQty",`,
    `  occ."tierGroupNo" AS "tierGroupNo",`,
    `  occ."lotsizeFrom" AS "lotsizeFrom",`,
    `  occ."lotsizeTo" AS "lotsizeTo",`,
    `  occ."componentScrap" AS "componentScrap",`,
    `  occ."componentScrapConvention" AS "componentScrapConvention",`,
    `  occ."componentScrapFixed" AS "componentScrapFixed",`,
    `  occ."uom" AS "occurrenceUom",`,
    `  occ."uomConversion" AS "occurrenceUomConversion",`,
    `  occ."phantomOverride" AS "phantomOverride",`,
    `  occ."flowDirection" AS "flowDirection",`,
    `  occ."effectiveFrom" AS "effectiveFrom",`,
    `  occ."effectiveTo" AS "effectiveTo",`,
    `  occ."unitFrom" AS "unitFrom",`,
    `  occ."unitTo" AS "unitTo",`,
    `  occ."lotCodes" AS "lotCodes",`,
    `  occ."selectionConditionId" AS "selectionConditionId",`,
    `  cr."defaultPhantom" AS "childRevisionPhantom",`,
    `  ci."stockUom" AS "childStockUom",`,
    `  ci."uomDecimals" AS "childUomDecimals",`,
    `  ci."uomConversion" AS "childItemUomConversion",`,
    `  occ."substituteGroupId" AS "substituteGroupId",`,
    `  sg."code" AS "substituteGroupCode",`,
    `  sg."strategy" AS "substituteStrategy",`,
    `  sg."allowMix" AS "substituteAllowMix",`,
    `  occ."substituteRole" AS "substituteRole",`,
    `  occ."substitutePriority" AS "substitutePriority",`,
    `  occ."usageProbability" AS "usageProbability",`,
    `  occ."equivQty" AS "equivQty",`,
    `  occ."operationSeq" AS "operationSeq"`,
    `FROM ${occurrence} occ`,
    `JOIN ${line} l ON l."id" = occ."lineId"`,
    `JOIN ${header} h ON h."id" = l."headerId"`,
    `JOIN ${revision} r ON r."id" = h."parentRevisionId"`,
    `JOIN ${item} ci ON ci."id" = occ."childItemId"`,
    `LEFT JOIN ${revision} cr ON cr."id" = ${resolvedJoin}`,
    `LEFT JOIN ${dialect.table('bom_substitute_group')} sg ON sg."id" = occ."substituteGroupId"`,
    `WHERE h."state" = 'released'`,
    `  AND h."bomType" = ${p(params.bomType)}`,
    `  AND h."orgId" = ${p(params.orgId)}`,
    `  AND h."id" IN (${params.headerIds.map(id => p(id)).join(', ')})`,
    `  AND occ."effectiveFrom" <= ${p(params.asOfDate)}`,
    `  AND ${ecnEffectiveToExpr(dialect, 'occ', p, params.asOfDate)}`,
    `  AND ${ecnVisibleExpr(dialect, 'occ')}`,
    `ORDER BY l."lineNo" ASC, occ."effectiveFrom" ASC, occ."id" ASC`
  ].join('\n');

  return { sql, params: bind };
};

/** 按前沿修订集取子件发生项的参数集合（按顺序绑定：类型、组织、评估日、修订 id 集）。 */
export interface ChildrenOfRevisionsParams {
  asOfDate: Date;
  bomType: string;
  orgId: string;
  /** 前沿父修订 id 集（非空；调用方分块）。 */
  revisionIds: string[];
}

/**
 * 生成「一层下钻」查询（US-510 阶段 A）：给定前沿父修订集，返回这些修订的已解析发生项
 * （released 头 + 生效窗口含评估日 + 子件修订解析），行按 `(lineNo, effectiveFrom, id)`
 * 排序保证 BFS 同层确定性。
 *
 * @returns 行列为 `parentRevisionId, lineId, lineNo, occurrenceId, childItemId,
 *   childRevisionId, resolvedChildRevisionId, qty, effectiveFrom, effectiveTo`
 */
export const buildChildrenOfRevisionsSql = (
  dialect: BomSqlDialect,
  params: ChildrenOfRevisionsParams
): { sql: string; params: unknown[] } => {
  const bind: unknown[] = [];
  const p = (value: unknown): string => {
    bind.push(dialect.encode(value));
    return dialect.placeholder(bind.length - 1);
  };

  const occurrence = dialect.table('bom_line_occurrence');
  const line = dialect.table('bom_line');
  const header = dialect.table('bom_header');
  const revision = dialect.table('item_revision');

  const sql = [
    `SELECT`,
    `  h."parentRevisionId" AS "parentRevisionId",`,
    `  l."id" AS "lineId",`,
    `  l."lineNo" AS "lineNo",`,
    `  occ."id" AS "occurrenceId",`,
    `  occ."childItemId" AS "childItemId",`,
    `  occ."childRevisionId" AS "childRevisionId",`,
    `  ${childRevisionExpr(dialect, revision, p, params.asOfDate, 'occ')} AS "resolvedChildRevisionId",`,
    `  occ."qty" AS "qty",`,
    `  occ."flowDirection" AS "flowDirection",`,
    `  occ."effectiveFrom" AS "effectiveFrom",`,
    `  occ."effectiveTo" AS "effectiveTo",`,
    `  occ."unitFrom" AS "unitFrom",`,
    `  occ."unitTo" AS "unitTo",`,
    `  occ."lotCodes" AS "lotCodes",`,
    `  occ."selectionConditionId" AS "selectionConditionId",`,
    `  h."id" AS "headerId",`,
    `  h."alternativeNo" AS "alternativeNo",`,
    `  r."itemId" AS "parentItemId"`,
    `FROM ${occurrence} occ`,
    `JOIN ${line} l ON l."id" = occ."lineId"`,
    `JOIN ${header} h ON h."id" = l."headerId"`,
    `JOIN ${revision} r ON r."id" = h."parentRevisionId"`,
    `WHERE h."state" = 'released'`,
    `  AND h."bomType" = ${p(params.bomType)}`,
    `  AND h."orgId" = ${p(params.orgId)}`,
    `  AND h."parentRevisionId" IN (${params.revisionIds.map(id => p(id)).join(', ')})`,
    `  AND occ."effectiveFrom" <= ${p(params.asOfDate)}`,
    `  AND ${ecnEffectiveToExpr(dialect, 'occ', p, params.asOfDate)}`,
    `  AND ${ecnVisibleExpr(dialect, 'occ')}`,
    `ORDER BY l."lineNo" ASC, occ."effectiveFrom" ASC, occ."id" ASC`
  ].join('\n');

  return { sql, params: bind };
};

/** 按前沿物料集取使用方发生项的参数集合（按顺序绑定：类型、组织、评估日、物料 id 集）。 */
export interface ParentsOfItemsParams {
  asOfDate: Date;
  bomType: string;
  orgId: string;
  /** 被反查的物料 id 集（非空；调用方分块）。 */
  itemIds: string[];
  /** 同时读取命中逻辑行的全部有效候选，交给序列、批次与配置裁决。 */
  includeLineCandidates?: boolean;
}

/**
 * 生成「一层反查」查询（US-510 阶段 A）：给定前沿物料集，返回以这些物料为子件的已解析
 * 发生项（released 头 + 生效窗口含评估日），行按 `(lineNo, effectiveFrom, id)` 排序。
 * `includeLineCandidates` 为 true 时返回命中逻辑行的全部有效候选，供反查先消歧再筛选目标子件。
 *
 * @returns 行列为 `parentItemId, parentRevisionId, lineId, lineNo, occurrenceId,
 *   childItemId, qty, effectiveFrom, effectiveTo`
 */
export const buildParentsOfItemsSql = (
  dialect: BomSqlDialect,
  params: ParentsOfItemsParams
): { sql: string; params: unknown[] } => {
  const bind: unknown[] = [];
  const p = (value: unknown): string => {
    bind.push(dialect.encode(value));
    return dialect.placeholder(bind.length - 1);
  };

  const occurrence = dialect.table('bom_line_occurrence');
  const line = dialect.table('bom_line');
  const header = dialect.table('bom_header');
  const revision = dialect.table('item_revision');

  const sql = [
    `SELECT`,
    `  r."itemId" AS "parentItemId",`,
    `  h."parentRevisionId" AS "parentRevisionId",`,
    `  l."id" AS "lineId",`,
    `  l."lineNo" AS "lineNo",`,
    `  occ."id" AS "occurrenceId",`,
    `  occ."childItemId" AS "childItemId",`,
    `  occ."qty" AS "qty",`,
    `  occ."flowDirection" AS "flowDirection",`,
    `  occ."effectiveFrom" AS "effectiveFrom",`,
    `  occ."effectiveTo" AS "effectiveTo",`,
    `  occ."unitFrom" AS "unitFrom",`,
    `  occ."unitTo" AS "unitTo",`,
    `  occ."lotCodes" AS "lotCodes",`,
    `  occ."selectionConditionId" AS "selectionConditionId",`,
    `  h."id" AS "headerId",`,
    `  h."alternativeNo" AS "alternativeNo"`,
    `FROM ${occurrence} occ`,
    `JOIN ${line} l ON l."id" = occ."lineId"`,
    `JOIN ${header} h ON h."id" = l."headerId"`,
    `JOIN ${revision} r ON r."id" = h."parentRevisionId"`,
    `WHERE h."state" = 'released'`,
    `  AND h."bomType" = ${p(params.bomType)}`,
    `  AND h."orgId" = ${p(params.orgId)}`,
    params.includeLineCandidates ?
      `  AND occ."lineId" IN (SELECT candidate."lineId" FROM ${occurrence} candidate
        WHERE candidate."childItemId" IN (${params.itemIds.map(id => p(id)).join(', ')})
          AND candidate."effectiveFrom" <= ${p(params.asOfDate)}
          AND ${ecnEffectiveToExpr(dialect, 'candidate', p, params.asOfDate)}
          AND ${ecnVisibleExpr(dialect, 'candidate')})`
    : `  AND occ."childItemId" IN (${params.itemIds.map(id => p(id)).join(', ')})`,
    `  AND occ."effectiveFrom" <= ${p(params.asOfDate)}`,
    `  AND ${ecnEffectiveToExpr(dialect, 'occ', p, params.asOfDate)}`,
    `  AND ${ecnVisibleExpr(dialect, 'occ')}`,
    `ORDER BY l."lineNo" ASC, occ."effectiveFrom" ASC, occ."id" ASC`
  ].join('\n');

  return { sql, params: bind };
};
