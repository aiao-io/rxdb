import { dueStatus } from '../due-status.js';

/**
 * @fileoverview 看板结构化筛选（看板 v2 阶段 2，GitHub Projects 风格）
 *
 * 语法：空白分隔的令牌。`field:value` 为字段令牌，逗号分隔多值（同一令牌内 OR），
 * 多个令牌之间 AND；前缀 `-` 取反；含空格或逗号的值用双引号包裹。不认识的字段名
 * 按普通关键词处理（如 `http://x`）；关键词按标题与描述做大小写不敏感的包含匹配。
 *
 * | 字段     | 取值                                                                     |
 * | -------- | ------------------------------------------------------------------------ |
 * | `label`  | 标签名（大小写不敏感精确匹配）                                           |
 * | `column` | 所在列标题                                                               |
 * | `due`    | `overdue` / `today` / `upcoming` / `none`、`YYYY-MM-DD`、`>` `>=` `<` `<=` 比较、`A..B` 区间 |
 * | `has`    | `label` / `due` / `description`                                          |
 * | `no`     | 同 `has`，取无                                                           |
 *
 * 非法取值不兜底：匹配不到任何任务，筛选结果为空即是反馈。
 */

/** 可筛选字段。 */
export type BoardFilterField = 'label' | 'column' | 'due' | 'has' | 'no';

/** 关键词条件。 */
export interface BoardFilterText {
  readonly value: string;
  readonly negated: boolean;
}

/** 字段条件：同一令牌内多值 OR。 */
export interface BoardFilterTerm {
  readonly field: BoardFilterField;
  readonly values: readonly string[];
  readonly negated: boolean;
}

/** 解析后的筛选：全部条件 AND。 */
export interface BoardFilter {
  readonly text: readonly BoardFilterText[];
  readonly terms: readonly BoardFilterTerm[];
}

/** 被筛选的任务视图（三端从板 / 列 / 标签数据组装）。 */
export interface BoardFilterTarget {
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: string | null;
  readonly columnTitle: string;
  readonly labelNames: readonly string[];
}

/** 补全上下文：当前板的标签与列。 */
export interface BoardFilterContext {
  readonly labels: readonly { readonly name: string; readonly color: string }[];
  readonly columns: readonly string[];
}

/** 补全项：`query` 是选中后的完整查询串。 */
export interface BoardFilterSuggestion {
  readonly kind: 'field' | 'value';
  readonly value: string;
  readonly description: string;
  readonly color: string | null;
  readonly query: string;
}

const FIELDS: readonly BoardFilterField[] = ['label', 'column', 'due', 'has', 'no'];

const FIELD_DESCRIPTIONS: Readonly<Record<BoardFilterField, string>> = {
  label: '按标签',
  column: '按所在列',
  due: '按截止日',
  has: '有某项',
  no: '缺某项'
};

const DUE_KEYWORDS: readonly (readonly [string, string])[] = [
  ['overdue', '已逾期'],
  ['today', '今天到期'],
  ['upcoming', '未到期'],
  ['none', '无截止日']
];

const PRESENCE_KEYWORDS: readonly (readonly [string, string])[] = [
  ['label', '标签'],
  ['due', '截止日'],
  ['description', '描述']
];

const PRESENCE = new Map<string, (target: BoardFilterTarget) => boolean>([
  ['label', target => target.labelNames.length > 0],
  ['due', target => target.dueDate !== null],
  ['description', target => (target.description ?? '').trim() !== '']
]);

const DATE = '(\\d{4}-\\d{2}-\\d{2})';
const DATE_RANGE = new RegExp(`^${DATE}\\.\\.${DATE}$`);
const DATE_COMPARE = new RegExp(`^(>=|<=|>|<)?${DATE}$`);

const COMPARATORS: Readonly<Record<string, (a: string, b: string) => boolean>> = {
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '=': (a, b) => a === b
};

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** 按引号外的分隔符切分，保留原始引号（令牌与多值共用）。 */
const splitOutsideQuotes = (input: string, isSeparator: (char: string) => boolean): string[] => {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (const char of input) {
    if (char === '"') quoted = !quoted;
    if (quoted || !isSeparator(char)) {
      current += char;
      continue;
    }
    parts.push(current);
    current = '';
  }
  parts.push(current);
  return parts;
};

const tokenize = (query: string): string[] => splitOutsideQuotes(query, char => /\s/.test(char)).filter(Boolean);

const unquote = (value: string): string => value.replaceAll('"', '').trim();

const splitValues = (raw: string): string[] => splitOutsideQuotes(raw, char => char === ',').map(unquote).filter(Boolean);

