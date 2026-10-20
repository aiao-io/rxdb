/**
 * @fileoverview 配置保存期校验与配置输入判定（US-517）
 *
 * 保存期：解析选择条件并核对特征 / 值引用——未知标识一次性点名位置（AC#5），
 * 语法错误由解析器直接点名（{@link BomConfigSyntaxError}），不留到展开期才炸。
 * 配置输入面（求解契约的纯函数段）：必选特征完整性（AC#3，缺参不静默产出部分结构）
 * 与依赖约束冲突判定（AC#2：exclude 互斥 / require 蕴含）。
 */

import type { BomSqlDialect } from './bom-sql.js';
import {
  BomConfigError,
  CONDITION_GRAMMAR_VERSION,
  evaluateCondition,
  extractCharCodes,
  parseCondition,
  positionText,
  type ConditionAst
} from './config-condition.js';
import { BomResolutionError, type ResolutionContext, type UnresolvedAlternative } from './resolution.js';
import { lotMatches, parseLotCodes, unitIntervalMatches, unitIntervalOverlaps } from './unit-lot.js';

/** 行 / 列位置的人读形式；无位置信息（手工构造的 AST）时省略。 */
const positionOf = (expression: string, offset: number | undefined): string =>
  offset === undefined ? '' : `（${positionText(expression, offset)}）`;

/**
 * 保存期校验选择条件的引用（AC#5）：解析后遍历 AST，特征与值必须存在于已知集合。
 *
 * @remarks
 * 语法错误由 {@link parseCondition} 原样上抛（BomConfigSyntaxError，是 BomConfigError 的子类）；
 * 未知标识逐个收集、一次性点名（每个都带行 / 列位置），不静默放行。
 *
 * @param expression - 条件表达式文本
 * @param knownChars - 已存在的特征 code 集合（如本组织的 config_char）
 * @param knownValues - 已存在的选项值集合（如本组织的 config_char_value）
 * @throws {@link BomConfigError} 引用未知特征 / 值（点名标识与位置）
 */
export const validateConditionReferences = (
  expression: string,
  knownChars: Set<string>,
  knownValues: Set<string> | Map<string, Set<string>>
): void => {
  const { ast } = parseCondition(expression);
  const problems: string[] = [];
  const visit = (node: ConditionAst): void => {
    switch (node.kind) {
      case 'atom': {
        if (!knownChars.has(node.charCode)) {
          problems.push(`未知特征「${node.charCode}」${positionOf(expression, node.offset)}`);
        }
        const values = node.op === 'in' ? node.value : [node.value];
        values.forEach((value, index) => {
          if (!(knownValues instanceof Map ? knownValues.get(node.charCode)?.has(value) : knownValues.has(value))) {
            problems.push(`未知值「${value}」${positionOf(expression, node.valueOffsets?.[index])}`);
          }
        });
        break;
      }
      case 'and':
      case 'or':
        node.operands.forEach(visit);
        break;
      case 'not':
        visit(node.operand);
        break;
    }
  };
  visit(ast);
  if (problems.length > 0) {
    throw new BomConfigError(`条件 ${expression}`, problems.join('；'));
  }
};

/**
 * 必选特征完整性判定（AC#3）
 *
 * @remarks
 * 未赋值 = 配置输入里没有该特征，或选中值集合为空。返回未赋值特征列表而非部分结构：
 * 调用方据此整体拒绝（US-517 AC#3「不静默产出部分结构」）。返回顺序随 `requiredChars`，
 * 重复 code 只报告一次。
 *
 * @param selection - 配置输入（特征 code → 选中值集合）
 * @param requiredChars - 必选特征 code 列表（config_char.required = true 的那些）
 * @returns 未赋值的必选特征 code 列表（空 = 配置完整）
 */
export const checkConfigCompleteness = (selection: Record<string, string[]>, requiredChars: string[]): string[] => {
  const missing: string[] = [];
  const reported = new Set<string>();
  for (const code of requiredChars) {
    if (reported.has(code)) continue;
    reported.add(code);
    const selected = Object.hasOwn(selection, code) ? selection[code] : undefined;
    if (selected === undefined || selected.length === 0) {
      missing.push(code);
    }
  }
  return missing;
};

/** 依赖约束的求值输入（两侧各一条已解析的选择条件，同一语法版本）。 */
export interface ConfigConstraintInput {
  /** 约束 code（冲突消息点名）。 */
  code: string;
  /** exclude 互斥（两侧同真即冲突）/ require 蕴含（左真右假即冲突）。 */
  kind: 'exclude' | 'require';
  leftAst: ConditionAst;
  rightAst: ConditionAst;
}

const conditionText = (ast: ConditionAst): string => {
  if (ast.kind === 'not') return `NOT (${conditionText(ast.operand)})`;
  if (ast.kind !== 'atom')
    return ast.operands.map(operand => `(${conditionText(operand)})`).join(ast.kind === 'and' ? ' AND ' : ' OR ');
  if (ast.op === 'in') return `${ast.charCode} in (${ast.value.join(', ')})`;
  return `${ast.charCode} ${ast.op === 'eq' ? '=' : '!='} ${ast.value}`;
};

