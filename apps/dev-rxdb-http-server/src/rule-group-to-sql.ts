/**
 * RuleGroup（JSON 过滤树）→ 参数化 SQL 片段。
 *
 * @remarks
 * 这是整个参考后端里唯一含分支逻辑的模块，其余端点都是直筒子，因此单测只覆盖这里。
 *
 * 两条不可让步的性质：
 *
 * 1. **零字符串拼接**：所有 `value` 一律走 `?` 占位符绑定，SQL 文本里只可能出现
 *    白名单列名、操作符与括号。这不是「防注入的一种手段」，而是唯一手段——
 *    只要有一处把值 format 进 SQL，整份文件的安全论证就作废。
 * 2. **列白名单是相等匹配，不是转义**：`field` 必须命中调用方给的列名数组，
 *    命中不了就抛 {@link FilterCompileError}（HTTP 400），在触达 SQL 之前结束。
 *    协议文档说 `field` 是「受信任的列名（来自客户端实体定义）」，但参考实现不能
 *    把这句话当成前提——它面向的是公网上任何一个发 JSON 的客户端。
 *
 * SQL 方言（这里是 SQLite）只允许出现在本文件里。想换 PostgreSQL 就重写本文件，
 * 而不是在别处抽一层 Store 接口。
 */

/** 绑定到 `?` 上的参数类型。SQLite 只认这三种标量。 */
export type SqlParam = string | number | null;

/** 编译产物：可直接喂给 `DatabaseSync#prepare(...).all(...params)`。 */
export interface CompiledFilter {
  readonly sql: string;
  readonly params: SqlParam[];
}

/**
 * 过滤条件非法。
 *
 * @remarks
 * `status` 固定 400：非法的 `where` 是客户端的错，不是后端故障。
 * 协议文档「不要用 5xx 掩盖无数据」的反面同样成立——不要用 5xx 掩盖非法入参。
 */
export class FilterCompileError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'FilterCompileError';
  }
}

type JsonRecord = Record<string, unknown>;

/**
 * 过滤树的最大嵌套层数。
 *
 * @remarks
 * 编译是递归的，而 `where` 整个来自请求体——一份手写的深嵌套 JSON 就能把调用栈打满。
 * `RangeError` 不是 {@link FilterCompileError}，走不到 400 那一支，于是落进兜底变成 500：
 * 「请求写得太深」是调用方的错，用 5xx 说出来既误导排障，也把栈溢出的代价留给了服务端。
 *
 * 取 32：查询构造器 UI 堆到十几层已经无人能读懂，而 32 层离栈溢出还差着两个数量级。
 */
const MAX_DEPTH = 32;

/** 标量比较：协议算子 → SQL 算子。 */
const COMPARISON_OPERATORS = new Map<string, string>([
  ['=', '='],
  ['!=', '<>'],
  ['<', '<'],
  ['>', '>'],
  ['<=', '<='],
  ['>=', '>=']
]);

const SUBSTRING_OPERATORS = new Set([
  'contains',
  'notContains',
  'startsWith',
  'notStartsWith',
  'endsWith',
  'notEndsWith'
]);

/** 关系存在性算子：协议里有，本 demo 的单表实体没有关联，显式拒绝而不是静默忽略。 */
const RELATION_OPERATORS = new Set(['exists', 'notExists']);

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRuleGroup = (value: JsonRecord): boolean => Array.isArray(value['rules']);

/** 白名单命中检查。命中才允许把列名写进 SQL——命中的那一刻它已经是我们自己的字符串了。 */
const resolveColumn = (field: unknown, columns: readonly string[]): string => {
  if (typeof field !== 'string' || !columns.includes(field)) {
    throw new FilterCompileError(`Unknown filter field '${String(field)}'`);
  }
  return `"${field}"`;
};

/** 标量值 → 绑定参数。布尔折成 SQLite 的 1 / 0；数组、对象、undefined 一律拒绝。 */
const toScalarParam = (value: unknown, operator: string): SqlParam => {
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  throw new FilterCompileError(`Operator '${operator}' expects a scalar value, received ${describe(value)}`);
};

