/** 命中区间，半开区间 `[start, end)`，以 UTF-16 下标计。 */
export type MatchRange = readonly [start: number, end: number];

/** 一次匹配的结果。 */
export interface MatchResult {
  /** 分数，越大越相关。 */
  readonly score: number;
  /** 命中区间，已排序合并。 */
  readonly ranges: readonly MatchRange[];
}

/** 带高亮标记的文本片段。 */
export interface TextSegment {
  /** 片段文本。 */
  readonly text: string;
  /** 是否命中。 */
  readonly match: boolean;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;
const CJK = /[㐀-鿿豈-﫿]/u;

const isBoundary = (text: string, index: number): boolean => {
  if (index === 0) return true;
  const previous = text[index - 1];
  return !WORD_CHAR.test(previous) || CJK.test(previous) !== CJK.test(text[index]);
};

const substringScore = (text: string, index: number, length: number): number =>
  100 +
  (index === 0 ? 50 : 0) +
  (isBoundary(text, index) ? 30 : 0) -
  Math.min(index, 40) * 0.5 +
  (length / text.length) * 20;

const subsequence = (text: string, token: string): { score: number; ranges: MatchRange[] } | null => {
  const ranges: MatchRange[] = [];
  let cursor = 0;
  let gaps = 0;
  for (const char of token) {
    const at = text.indexOf(char, cursor);
    if (at === -1) return null;
    const last = ranges.at(-1);
    if (last && last[1] === at) ranges[ranges.length - 1] = [last[0], at + char.length];
    else {
      ranges.push([at, at + char.length]);
      gaps += at - cursor;
    }
    cursor = at + char.length;
  }
  return { score: Math.max(10, 50 - gaps - ranges.length * 4), ranges };
};

const matchToken = (text: string, token: string): { score: number; ranges: MatchRange[] } | null => {
  const index = text.indexOf(token);
  if (index !== -1)
    return { score: substringScore(text, index, token.length), ranges: [[index, index + token.length]] };
  return subsequence(text, token);
};

const mergeRanges = (ranges: readonly MatchRange[]): MatchRange[] =>
  [...ranges]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .reduce<MatchRange[]>((merged, range) => {
      const last = merged.at(-1);
      if (last && range[0] <= last[1]) merged[merged.length - 1] = [last[0], Math.max(last[1], range[1])];
      else merged.push(range);
      return merged;
    }, []);

/**
 * 模糊匹配：查询按空白拆成多个词，每个词都必须命中；连续子串优于离散子序列，开头与词边界加分。
 * @param query - 查询文本。
 * @param text - 被匹配的文本。
 * @returns 命中结果；任一词未命中或查询为空返回 `null`。
 */
export function matchText(query: string, text: string): MatchResult | null {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const haystack = text.toLowerCase();
  let score = 0;
  const ranges: MatchRange[] = [];
  for (const token of tokens) {
    const hit = matchToken(haystack, token);
    if (!hit) return null;
    score += hit.score;
    ranges.push(...hit.ranges);
  }
  return { score, ranges: mergeRanges(ranges) };
}

/**
 * 按命中区间切分文本，供界面安全渲染高亮（不使用 innerHTML）。
 * @param text - 原文。
 * @param ranges - 命中区间。
 * @returns 交替的未命中 / 命中片段。
 */
export function splitHighlight(text: string, ranges: readonly MatchRange[]): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments.length > 0 ? segments : [{ text, match: false }];
}

/** 参与排序的候选。 */
export interface Rankable {
  /** 主文本，命中时参与高亮。 */
  readonly label: string;
  /** 次要文本（所属分组等）。 */
  readonly sublabel?: string;
  /** 额外关键词（路由、别名）。 */
  readonly keywords?: readonly string[];
}

/** 排序后的候选。 */
export interface Ranked<T extends Rankable> {
  /** 原候选。 */
  readonly item: T;
  /** 综合分。 */
  readonly score: number;
  /** 主文本的命中区间；仅在次要文本命中时为空。 */
  readonly labelRanges: readonly MatchRange[];
}

const SECONDARY_WEIGHT = 0.5;

/**
 * 按查询对候选排序：主文本命中权重高于次要文本与关键词，同分保持原顺序。
 * @param query - 查询文本。
 * @param items - 候选。
 * @param limit - 返回上限。
 * @returns 命中的候选，分数从高到低。
 */
export function rankItems<T extends Rankable>(query: string, items: readonly T[], limit: number): Ranked<T>[] {
  const ranked = items.flatMap((item, order) => {
    const primary = matchText(query, item.label);
    const secondary = [item.sublabel, ...(item.keywords ?? [])]
      .flatMap(text => (text ? [matchText(query, text)] : []))
      .reduce<MatchResult | null>((best, hit) => (hit && (!best || hit.score > best.score) ? hit : best), null);
    const score = Math.max(primary?.score ?? 0, (secondary?.score ?? 0) * SECONDARY_WEIGHT);
    return score > 0 ? [{ item, score, labelRanges: primary?.ranges ?? [], order }] : [];
  });
  return ranked
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ item, score, labelRanges }) => ({ item, score, labelRanges }));
}
