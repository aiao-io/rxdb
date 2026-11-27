import type { GitFileVersion } from '../../services/git/git-protocol';
import type { GithubDiffLine } from './history-diff';

/** 一次行级 diff 的两侧；二进制或不存在的一侧没有文本。 */
export interface GithubDiffValue {
  readonly base: Pick<GitFileVersion, 'binary' | 'text'>;
  readonly modified: Pick<GitFileVersion, 'binary' | 'text'>;
}

/** 一个差异块：标题（`@@ -旧范围 +新范围 @@`）和带上下文的行。 */
export interface GithubDiffHunk {
  readonly label: string;
  readonly lines: readonly GithubDiffLine[];
}

/** `diffLines` 的选项。 */
export interface GithubDiffOptions {
  /** 按去掉空白后的内容比较行；输出仍是各自的原文。 */
  readonly ignoreWhitespace?: boolean;
  /** 愿意付出的编辑距离（删除与新增的行数之和），默认 `DIFF_EDIT_LIMIT`。 */
  readonly limit?: number;
}

/**
 * 求最短编辑脚本时愿意付出的编辑距离。Myers 的时间与空间都是 O(D²)，单文件上限 2 MiB（约 10 万行）时，
 * 整文件重写会把主线程冻住甚至耗尽内存。距离在上限之内结果与原先逐行一致；超出后改用 `coarseDiff`：
 * 保留公共前后缀，中段整段删、整段增，仍然忠实但不保证最小。上限 1000（约 500 处改动行）时，
 * 每个文件最多约 50 万个整数（2 MB），几毫秒；`historyStats` 要对一次提交里的每个文件各算一遍，所以不能放得更大。
 */
export const DIFF_EDIT_LIMIT = 1000;

/** 文本按行拆开；末尾的换行不产生多余的空行。 */
export function linesOf(text: string | null): readonly string[] {
  if (!text) return [];
  const lines = text.split('\n');
  return lines.length > 1 && lines.at(-1) === '' ? lines.slice(0, -1) : lines;
}

/** 两个版本之间的行级 diff；任一侧是二进制时没有行级差异。 */
export function diffLinesOf(value: GithubDiffValue | null, ignoreWhitespace = false): readonly GithubDiffLine[] {
  if (!value || value.base.binary || value.modified.binary) return [];
  return diffLines(linesOf(value.base.text), linesOf(value.modified.text), { ignoreWhitespace });
}

/**
 * 行级 diff：编辑距离在 `limit` 之内时是 Myers 的最短编辑脚本，超出（或一侧已被前缀吃完）时是 `coarseDiff`。
 * 先比较公共前缀：Myers 在距离 0 时本来就会吃掉它，所以任何一侧被前缀吃完，剩下的纯增或纯删可以直接给出，
 * 新增、删除一个大文件与在文件末尾追加一大段都不必求解。
 */
export function diffLines(
  oldLines: readonly string[],
  newLines: readonly string[],
  { ignoreWhitespace = false, limit = DIFF_EDIT_LIMIT }: GithubDiffOptions = {}
): readonly GithubDiffLine[] {
  const table = new Map<string, number>();
  const oldKeys = keysOf(oldLines, table, ignoreWhitespace);
  const newKeys = keysOf(newLines, table, ignoreWhitespace);
  const prefix = commonPrefix(oldKeys, newKeys);
  if (prefix < Math.min(oldKeys.length, newKeys.length)) {
    const levels = shortestEdit(oldKeys, newKeys, limit);
    if (levels) return backtrack(oldLines, newLines, levels);
  }
  return coarseDiff(oldLines, newLines, oldKeys, newKeys, prefix);
}