const describe = (value: unknown): string => (Array.isArray(value) ? 'an array' : `a ${typeof value}`);

const nullCondition = (column: string, operator: string): string =>
  operator === 'null' ? `${column} IS NULL` : `${column} IS NOT NULL`;

/**
 * 标量比较。
 *
 * @remarks
 * `= null` / `!= null` 降级成 `IS NULL` / `IS NOT NULL`：SQL 里 `x = NULL` 恒为 NULL（即不命中），
 * 客户端把它当「查空值」发过来时会拿到一个静默的空结果。其余算子配 null 直接拒绝，
 * 因为它们没有任何合理解释——与 `packages/rxdb-adapter-sqlite-core` 的本地实现同款判定。
 */
const comparisonCondition = (column: string, operator: string, value: unknown, params: SqlParam[]): string => {
  if (value === null) {
    if (operator === '=') return `${column} IS NULL`;
    if (operator === '!=') return `${column} IS NOT NULL`;
    throw new FilterCompileError(`Operator '${operator}' cannot be combined with a null value`);
  }
  params.push(toScalarParam(value, operator));
  return `${column} ${COMPARISON_OPERATORS.get(operator)} ?`;
};

/**
 * 集合包含。
 *
 * @remarks
 * 空数组折成常量：`IN ()` 在 SQLite 里是语法错误。`in []` 恒不命中、`notIn []` 恒命中，
 * 这与 JS 的 `[].includes(x)` 同结论，不是特例照顾。
 */
const setCondition = (column: string, operator: string, value: unknown, params: SqlParam[]): string => {
  if (!Array.isArray(value)) {
    throw new FilterCompileError(`Operator '${operator}' expects an array value, received ${describe(value)}`);
  }
  if (value.length === 0) return operator === 'in' ? '1 = 0' : '1 = 1';

  const placeholders = value.map(item => {
    params.push(toScalarParam(item, operator));
    return '?';
  });
  return `${column} ${operator === 'in' ? 'IN' : 'NOT IN'} (${placeholders.join(', ')})`;
};

/** 闭区间。上下界各绑一个参数，元数必须正好是 2。 */
const rangeCondition = (column: string, operator: string, value: unknown, params: SqlParam[]): string => {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new FilterCompileError(`Operator '${operator}' expects a [min, max] tuple`);
  }
  params.push(toScalarParam(value[0], operator), toScalarParam(value[1], operator));
  return `${column} ${operator === 'between' ? 'BETWEEN' : 'NOT BETWEEN'} ? AND ?`;
};

/**
 * 子串匹配。
 *
 * @remarks
 * **大小写敏感，这是刻意选择，不是疏漏。** 不用 `LIKE` 有两个理由：
 *
 * - SQLite 的 `LIKE` 对 ASCII 大小写不敏感，且会把值里的 `%` `_` 当通配符，
 *   于是「远端筛出来的行」与「客户端本地行缓存再筛一遍的行」结论会不一致：
 *   QueryCache 拉回远端 id 后仍会用同一份 `where` 在本地 SQLite 上过滤，
 *   两边不一致时用户看到的是「查出来 10 条、屏幕上只剩 3 条」。
 * - `instr` / `substr` 走二进制比较，天然是「字面量 + 大小写敏感」，与客户端
 *   `packages/rxdb-adapter-sqlite-core` 的 `build_substring_condition` 逐字符同款，
 *   也就不需要 `ESCAPE` 子句。
 *
 * 尾段切片长度按**码点**计算（`[...text].length`）：SQLite 的 `length()` / `substr()`
 * 按码点计数，用 `String.length` 会把代理对多算一位、切片起点整体前移。
 */
