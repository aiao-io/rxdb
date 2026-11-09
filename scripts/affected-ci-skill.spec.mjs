import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// affected-ci 的 full 模式标称「等价 pnpm test-all、PR 前必跑」，却在 skill 里另抄了一条 nx 命令：
// 漏掉 test-memory / audit-lazy-backend、额外排除 website / benchmarks、并行开到 8；Claude 那份还少了
// typecheck / test-browser。两份副本各自漂移，full 跑绿不代表全量门禁绿。

const SKILL_COPIES = ['../.agents/skills/affected-ci/SKILL.md', '../.claude/skills/affected-ci/SKILL.md'];
const readSkill = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const { scripts } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** 模式映射表里某一模式那一行的命令（第二列反引号里的内容）。 */
const modeCommand = (skill, mode) => {
  const row = skill.split('\n').find(line => line.startsWith(`| \`${mode}\``));
  assert.ok(row, `模式表缺少 ${mode} 行`);
  return row.split('|')[2].trim().replace(/^`|`$/g, '');
};

test('affected-ci 的两份 skill 副本逐字一致', () => {
  const [agents, claude] = SKILL_COPIES.map(readSkill);
  assert.equal(claude, agents);
});

test('full 模式直接跑仓库唯一的全量入口 pnpm test-all', () => {
  for (const copy of SKILL_COPIES) {
    assert.equal(modeCommand(readSkill(copy), 'full'), 'pnpm test-all', copy);
  }
  assert.match(scripts['test-all'], /^nx affected -t /);
});

test('各模式的并行度不超过 pnpm test-all，也不用不存在的 configuration', () => {
  const testAllParallel = Number(scripts['test-all'].match(/--parallel=(\d+)/)[1]);
  const skill = readSkill(SKILL_COPIES[0]);
  for (const mode of ['quick', 'coverage', 'typecheck']) {
    const command = modeCommand(skill, mode);
    const parallel = Number(command.match(/--parallel=(\d+)/)?.[1] ?? testAllParallel);
    assert.ok(parallel <= testAllParallel, `${mode}: --parallel=${parallel} 高于 test-all 的 ${testAllParallel}`);
    // Nx 找不到 configuration 时静默退回默认配置：`--configuration=coverage` 跑出来的是不带覆盖率的普通测试。
    assert.doesNotMatch(command, /--configuration=coverage/, mode);
  }
});