/** 把差异行分成块：每处改动带前后各三行上下文，相连的合并。 */
export function diffHunksOf(lines: readonly GithubDiffLine[]): readonly GithubDiffHunk[] {
  const ranges: { start: number; end: number }[] = [];
  for (const [index, line] of lines.entries()) {
    if (line.same) continue;
    const start = Math.max(0, index - 3);
    const end = Math.min(lines.length, index + 4);
    const previous = ranges.at(-1);
    if (previous && start <= previous.end) previous.end = end;
    else ranges.push({ start, end });
  }
  return ranges.map(({ start, end }) => {
    const context = lines.slice(start, end);
    return { lines: context, label: `@@ -${diffRange(context, 'oldNumber')} +${diffRange(context, 'newNumber')} @@` };
  });
}

function diffRange(lines: readonly GithubDiffLine[], side: 'oldNumber' | 'newNumber'): string {
  const numbers = lines.flatMap(line => (line[side] === null ? [] : [line[side]]));
  const start = numbers[0] ?? 0;
  return numbers.length === 1 ? `${start}` : `${start},${numbers.length}`;
}

/** 行内容换成整数编号：相同内容同一个编号，之后的比较都是整数比较。 */
function keysOf(lines: readonly string[], table: Map<string, number>, ignoreWhitespace: boolean): Int32Array {
  return Int32Array.from(lines, line => {
    const content = ignoreWhitespace ? line.replace(/\s+/g, '') : line;
    const known = table.get(content);
    if (known !== undefined) return known;
    table.set(content, table.size);
    return table.size - 1;
  });
}

function commonPrefix(oldKeys: Int32Array, newKeys: Int32Array): number {
  const length = Math.min(oldKeys.length, newKeys.length);
  let count = 0;
  while (count < length && oldKeys[count] === newKeys[count]) count++;
  return count;
}

/** 公共后缀的长度；不能侵入已经算作前缀的行。 */
function commonSuffix(oldKeys: Int32Array, newKeys: Int32Array, prefix: number): number {
  const length = Math.min(oldKeys.length, newKeys.length) - prefix;
  let count = 0;
  while (count < length && oldKeys[oldKeys.length - 1 - count] === newKeys[newKeys.length - 1 - count]) count++;
  return count;
}

/** 从 `(oldIndex, newIndex)` 起沿对角线数出连续相同的行数。 */
function snake(oldKeys: Int32Array, newKeys: Int32Array, oldIndex: number, newIndex: number): number {
  let length = 0;
  while (
    oldIndex + length < oldKeys.length &&
    newIndex + length < newKeys.length &&
    oldKeys[oldIndex + length] === newKeys[newIndex + length]
  ) {
    length++;
  }
  return length;
}

/** 第 `distance` 步的第 `index` 条对角线是从上一步的哪一侧走来的：`true` 是新增（向下），`false` 是删除（向右）。 */
const movesDown = (previous: Int32Array, index: number, distance: number): boolean =>
  index === 0 || (index !== distance && previous[index - 1] < previous[index]);

/** 第 `distance` 步的第 `index` 条对角线在沿相同行滑行之前的旧文件行下标；第 0 步从文件开头出发。 */
function startOf(previous: Int32Array, index: number, distance: number): number {
  if (distance === 0) return 0;
  return movesDown(previous, index, distance) ? previous[index] : previous[index - 1] + 1;
}

/**
 * Myers 的前向搜索。`levels[d][i]` 是编辑 d 步之后、对角线 `2i - d` 上走得最远的旧文件行下标，
 * 第 d 步只有 d + 1 条对角线，所以每一步是一个 `Int32Array`，总共约 D²/2 个整数。
 * 在 `limit` 步之内找到终点时返回终点之前每一步的数组（长度就是编辑距离），否则返回 `null`。
 */