const quoteValue = (value: string): string => (/[\s,"]/.test(value) ? `"${value.replaceAll('"', '')}"` : value);

const asField = (name: string): BoardFilterField | null => FIELDS.find(field => field === name.toLowerCase()) ?? null;

interface ParsedToken {
  readonly negated: boolean;
  readonly field: BoardFilterField | null;
  readonly raw: string;
}

const parseToken = (token: string): ParsedToken => {
  const negated = token.length > 1 && token.startsWith('-');
  const body = negated ? token.slice(1) : token;
  const colon = body.indexOf(':');
  const field = colon > 0 ? asField(body.slice(0, colon)) : null;
  return { negated, field, raw: field === null ? body : body.slice(colon + 1) };
};

/** 解析筛选查询串。不完整的字段令牌（如 `label:`）不产生条件。 */
export const parseBoardFilter = (query: string): BoardFilter => {
  const text: BoardFilterText[] = [];
  const terms: BoardFilterTerm[] = [];
  for (const token of tokenize(query)) {
    const parsed = parseToken(token);
    if (parsed.field === null) {
      const value = unquote(parsed.raw);
      if (value !== '') text.push({ value, negated: parsed.negated });
      continue;
    }
    const values = splitValues(parsed.raw);
    if (values.length > 0) terms.push({ field: parsed.field, values, negated: parsed.negated });
  }
  return { text, terms };
};

/** 筛选是否没有任何条件。 */
export const isBoardFilterEmpty = (filter: BoardFilter): boolean =>
  filter.text.length === 0 && filter.terms.length === 0;

const matchDue = (dueDate: string | null, value: string, today: string): boolean => {
  if (value === 'none') return dueDate === null;
  if (dueDate === null) return false;
  if (value === 'overdue' || value === 'today' || value === 'upcoming') return dueStatus(dueDate, today) === value;
  const range = DATE_RANGE.exec(value);
  if (range !== null) return dueDate >= range[1] && dueDate <= range[2];
  const compared = DATE_COMPARE.exec(value);
  return compared !== null && COMPARATORS[compared[1] ?? '='](dueDate, compared[2]);
};

const matchPresence = (target: BoardFilterTarget, value: string, expected: boolean): boolean => {
  const check = PRESENCE.get(value.toLowerCase());
  return check !== undefined && check(target) === expected;
};

const FIELD_MATCHERS: Readonly<
  Record<BoardFilterField, (target: BoardFilterTarget, value: string, today: string) => boolean>
> = {
  label: (target, value) => target.labelNames.some(name => same(name, value)),
  column: (target, value) => same(target.columnTitle, value),
  due: (target, value, today) => matchDue(target.dueDate, value.toLowerCase(), today),
  has: (target, value) => matchPresence(target, value, true),
  no: (target, value) => matchPresence(target, value, false)
};

const matchText = (target: BoardFilterTarget, condition: BoardFilterText): boolean => {
  const haystack = `${target.title}\n${target.description ?? ''}`.toLowerCase();
  return haystack.includes(condition.value.toLowerCase()) !== condition.negated;
};

const matchTerm = (target: BoardFilterTarget, term: BoardFilterTerm, today: string): boolean =>
  term.values.some(value => FIELD_MATCHERS[term.field](target, value, today)) !== term.negated;

/**
 * 任务是否命中筛选（全部条件 AND）。
 *
 * @param today - 本地今天 `YYYY-MM-DD`（`due:overdue` 等相对条件的基准）
 */
export const matchesBoardFilter = (target: BoardFilterTarget, filter: BoardFilter, today: string): boolean =>
  filter.text.every(condition => matchText(target, condition)) &&
  filter.terms.every(term => matchTerm(target, term, today));

/**
 * 点击即筛选：查询里已有该值（非否定令牌）则移除，否则追加 `field:value` 令牌。
 *
 * @returns 新的查询串（令牌间单空格）
 */
export const toggleBoardFilterValue = (query: string, field: BoardFilterField, value: string): string => {
  let removed = false;
  const next: string[] = [];
  for (const token of tokenize(query)) {
    const parsed = parseToken(token);
    const values = parsed.field === field && !parsed.negated ? splitValues(parsed.raw) : [];
    const kept = values.filter(candidate => !same(candidate, value));
    if (kept.length === values.length) {
      next.push(token);
      continue;
    }
    removed = true;
    if (kept.length > 0) next.push(`${field}:${kept.map(quoteValue).join(',')}`);
  }
  if (!removed) next.push(`${field}:${quoteValue(value)}`);
  return next.join(' ');
};

const valueCandidates = (
  field: BoardFilterField,
  context: BoardFilterContext
): readonly { readonly value: string; readonly description: string; readonly color: string | null }[] => {
  if (field === 'label') return context.labels.map(label => ({ value: label.name, description: '标签', color: label.color }));
  if (field === 'column') return context.columns.map(column => ({ value: column, description: '列', color: null }));
  const keywords = field === 'due' ? DUE_KEYWORDS : PRESENCE_KEYWORDS;
  return keywords.map(([value, description]) => ({ value, description, color: null }));
};

/**
 * 输入补全：光标视为在查询末尾。末尾是空白或正在输入字段名时补全字段；
 * 字段名之后补全取值（多值令牌只补最后一段），选中取值后补一个空格。
 */
export const suggestBoardFilter = (query: string, context: BoardFilterContext): BoardFilterSuggestion[] => {
  const tokens = tokenize(query);
  const insideQuotes = (query.match(/"/g)?.length ?? 0) % 2 === 1;
  const active = query === '' || (/\s$/.test(query) && !insideQuotes) ? '' : (tokens.at(-1) ?? '');
  const head = query.slice(0, query.length - active.length);
  const parsed = parseToken(active);
  const sign = parsed.negated ? '-' : '';
  if (parsed.field === null) {
    const partial = parsed.raw.toLowerCase();
    return FIELDS.filter(field => field.startsWith(partial)).map(field => ({
      kind: 'field' as const,
      value: `${field}:`,
      description: FIELD_DESCRIPTIONS[field],
      color: null,
      query: `${head}${sign}${field}:`
    }));
  }
  const field = parsed.field;
  const segments = splitOutsideQuotes(parsed.raw, char => char === ',');
  const partial = unquote(segments.at(-1) ?? '').toLowerCase();
  const kept = segments.slice(0, -1);
  return valueCandidates(field, context)
    .filter(candidate => candidate.value.toLowerCase().includes(partial))
    .map(candidate => ({
      kind: 'value' as const,
      ...candidate,
      query: `${head}${sign}${field}:${[...kept, quoteValue(candidate.value)].join(',')} `
    }));
};
