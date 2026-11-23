import { describe, expect, it } from 'vitest';

import { historyDiffRows, type GithubDiffLine } from './history-diff';

const removed = (oldNumber: number, oldText: string): GithubDiffLine => ({
  oldNumber,
  oldText,
  newNumber: null,
  newText: null,
  same: false
});

const added = (newNumber: number, newText: string): GithubDiffLine => ({
  oldNumber: null,
  oldText: null,
  newNumber,
  newText,
  same: false
});

describe('historyDiffRows', () => {
  it('aligns a replacement in split mode and highlights only the changed characters', () => {
    const lines = [removed(4, 'Version 0.9.'), added(5, 'Version 1.0.')];
    expect(historyDiffRows(lines, true)).toEqual([
      {
        oldNumber: 4,
        oldText: 'Version 0.9.',
        oldHighlight: { prefix: 'Version ', change: '0.9', suffix: '.' },
        newNumber: 5,
        newText: 'Version 1.0.',
        newHighlight: { prefix: 'Version ', change: '1.0', suffix: '.' },
        same: false
      }
    ]);
  });

  it('groups old lines before new lines in unified mode and keeps context rows unchanged', () => {
    const context = { ...added(8, 'context'), oldNumber: 7, oldText: 'context', same: true };
    const lines = [added(6, 'x=3'), removed(5, 'x=1'), added(7, 'y=4'), removed(6, 'y=2'), context];
    const rows = historyDiffRows(lines, false);
    expect(rows.map(row => row.oldText ?? row.newText)).toEqual(['x=1', 'y=2', 'x=3', 'y=4', 'context']);
    expect(rows.map(row => (row.oldHighlight ?? row.newHighlight)?.change)).toEqual(['1', '2', '3', '4', undefined]);
    expect(rows.at(-1)).toBe(context);
  });

  it('keeps unpaired additions visible without marking an unequal group as inline changes', () => {
    const lines = [removed(2, 'a'), added(2, 'b'), added(3, 'c')];
    const rows = historyDiffRows(lines, true);
    expect(rows.map(row => [row.oldText, row.newText])).toEqual([
      ['a', 'b'],
      [null, 'c']
    ]);
    expect(rows.every(row => !row.oldHighlight && !row.newHighlight)).toBe(true);
  });

  it('leaves empty ranges and long lines unmarked without splitting a Unicode character', () => {
    const oldText = 'before \u{1f600} after';
    const newText = 'before \u{1f601} after';
    const long = 'a'.repeat(1024);
    const context = { ...added(4, 'context'), oldNumber: 4, oldText: 'context', same: true };
    const rows = historyDiffRows(
      [
        removed(1, oldText),
        added(1, newText),
        context,
        removed(5, 'ab'),
        added(5, 'a-b'),
        context,
        removed(6, long),
        added(6, `${long}b`)
      ],
      true
    );
    expect(rows[0].oldHighlight?.change).toBe('\u{1f600}');
    expect(rows[0].newHighlight?.change).toBe('\u{1f601}');
    expect(rows[2].oldHighlight).toBeUndefined();
    expect(rows[2].newHighlight?.change).toBe('-');
    expect(rows[4].newHighlight).toBeUndefined();
  });
});