/**
 * 依赖约束冲突判定（AC#2）：对给定配置输入分别求两侧条件，按种类判冲突。
 *
 * @remarks
 * 只做「条件 → 条件」一级求值，约束之间不做推理（求解契约：外挂求解器在冲突清单上
 * 做约束传播，不在本函数内）。未知种类按违约报告——数据损坏也要出声，不静默跳过。
 *
 * @param constraints - 依赖约束（含已解析的两侧条件）
 * @param selection - 配置输入（特征 code → 选中值集合）
 * @returns 冲突清单（中文消息，按约束顺序；空 = 无冲突）
 */
export const checkConfigConflicts = (
  constraints: ConfigConstraintInput[],
  selection: Record<string, string[]>
): string[] => {
  const conflicts: string[] = [];
  for (const constraint of constraints) {
    const leftSatisfied = evaluateCondition(constraint.leftAst, selection);
    const rightSatisfied = evaluateCondition(constraint.rightAst, selection);
    if (constraint.kind === 'exclude') {
      if (leftSatisfied && rightSatisfied) {
        conflicts.push(
          `约束「${constraint.code}」：左/右条件同时满足（${conditionText(constraint.leftAst)}；${conditionText(constraint.rightAst)}）`
        );
      }
    } else if (constraint.kind === 'require') {
      if (leftSatisfied && !rightSatisfied) {
        conflicts.push(
          `约束「${constraint.code}」：左条件满足而右条件不满足（${conditionText(constraint.leftAst)}；${conditionText(constraint.rightAst)}）`
        );
      }
    } else {
      conflicts.push(`约束「${constraint.code}」：未知约束种类「${String(constraint.kind)}」，按违约报告`);
    }
  }
  return conflicts;
};

interface ConfigurationQuery {
  (sql: string, params?: unknown[]): Promise<{ columns: string[]; rows: unknown[][] }>;
}

/** 在调用方的快照内按组织读取配置，校验相关必选特征、输入取值与约束后求值。 */
export const evaluateConfigConditions = async (
  query: ConfigurationQuery,
  dialect: BomSqlDialect,
  context: ResolutionContext,
  conditionIds: string[]
): Promise<Map<string, boolean>> => {
  const truth = new Map<string, boolean>();
  if (conditionIds.length === 0 && context.configSelection === undefined) return truth;
  const selection = context.configSelection ?? {};
  const org = [context.orgId];
  const conditionResult = await query(
    `SELECT "id", "expression", "grammarVersion" FROM ${dialect.table('config_condition')} WHERE "orgId" = ${dialect.placeholder(0)} ORDER BY "id"`,
    org
  );
  const conditions = new Map(
    conditionResult.rows.map(row => [String(row[0]), { expression: String(row[1]), version: String(row[2]) }])
  );
  const asts = new Map<string, ConditionAst>();
  const astOf = (id: string): ConditionAst => {
    const cached = asts.get(id);
    if (cached !== undefined) return cached;
    const condition = conditions.get(id);
    if (condition === undefined) throw new BomConfigError(id, '选择条件不存在或不属于当前组织');
    if (condition.version !== CONDITION_GRAMMAR_VERSION)
      throw new BomConfigError(id, `不支持的条件语法版本「${condition.version}」`);
    const ast = parseCondition(condition.expression).ast;
    asts.set(id, ast);
    return ast;
  };
  const relevant = new Set(conditionIds.flatMap(id => extractCharCodes(astOf(id))));
  for (const code of Object.keys(selection)) relevant.add(code);
  const charResult = await query(
    `SELECT "id", "code", "required" FROM ${dialect.table('config_char')} WHERE "orgId" = ${dialect.placeholder(0)} ORDER BY "code"`,
    org
  );
  const knownChars = new Set(charResult.rows.map(row => String(row[1])));
  const valuesResult = await query(
    `SELECT c."code", v."value" FROM ${dialect.table('config_char_value')} v JOIN ${dialect.table('config_char')} c ON c."id" = v."charId" WHERE c."orgId" = ${dialect.placeholder(0)}`,
    org
  );
  const values = new Map<string, Set<string>>();
  for (const row of valuesResult.rows) {
    const code = String(row[0]);
    const list = values.get(code) ?? new Set<string>();
    list.add(String(row[1]));
    values.set(code, list);
  }
  for (const [code, selected] of Object.entries(selection)) {
    if (!knownChars.has(code)) throw new BomConfigError('配置输入', `未知特征「${code}」`);
    for (const value of selected) {
      if (!values.get(code)?.has(value)) throw new BomConfigError('配置输入', `特征「${code}」未知值「${value}」`);
    }
  }
  const constraintResult = await query(
    `SELECT "code", "kind", "leftConditionId", "rightConditionId" FROM ${dialect.table('config_constraint')} WHERE "orgId" = ${dialect.placeholder(0)} ORDER BY "code"`,
    org
  );
  const constraints = constraintResult.rows.map(row => ({
    code: String(row[0]),
    kind: String(row[1]) as ConfigConstraintInput['kind'],
    leftAst: astOf(String(row[2])),
    rightAst: astOf(String(row[3]))
  }));
  const active = new Set<ConfigConstraintInput>();
  let count = -1;
  while (count !== relevant.size) {
    count = relevant.size;
    for (const constraint of constraints) {
      const codes = [...extractCharCodes(constraint.leftAst), ...extractCharCodes(constraint.rightAst)];
      if (!codes.some(code => relevant.has(code))) continue;
      active.add(constraint);
      for (const code of codes) relevant.add(code);
    }
  }
  const required = charResult.rows
    .filter(row => Boolean(row[2]) && relevant.has(String(row[1])))
    .map(row => String(row[1]));
  const missing = checkConfigCompleteness(selection, required);
  if (missing.length > 0) throw new BomConfigError('配置输入', `配置不完整：必选特征未赋值——${missing.join('、')}`);
  const conflicts = checkConfigConflicts([...active], selection);
  if (conflicts.length > 0) throw new BomConfigError('配置输入', conflicts.join('；'));
  for (const id of conditionIds) {
    const condition = conditions.get(id);
    if (condition !== undefined) validateConditionReferences(condition.expression, knownChars, values);
    truth.set(id, evaluateCondition(astOf(id), selection));
  }
  return truth;
};

