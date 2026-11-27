import { describe, expect, it } from 'vitest';

import { DIFF_EDIT_LIMIT, diffHunksOf, diffLines, diffLinesOf, linesOf, type GithubDiffValue } from './github-diff';
import type { GithubDiffLine } from './history-diff';

/**
 * 改动之前 `github.ts` 里的 Myers 实现原样搬来，当作对照：编辑距离在上限之内时，新实现必须逐行得出同样的结果。
 * 它没有规模上限，所以只拿小输入喂它。
 */
function referenceDiff(
  oldLines: readonly string[],
  newLines: readonly string[],
  ignoreWhitespace = false
): readonly GithubDiffLine[] {
  const compare = (text: string) => text.replace(/\s+/g, '');
  const oldContent = ignoreWhitespace ? oldLines.map(compare) : oldLines;
  const newContent = ignoreWhitespace ? newLines.map(compare) : newLines;
  const max = oldLines.length + newLines.length;
  const trace: Map<number, number>[] = [];
  let frontier = new Map<number, number>([[0, 0]]);

  for (let distance = 0; distance <= max; distance++) {
    trace.push(frontier);
    const next = new Map<number, number>();
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const down =
        diagonal === -distance ||
        (diagonal !== distance && (frontier.get(diagonal - 1) ?? -1) < (frontier.get(diagonal + 1) ?? -1));
      let oldIndex = down ? (frontier.get(diagonal + 1) ?? 0) : (frontier.get(diagonal - 1) ?? 0) + 1;
      let newIndex = oldIndex - diagonal;
      while (
        oldIndex < oldLines.length &&
        newIndex < newLines.length &&
        oldContent[oldIndex] === newContent[newIndex]
      ) {
        oldIndex++;
        newIndex++;
      }
      next.set(diagonal, oldIndex);
      if (oldIndex >= oldLines.length && newIndex >= newLines.length) {
        return referenceBuild(oldLines, newLines, trace, distance);
      }
    }
    frontier = next;
  }

  return [];
}

function referenceBuild(
  oldLines: readonly string[],
  newLines: readonly string[],
  trace: readonly Map<number, number>[],
  finalDistance: number
): readonly GithubDiffLine[] {
  let oldIndex = oldLines.length;
  let newIndex = newLines.length;
  const result: GithubDiffLine[] = [];

  for (let distance = finalDistance; distance > 0; distance--) {
    const diagonal = oldIndex - newIndex;
    const previous = trace[distance];
    const down =
      diagonal === -distance ||
      (diagonal !== distance && (previous.get(diagonal - 1) ?? -1) < (previous.get(diagonal + 1) ?? -1));
    const previousDiagonal = down ? diagonal + 1 : diagonal - 1;
    const previousOldIndex = previous.get(previousDiagonal) ?? 0;
    const previousNewIndex = previousOldIndex - previousDiagonal;

    while (oldIndex > previousOldIndex && newIndex > previousNewIndex) {
      result.push({
        oldNumber: oldIndex,
        newNumber: newIndex,
        oldText: oldLines[oldIndex - 1],
        newText: newLines[newIndex - 1],
        same: true
      });
      oldIndex--;
      newIndex--;
    }

    if (oldIndex === previousOldIndex) {
      result.push({
        oldNumber: null,
        newNumber: newIndex,
        oldText: null,
        newText: newLines[newIndex - 1],
        same: false
      });
      newIndex--;
    } else {
      result.push({
        oldNumber: oldIndex,
        newNumber: null,
        oldText: oldLines[oldIndex - 1],
        newText: null,
        same: false
      });
      oldIndex--;
    }
  }

  while (oldIndex > 0 && newIndex > 0) {
    result.push({
      oldNumber: oldIndex,
      newNumber: newIndex,
      oldText: oldLines[oldIndex - 1],
      newText: newLines[newIndex - 1],
      same: true
    });
    oldIndex--;
    newIndex--;
  }

  return result.reverse();
}

/** 固定种子的伪随机数，用例可重复。 */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function sequence(next: () => number, length: number, alphabet: number): string[] {
  return Array.from({ length }, () => `line ${Math.floor(next() * alphabet)}`);
}

const numbered = (count: number, label: string): string[] => Array.from({ length: count }, (_, i) => `${label} ${i}`);

const replaceAt = (lines: readonly string[], index: number, value: string): string[] =>
  lines.map((line, i) => (i === index ? value : line));