function shortestEdit(oldKeys: Int32Array, newKeys: Int32Array, limit: number): Int32Array[] | null {
  const levels: Int32Array[] = [];
  const max = Math.min(limit, oldKeys.length + newKeys.length);
  let previous = new Int32Array(0);
  for (let distance = 0; distance <= max; distance++) {
    const current = new Int32Array(distance + 1);
    for (let index = 0; index <= distance; index++) {
      const diagonal = 2 * index - distance;
      const from = startOf(previous, index, distance);
      const oldIndex = from + snake(oldKeys, newKeys, from, from - diagonal);
      current[index] = oldIndex;
      if (oldIndex >= oldKeys.length && oldIndex - diagonal >= newKeys.length) return levels;
    }
    levels.push(current);
    previous = current;
  }
  return null;
}

/** 从终点沿 `levels` 倒着走回起点，收集相同、新增、删除的行，最后翻转成文件顺序。 */
function backtrack(
  oldLines: readonly string[],
  newLines: readonly string[],
  levels: readonly Int32Array[]
): GithubDiffLine[] {
  const result: GithubDiffLine[] = [];
  let oldIndex = oldLines.length;
  let newIndex = newLines.length;
  for (let distance = levels.length; distance > 0; distance--) {
    const previous = levels[distance - 1];
    const diagonal = oldIndex - newIndex;
    const index = (diagonal + distance) / 2;
    const down = movesDown(previous, index, distance);
    const previousOldIndex = down ? previous[index] : previous[index - 1];
    const previousNewIndex = previousOldIndex - (down ? diagonal + 1 : diagonal - 1);
    while (oldIndex > previousOldIndex && newIndex > previousNewIndex) {
      result.push(sameLine(oldLines, newLines, oldIndex, newIndex));
      oldIndex--;
      newIndex--;
    }
    if (oldIndex === previousOldIndex) {
      result.push(addedLine(newLines, newIndex));
      newIndex--;
    } else {
      result.push(removedLine(oldLines, oldIndex));
      oldIndex--;
    }
  }
  while (oldIndex > 0 && newIndex > 0) {
    result.push(sameLine(oldLines, newLines, oldIndex, newIndex));
    oldIndex--;
    newIndex--;
  }
  return result.reverse();
}

/**
 * 不求最短的 diff：公共前缀与后缀留作相同行，中段旧行整段删、新行整段增。结果仍能还原两侧原文，
 * 规模只有 O(行数)；一侧在前缀之后已经用完时，这就是唯一的最短脚本。
 */
function coarseDiff(
  oldLines: readonly string[],
  newLines: readonly string[],
  oldKeys: Int32Array,
  newKeys: Int32Array,
  prefix: number
): GithubDiffLine[] {
  const suffix = commonSuffix(oldKeys, newKeys, prefix);
  const oldEnd = oldLines.length - suffix;
  const newEnd = newLines.length - suffix;
  const result: GithubDiffLine[] = [];
  for (let number = 1; number <= prefix; number++) result.push(sameLine(oldLines, newLines, number, number));
  for (let number = prefix + 1; number <= oldEnd; number++) result.push(removedLine(oldLines, number));
  for (let number = prefix + 1; number <= newEnd; number++) result.push(addedLine(newLines, number));
  for (let offset = 1; offset <= suffix; offset++)
    result.push(sameLine(oldLines, newLines, oldEnd + offset, newEnd + offset));
  return result;
}

const sameLine = (
  oldLines: readonly string[],
  newLines: readonly string[],
  oldNumber: number,
  newNumber: number
): GithubDiffLine => ({
  oldNumber,
  newNumber,
  oldText: oldLines[oldNumber - 1],
  newText: newLines[newNumber - 1],
  same: true
});

const removedLine = (oldLines: readonly string[], oldNumber: number): GithubDiffLine => ({
  oldNumber,
  newNumber: null,
  oldText: oldLines[oldNumber - 1],
  newText: null,
  same: false
});

const addedLine = (newLines: readonly string[], newNumber: number): GithubDiffLine => ({
  oldNumber: null,
  newNumber,
  oldText: null,
  newText: newLines[newNumber - 1],
  same: false
});