/** 日期过滤后的发生项，后续维度共用这一份快照与解析口径。 */
export interface ResolutionFilterRow {
  headerId: string;
  alternativeNo: number;
  parentItemId: string;
  parentRevisionId: string;
  lineId: string;
  occurrenceId: string;
  childItemId: string;
  unitFrom: number | null;
  unitTo: number | null;
  lotCodes: string | null;
  selectionConditionId: string | null;
}

/** 候选两两满足 disjoint（单个候选恒真）。 */
const pairwise = <T>(rows: T[], disjoint: (left: T, right: T) => boolean): boolean =>
  rows.every((left, index) => rows.slice(index + 1).every(right => disjoint(left, right)));

/**
 * 同逻辑行多候选的未解析原因：点名能消歧的那一维。存储层三维重叠守卫保证同行同日的发生项在序列或批次上
 * 不相交（选择条件不参与该守卫，配置条件不会造成同行歧义）：未给序列且候选序列段两两不相交 → `unit`；
 * 否则缺批次 → `lot`（指定后剩余候选批次必相交、序列段必两两不相交，下一轮点名 `unit`）。
 */
const ambiguityReason = (group: ResolutionFilterRow[], context: ResolutionContext): 'unit' | 'lot' => {
  const unitDisjoint = pairwise(
    group,
    (left, right) => !unitIntervalOverlaps([left.unitFrom, left.unitTo], [right.unitFrom, right.unitTo])
  );
  if (context.unit === undefined && unitDisjoint) return 'unit';
  return context.lot === undefined ? 'lot' : 'unit';
};

/** 依次按序列、批次、配置过滤，同逻辑行多候选显式标未解析。 */
export const filterResolutionRows = async <T extends ResolutionFilterRow>(
  query: ConfigurationQuery,
  dialect: BomSqlDialect,
  context: ResolutionContext,
  rows: T[],
  unresolved?: UnresolvedAlternative[]
): Promise<T[]> => {
  const candidates = rows.filter(
    row =>
      unitIntervalMatches(row.unitFrom, row.unitTo, context.unit) &&
      lotMatches(parseLotCodes(row.lotCodes), context.lot)
  );
  const conditionIds = [
    ...new Set(candidates.flatMap(row => (row.selectionConditionId === null ? [] : [row.selectionConditionId])))
  ];
  const truth = await evaluateConfigConditions(query, dialect, context, conditionIds);
  const selected = candidates.filter(
    row => row.selectionConditionId === null || truth.get(row.selectionConditionId) === true
  );
  const byLine = new Map<string, T[]>();
  for (const row of selected) {
    const list = byLine.get(row.lineId) ?? [];
    list.push(row);
    byLine.set(row.lineId, list);
  }
  const ambiguous = new Set<string>();
  for (const group of byLine.values()) {
    if (group.length < 2) continue;
    const reason = ambiguityReason(group, context);
    if (unresolved === undefined)
      throw new BomResolutionError(reason, `存在未解析的序列 / 批次候选：逻辑行 ${group[0].lineId}，请指定 ${reason}`);
    ambiguous.add(group[0].lineId);
    unresolved.push({
      parentItemId: group[0].parentItemId,
      parentRevisionId: group[0].parentRevisionId,
      reason,
      lineId: group[0].lineId,
      candidates: group.map(row => ({
        headerId: row.headerId,
        alternativeNo: row.alternativeNo,
        occurrenceId: row.occurrenceId,
        childItemId: row.childItemId,
        unitFrom: row.unitFrom,
        unitTo: row.unitTo,
        lotCodes: parseLotCodes(row.lotCodes)
      }))
    });
  }
  return selected.filter(row => !ambiguous.has(row.lineId));
};