/** 一份 diff 必须原样还原两边：旧行按序是 oldText，新行按序是 newText，行号连续，same 行两边相同。 */
function expectFaithful(
  lines: readonly GithubDiffLine[],
  oldLines: readonly string[],
  newLines: readonly string[]
): void {
  const olds = lines.filter(line => line.oldText !== null);
  const news = lines.filter(line => line.newText !== null);
  expect(olds.map(line => line.oldText)).toEqual(oldLines);
  expect(news.map(line => line.newText)).toEqual(newLines);
  expect(olds.map(line => line.oldNumber)).toEqual(oldLines.map((_, i) => i + 1));
  expect(news.map(line => line.newNumber)).toEqual(newLines.map((_, i) => i + 1));
  expect(lines.filter(line => line.same).every(line => line.oldText === line.newText)).toBe(true);
}

const text = (value: string | null, binary = false) => ({ binary, text: value });

describe('linesOf', () => {
  it('空文本没有行；末尾的换行不产生多余的空行', () => {
    expect(linesOf(null)).toEqual([]);
    expect(linesOf('')).toEqual([]);
    expect(linesOf('a\nb\n')).toEqual(['a', 'b']);
    expect(linesOf('a\nb')).toEqual(['a', 'b']);
  });

  it('只有一个换行是一个空行；中间和末尾的空行都保留', () => {
    expect(linesOf('\n')).toEqual(['']);
    expect(linesOf('a\n\n')).toEqual(['a', '']);
    expect(linesOf('a\n\nb')).toEqual(['a', '', 'b']);
  });
});

describe('diffLinesOf', () => {
  it('二进制或缺失的一侧没有行级差异', () => {
    expect(diffLinesOf(null)).toEqual([]);
    expect(diffLinesOf({ base: text('a'), modified: text(null, true) })).toEqual([]);
    expect(diffLinesOf({ base: text(null, true), modified: text('a') })).toEqual([]);
  });

  it('改一行：上下文是 same，旧行与新行带各自的行号', () => {
    const value: GithubDiffValue = { base: text('one\ntwo\nthree\n'), modified: text('one\n2\nthree\n') };
    expect(diffLinesOf(value)).toEqual([
      { oldNumber: 1, newNumber: 1, oldText: 'one', newText: 'one', same: true },
      { oldNumber: 2, newNumber: null, oldText: 'two', newText: null, same: false },
      { oldNumber: null, newNumber: 2, oldText: null, newText: '2', same: false },
      { oldNumber: 3, newNumber: 3, oldText: 'three', newText: 'three', same: true }
    ]);
  });

  it('新增文件全是新增行，删除文件全是删除行', () => {
    const added = diffLinesOf({ base: text(null), modified: text('a\nb\n') });
    expect(added.map(line => [line.oldNumber, line.newNumber, line.newText])).toEqual([
      [null, 1, 'a'],
      [null, 2, 'b']
    ]);
    const removed = diffLinesOf({ base: text('a\nb\n'), modified: text('') });
    expect(removed.map(line => [line.oldNumber, line.newNumber, line.oldText])).toEqual([
      [1, null, 'a'],
      [2, null, 'b']
    ]);
  });

  it('忽略空白时按去掉空白后的内容比较，输出仍是各自原文', () => {
    const value: GithubDiffValue = { base: text('a b\nc\n'), modified: text('a  b\nd\n') };
    expect(diffLinesOf(value, true)).toEqual([
      { oldNumber: 1, newNumber: 1, oldText: 'a b', newText: 'a  b', same: true },
      { oldNumber: 2, newNumber: null, oldText: 'c', newText: null, same: false },
      { oldNumber: null, newNumber: 2, oldText: null, newText: 'd', same: false }
    ]);
    expect(diffLinesOf(value).filter(line => line.same)).toEqual([]);
  });
});

