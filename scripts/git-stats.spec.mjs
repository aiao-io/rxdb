import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { parseBlameOutput } from './git-stats-worker.mjs';
import { mergeProjectStats } from './git-stats.mjs';

const emptyStats = () => ({ authorLines: {}, authorTestLines: {}, authorCommentLines: {}, authorMarkdownLines: {} });

/** 一行由 Alice 写的 `git blame --line-porcelain` 输出。 */
const blameLine = (sha, code) =>
  [`${sha} 1 1 1`, 'author Alice', 'author-mail <alice@example.com>', `\t${code}`].join('\n');

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

// Node 启动 ESM 主模块时按真实路径解析 import.meta.url，而 process.argv[1] 不解析符号链接。
// 入口判定不做 realpath，检出位在符号链接路径下（如 macOS 的 /tmp → /private/tmp）时脚本静默不执行、退出 0。
// 用「不是 git 仓库」让执行立刻失败：失败了才说明入口真的跑起来了，也不用真去统计整个仓库。
test('经符号链接路径启动时 CLI 照常执行：不在 git 仓库里时非零退出并报错', t => {
  const linkRoot = mkdtempSync(join(tmpdir(), 'git-stats-link-'));
  t.after(() => rmSync(linkRoot, { recursive: true, force: true }));
  symlinkSync(import.meta.dirname, join(linkRoot, 'scripts'), 'dir');

  const run = spawnSync(process.execPath, [join(linkRoot, 'scripts', 'git-stats.mjs')], {
    cwd: linkRoot,
    env: { ...process.env, GIT_DIR: join(linkRoot, 'no-such-git-dir') },
    encoding: 'utf8'
  });

  assert.equal(run.status, 1, `脚本没有执行？stdout=${run.stdout} stderr=${run.stderr}`);
  assert.match(run.stderr, /Error running git stats/);
});