const substringCondition = (column: string, operator: string, value: unknown, params: SqlParam[]): string => {
  if (typeof value !== 'string') {
    throw new FilterCompileError(`Operator '${operator}' expects a string value, received ${describe(value)}`);
  }
  params.push(value);

  if (operator === 'contains') return `instr(${column}, ?) > 0`;
  if (operator === 'notContains') return `instr(${column}, ?) = 0`;
  if (operator === 'startsWith') return `instr(${column}, ?) = 1`;
  if (operator === 'notStartsWith') return `instr(${column}, ?) <> 1`;

  const tail = `substr(${column}, length(${column}) - ${[...value].length} + 1)`;
  return `${tail} ${operator === 'endsWith' ? '=' : '<>'} ?`;
};

const compileRule = (rule: JsonRecord, columns: readonly string[], params: SqlParam[]): string => {
  const operator = rule['operator'];
  if (typeof operator !== 'string') {
    throw new FilterCompileError(`Filter rule is missing a string 'operator'`);
  }
  if (RELATION_OPERATORS.has(operator)) {
    throw new FilterCompileError(`Operator '${operator}' (relation existence) is not supported by this demo backend`);
  }

  const column = resolveColumn(rule['field'], columns);
  const value = rule['value'];

  if (operator === 'null' || operator === 'notNull') return nullCondition(column, operator);
  if (operator === 'in' || operator === 'notIn') return setCondition(column, operator, value, params);
  if (operator === 'between' || operator === 'notBetween') return rangeCondition(column, operator, value, params);
  if (SUBSTRING_OPERATORS.has(operator)) return substringCondition(column, operator, value, params);
  if (COMPARISON_OPERATORS.has(operator)) return comparisonCondition(column, operator, value, params);

  throw new FilterCompileError(`Unsupported operator '${operator}'`);
};

const compileNode = (node: unknown, columns: readonly string[], params: SqlParam[], depth: number): string => {
  if (depth > MAX_DEPTH) {
    throw new FilterCompileError(`Filter nesting exceeds the maximum depth of ${MAX_DEPTH}`);
  }
  if (!isRecord(node)) throw new FilterCompileError('Filter node must be a JSON object');
  return isRuleGroup(node) ? compileGroup(node, columns, params, depth) : compileRule(node, columns, params);
};

/**
 * 组合节点。
 *
 * @remarks
 * 每个非空组都自带括号：单条规则不补括号的话，`a OR b AND c` 会被 AND 的优先级
 * 悄悄改写成 `a OR (b AND c)`，与客户端按树结构求值的结论不同。
 */
const compileGroup = (group: JsonRecord, columns: readonly string[], params: SqlParam[], depth: number): string => {
  const combinator = group['combinator'];
  if (combinator !== 'and' && combinator !== 'or') {
    throw new FilterCompileError(`Filter combinator must be 'and' or 'or', received '${String(combinator)}'`);
  }

  const rules = group['rules'] as unknown[];
  if (rules.length === 0) return '1 = 1';

  const conditions = rules.map(rule => compileNode(rule, columns, params, depth + 1));
  return `(${conditions.join(combinator === 'and' ? ' AND ' : ' OR ')})`;
};

/**
 * 把 RuleGroup 编译成 `WHERE` 后面那段 SQL 与它的绑定参数。
 *
 * @param where - 协议里的 `where` 字段。缺省 / `null` 视为无过滤。
 * @param columns - 允许出现在 `field` 上的列名白名单，与建表语句保持一致。
 * @returns SQL 片段与按出现顺序排列的绑定参数。
 * @throws {FilterCompileError} 列不在白名单、算子不支持、`value` 形态不对、嵌套超过
 *   {@link MAX_DEPTH} 层时（HTTP 400）。
 *
 * @example
 * ```ts
 * const { sql, params } = compileRuleGroup(body.where, RECIPE_COLUMNS);
 * db.prepare(`SELECT * FROM recipes WHERE ${sql} ORDER BY updatedAt, id`).all(...params);
 * ```
 */
export const compileRuleGroup = (where: unknown, columns: readonly string[]): CompiledFilter => {
  if (where === undefined || where === null) return { sql: '1 = 1', params: [] };

  const params: SqlParam[] = [];
  const sql = compileNode(where, columns, params, 1);
  return { sql, params };
};