describe('diffLines 与改动前的实现一致（编辑距离在上限之内）', () => {
  it('随机的小输入：逐行相同，含重复行、空输入、只增只删', () => {
    const next = random(20261124);
    for (let round = 0; round < 4000; round++) {
      const alphabet = 1 + Math.floor(next() * 5);
      const oldLines = sequence(next, Math.floor(next() * 14), alphabet);
      const newLines = sequence(next, Math.floor(next() * 14), alphabet);
      expect(diffLines(oldLines, newLines), JSON.stringify([oldLines, newLines])).toEqual(
        referenceDiff(oldLines, newLines)
      );
    }
  });

  it('随机的小输入，忽略空白：逐行相同', () => {
    const next = random(7);
    const spaced = (value: string): string => (next() < 0.5 ? value : ` ${value.replace(' ', '  ')}\t`);
    for (let round = 0; round < 1500; round++) {
      const oldLines = sequence(next, Math.floor(next() * 12), 4).map(spaced);
      const newLines = sequence(next, Math.floor(next() * 12), 4).map(spaced);
      expect(diffLines(oldLines, newLines, { ignoreWhitespace: true })).toEqual(
        referenceDiff(oldLines, newLines, true)
      );
    }
  });

  it('较长的真实形态：中间改几处、首尾有重复的空行与括号', () => {
    const base = ['', 'function a() {', '  return 1;', '}', '', 'function b() {', '  return 2;', '}', '', ''];
    const edited = [
      '',
      'function a() {',
      '  return 10;',
      '}',
      '',
      'function c() {',
      '  return 3;',
      '}',
      '',
      'function b() {',
      '  return 2;',
      '}',
      '',
      ''
    ];
    expect(diffLines(base, edited)).toEqual(referenceDiff(base, edited));
    expect(diffLines(edited, base)).toEqual(referenceDiff(edited, base));
  });

  it('几百行的真实规模：隔几行改一处，结果与改动前一致', () => {
    const next = random(99);
    const oldLines = numbered(600, 'row');
    const newLines = oldLines.flatMap((line, i) => (i % 25 === 7 ? [`${line} changed`, `${line} extra`] : [line]));
    expect(diffLines(oldLines, newLines)).toEqual(referenceDiff(oldLines, newLines));
    const shuffled = [...oldLines].sort(() => next() - 0.5).slice(0, 80);
    expect(diffLines(oldLines, shuffled)).toEqual(referenceDiff(oldLines, shuffled));
  });
});

describe('diffLines 的规模上限', () => {
  it('编辑距离超过 limit 时给出仍然忠实的 diff：公共前后缀保留，中段整段删、整段增', () => {
    const oldLines = ['head 1', 'head 2', 'a', 'b', 'c', 'd', 'tail 1', 'tail 2'];
    const newLines = ['head 1', 'head 2', 'w', 'x', 'y', 'z', 'tail 1', 'tail 2'];
    const lines = diffLines(oldLines, newLines, { limit: 3 });
    expect(
      lines.map(line => [
        line.same ? '='
        : line.oldText !== null ? '-'
        : '+',
        line.oldText ?? line.newText
      ])
    ).toEqual([
      ['=', 'head 1'],
      ['=', 'head 2'],
      ['-', 'a'],
      ['-', 'b'],
      ['-', 'c'],
      ['-', 'd'],
      ['+', 'w'],
      ['+', 'x'],
      ['+', 'y'],
      ['+', 'z'],
      ['=', 'tail 1'],
      ['=', 'tail 2']
    ]);
    expectFaithful(lines, oldLines, newLines);
  });

  it('limit 恰好够用时仍是精确结果；少一步就进入回退', () => {
    const oldLines = ['a', 'b', 'c', 'd'];
    const newLines = ['b', 'x', 'd'];
    const exact = diffLines(oldLines, newLines, { limit: 3 });
    expect(exact).toEqual(referenceDiff(oldLines, newLines));
    expect(
      exact.map(line =>
        line.same ? '='
        : line.oldText !== null ? `-${line.oldText}`
        : `+${line.newText}`
      )
    ).toEqual(['-a', '=', '-c', '+x', '=']);
    const coarse = diffLines(oldLines, newLines, { limit: 2 });
    expect(
      coarse.map(line =>
        line.same ? '='
        : line.oldText !== null ? `-${line.oldText}`
        : `+${line.newText}`
      )
    ).toEqual(['-a', '-b', '-c', '+b', '+x', '=']);
    expectFaithful(coarse, oldLines, newLines);
  });

  it('忽略空白的回退：前后缀按去掉空白后的内容认，same 行保留各自原文', () => {
    const oldLines = ['a  b', 'x1', 'x2', 'x3', 'tail'];
    const newLines = ['a b', 'y1', 'y2', 'y3', 'ta il'];
    const lines = diffLines(oldLines, newLines, { ignoreWhitespace: true, limit: 2 });
    expect(lines[0]).toEqual({ oldNumber: 1, newNumber: 1, oldText: 'a  b', newText: 'a b', same: true });
    expect(lines.at(-1)).toEqual({ oldNumber: 5, newNumber: 5, oldText: 'tail', newText: 'ta il', same: true });
    expect(lines.filter(line => !line.same)).toHaveLength(6);
  });

  it('新增一个很大的文件：全是新增行，立刻完成', () => {
    const newLines = numbered(60_000, 'generated');
    const started = performance.now();
    const lines = diffLines([], newLines);
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(lines).toHaveLength(60_000);
    expectFaithful(lines, [], newLines);
    expect(lines.some(line => line.same)).toBe(false);
  });

  it('删除一个很大的文件、在末尾追加一大段：同样立刻完成', () => {
    const oldLines = numbered(60_000, 'generated');
    const started = performance.now();
    const removed = diffLines(oldLines, []);
    const appended = diffLines(oldLines.slice(0, 10), oldLines);
    expect(performance.now() - started).toBeLessThan(2_000);
    expectFaithful(removed, oldLines, []);
    expectFaithful(appended, oldLines.slice(0, 10), oldLines);
    expect(appended.filter(line => line.same)).toHaveLength(10);
  });

  it('在文件中间插入一大段：前后缀是 same，插入的全是新增行', () => {
    const oldLines = numbered(40, 'keep');
    const inserted = numbered(30_000, 'inserted');
    const newLines = [...oldLines.slice(0, 20), ...inserted, ...oldLines.slice(20)];
    const started = performance.now();
    const lines = diffLines(oldLines, newLines);
    expect(performance.now() - started).toBeLessThan(2_000);
    expectFaithful(lines, oldLines, newLines);
    expect(lines.filter(line => !line.same)).toHaveLength(30_000);
    expect(lines.slice(0, 20).every(line => line.same)).toBe(true);
    expect(lines.slice(-20).every(line => line.same)).toBe(true);
  });

  it('两个互不相干的大文件：不会无限算下去，结果仍然忠实', () => {
    const oldLines = numbered(20_000, 'left');
    const newLines = numbered(20_000, 'right');
    const started = performance.now();
    const lines = diffLines(oldLines, newLines);
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(lines).toHaveLength(40_000);
    expectFaithful(lines, oldLines, newLines);
  });

  it('大文件里散布了超过上限的改动：保留首尾的公共部分，中段整体替换，且忠实', () => {
    const next = random(5);
    const oldLines = numbered(30_000, 'row');
    const newLines = oldLines.map((line, i) => (i > 100 && i < 29_900 && next() < 0.5 ? `${line} edited` : line));
    const started = performance.now();
    const lines = diffLines(oldLines, newLines);
    expect(performance.now() - started).toBeLessThan(2_000);
    expectFaithful(lines, oldLines, newLines);
    expect(lines.slice(0, 101).every(line => line.same)).toBe(true);
    expect(lines.slice(-100).every(line => line.same)).toBe(true);
  });

  it('默认上限是个有限的正整数', () => {
    expect(Number.isInteger(DIFF_EDIT_LIMIT) && DIFF_EDIT_LIMIT > 0).toBe(true);
  });
});

