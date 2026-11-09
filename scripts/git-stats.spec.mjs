import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseBlameOutput } from './git-stats-worker.mjs';
import { mergeProjectStats } from './git-stats.mjs';

const emptyStats = () => ({ authorLines: {}, authorTestLines: {}, authorCommentLines: {}, authorMarkdownLines: {} });

/** 一行由 Alice 写的 `git blame --line-porcelain` 输出。 */
const blameLine = (sha, code) => [`${sha} 1 1 1`, 'author Alice', 'author-mail <alice@example.com>', `\t${code}`].join('\n');

// 每个 worker 各自交回一份按项目分桶的统计，主线程合并后再算项目 / 作者的 Code 列与总行数。
// 合并只累加了测试、注释、文档三个桶，普通代码行（authorLines）始终是空对象，Code 列与占比整列归零。
test('mergeProjectStats 按作者累加四个桶，普通代码行不丢', () => {
  const batches = ['src/a.ts', 'src/b.ts'].map((file, index) => {
    const stats = emptyStats();
    parseBlameOutput(file, blameLine(String(index + 1).repeat(40), `export const v${index} = ${index};`), stats);
    return { 'packages/demo': stats };
  });
  batches.push({
    'packages/demo': {
      ...emptyStats(),
      authorTestLines: { Alice: 3 },
      authorCommentLines: { Bob: 1 },
      authorMarkdownLines: { Alice: 2 }
    }
  });

  assert.deepEqual(mergeProjectStats(batches), {
    'packages/demo': {
      authorLines: { Alice: 2 },
      authorTestLines: { Alice: 3 },
      authorCommentLines: { Bob: 1 },
      authorMarkdownLines: { Alice: 2 }
    }
  });
});
