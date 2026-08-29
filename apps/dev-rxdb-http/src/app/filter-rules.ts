/**
 * 过滤面板状态 → `RuleGroup`。
 *
 * @remarks
 * 面板刻意把 AC#3 的五类算子各摆一个控件：`contains` / `=` / `in` / `between` / `null`。
 * 它们会**原样**穿过网线进后端的 `rule-group-to-sql.ts`，也会被客户端拿去再过滤一遍
 * 本地行缓存（QueryCache 的读出口是本地仓储）。两边对同一棵树必须得出同一批行，
 * 因此这里只用两侧都实现、且语义逐字一致的算子——
 * 尤其是 `contains`：后端用 `instr`（**大小写敏感**），客户端的 sqlite-core 也用 `instr`。
 *
 * 本文件是纯函数，不碰 Angular，也不碰网络：面板的行为可以脱离浏览器验。
 */

import type { RuleGroup } from '@aiao/rxdb';

/** 参与过滤的字段。与后端 `RECIPE_COLUMNS` 白名单同名。 */
interface RecipeFilterFields {
  title: string;
  status: string;
  price: number;
  tag: string | null;
}

/** 面板产出的规则树。 */
export type RecipeRuleGroup = RuleGroup<RecipeFilterFields>;

/** 过滤面板的表单状态。空串 / 空数组 / `false` 一律表示「这一项不参与过滤」。 */
export interface RecipeFilterState {
  /** `contains`：子串匹配，大小写敏感 */
  titleContains: string;
  /** `=`：等值 */
  status: string;
  /** `in`：集合包含 */
  tags: string[];
  /** `between` 的下界；与 {@link priceMax} 必须成对出现 */
  priceMin: string;
  /** `between` 的上界 */
  priceMax: string;
  /** `null`：只看没有 tag 的行 */
  tagIsNull: boolean;
}

/** 一份什么都不过滤的初始状态。 */
export const emptyFilterState = (): RecipeFilterState => ({
  titleContains: '',
  status: '',
  tags: [],
  priceMin: '',
  priceMax: '',
  tagIsNull: false
});

/** 把输入框里的字符串解析成有限数；解析不出就是 `undefined`。 */
const toFiniteNumber = (raw: string): number | undefined => {
  if (raw.trim() === '') return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * 把面板状态编译成 `RuleGroup`。
 *
 * @param state - 面板状态
 * @returns 组合子恒为 `and` 的规则组；什么都没填时是 `{ combinator: 'and', rules: [] }`
 *
 * @remarks
 * 几处刻意的取舍：
 *
 * - **`between` 要求上下界成对**。只填一个就整条不下发，而不是拿另一端补个
 *   `Number.MAX_SAFE_INTEGER`——那种兜底会让「我只填了下界」和「我填了一个巨大的上界」
 *   在后端看起来一模一样，翻车时无从分辨。UI 负责把这个约束说清楚。
 * - **`tagIsNull` 打开时不再下发 `in`**。`tag IS NULL` 与 `tag IN (...)` 在 SQL 里恒不同时成立，
 *   同时下发只会得到一个必然为空的结果集，看起来像 bug 其实是用户把两个互斥条件都勾上了。
 * - 空 `rules` 数组是合法的：后端把它编译成 `1 = 1`，客户端本地同理。
 */
export const buildFilterRules = (state: RecipeFilterState): RecipeRuleGroup => {
  const rules: RecipeRuleGroup['rules'] = [];

  if (state.titleContains !== '') {
    rules.push({ field: 'title', operator: 'contains', value: state.titleContains });
  }
  if (state.status !== '') {
    rules.push({ field: 'status', operator: '=', value: state.status });
  }

  if (state.tagIsNull) {
    rules.push({ field: 'tag', operator: 'null' });
  } else if (state.tags.length > 0) {
    rules.push({ field: 'tag', operator: 'in', value: state.tags });
  }

  const min = toFiniteNumber(state.priceMin);
  const max = toFiniteNumber(state.priceMax);
  if (min !== undefined && max !== undefined) {
    rules.push({ field: 'price', operator: 'between', value: [min, max] });
  }

  return { combinator: 'and', rules };
};

/** 面板上「当前有几条规则生效」，用于给用户一个即时反馈。 */
export const activeRuleCount = (state: RecipeFilterState): number => buildFilterRules(state).rules.length;
