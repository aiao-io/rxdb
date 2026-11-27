export interface GithubDiffLine {
  readonly oldNumber: number | null;
  readonly newNumber: number | null;
  readonly oldText: string | null;
  readonly newText: string | null;
  readonly same: boolean;
}

interface DiffHighlight {
  readonly prefix: string;
  readonly change: string;
  readonly suffix: string;
}

export interface HistoryDiffLine extends GithubDiffLine {
  readonly oldHighlight?: DiffHighlight;
  readonly newHighlight?: DiffHighlight;
}

const MAX_INLINE_LENGTH = 1024;

function highlight(text: readonly string[], prefix: number, suffix: number): DiffHighlight | undefined {
  const end = text.length - suffix;
  if (prefix === end) return undefined;
  return {
    prefix: text.slice(0, prefix).join(''),
    change: text.slice(prefix, end).join(''),
    suffix: text.slice(end).join('')
  };
}

function inlineChanges(oldText: string | null, newText: string | null) {
  if (oldText === null || newText === null || Math.max(oldText.length, newText.length) >= MAX_INLINE_LENGTH) return {};
  const oldChars = [...oldText];
  const newChars = [...newText];
  const length = Math.min(oldChars.length, newChars.length);
  let prefix = 0;
  while (prefix < length && oldChars[prefix] === newChars[prefix]) prefix++;
  let suffix = 0;
  while (suffix < length - prefix && oldChars.at(-1 - suffix) === newChars.at(-1 - suffix)) suffix++;
  return { oldHighlight: highlight(oldChars, prefix, suffix), newHighlight: highlight(newChars, prefix, suffix) };
}

function changedRows(lines: readonly GithubDiffLine[], split: boolean): readonly HistoryDiffLine[] {
  const removed = lines.filter(line => line.oldText !== null);
  const added = lines.filter(line => line.newText !== null);
  const changes =
    removed.length === added.length ? removed.map((line, i) => inlineChanges(line.oldText, added[i].newText)) : [];
  if (!split) {
    return [
      ...removed.map((line, i) => ({ ...line, oldHighlight: changes[i]?.oldHighlight })),
      ...added.map((line, i) => ({ ...line, newHighlight: changes[i]?.newHighlight }))
    ];
  }
  return Array.from({ length: Math.max(removed.length, added.length) }, (_, i) => ({
    oldNumber: removed[i]?.oldNumber ?? null,
    oldText: removed[i]?.oldText ?? null,
    newNumber: added[i]?.newNumber ?? null,
    newText: added[i]?.newText ?? null,
    same: false,
    ...changes[i]
  }));
}

/** Pair edits within a contiguous change block; unchanged lines separate blocks. */
export function historyDiffRows(lines: readonly GithubDiffLine[], split: boolean): readonly HistoryDiffLine[] {
  const rows: HistoryDiffLine[] = [];
  let start = 0;
  for (const [index, line] of lines.entries()) {
    if (!line.same) continue;
    if (start < index) for (const changed of changedRows(lines.slice(start, index), split)) rows.push(changed);
    rows.push(line);
    start = index + 1;
  }
  if (start < lines.length) for (const changed of changedRows(lines.slice(start), split)) rows.push(changed);
  return rows;
}