describe('diffHunksOf', () => {
  const change = (oldNumber: number | null, newNumber: number | null, same = false): GithubDiffLine => ({
    oldNumber,
    newNumber,
    oldText: oldNumber === null ? null : `old ${oldNumber}`,
    newText: newNumber === null ? null : `new ${newNumber}`,
    same
  });

  it('没有改动就没有块', () => {
    expect(diffHunksOf([])).toEqual([]);
    expect(diffHunksOf([change(1, 1, true), change(2, 2, true)])).toEqual([]);
  });

  it('每处改动带前后各三行上下文，标题是 @@ -旧范围 +新范围 @@', () => {
    const lines = diffLinesOf({
      base: text(`${numbered(20, 'line').join('\n')}\n`),
      modified: text(`${replaceAt(numbered(20, 'line'), 9, 'changed').join('\n')}\n`)
    });
    const hunks = diffHunksOf(lines);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].label).toBe('@@ -7,7 +7,7 @@');
    expect(hunks[0].lines).toHaveLength(8);
  });

  it('相距不远的两处改动合并成一块，相距远的分成两块', () => {
    const base = numbered(40, 'line');
    const near = replaceAt(replaceAt(base, 5, 'x'), 9, 'y');
    const far = replaceAt(replaceAt(base, 5, 'x'), 30, 'y');
    expect(diffHunksOf(diffLines(base, near))).toHaveLength(1);
    expect(diffHunksOf(diffLines(base, far))).toHaveLength(2);
  });

  it('只有一侧有行号时范围从 0 起算（新增文件）', () => {
    const [hunk] = diffHunksOf(diffLines([], ['a', 'b']));
    expect(hunk.label).toBe('@@ -0,0 +1,2 @@');
  });
});
