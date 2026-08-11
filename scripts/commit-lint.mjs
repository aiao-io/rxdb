#!/usr/bin/env node

/**
 * scripts/commit-lint.mjs
 *
 * commit message 校验器。
 * 触发路径：
 *   - `package.json#pre-commit` / `#pre-push`（husky 钩子）
 *   - `package.json#check-commit`（手动跑）
 *
 * 行为：
 *   - 仅在 NEED_CHECK_COMMIT_BRANCH_NAMES 列出的分支上严格校验（默认 main）；
 *     其余分支直接放行，避免 feature 分支早期就被 commit 文案卡住。
 *   - 接受 commit msg 文件路径作为第一个参数（husky 把 .git/COMMIT_EDITMSG 传进来）；
 *     没传则取「分支与 upstream/main 的差集」里最新一条非 merge commit。
 *   - 正则匹配 `<type>(<scope>)!?: subject`，type/scope 来自 commitizen 配置，
 *     同时放行 `Revert` / `Release` / `wip` 前缀。
 *   - 失败时把首行不可见空白可视化（空格 → ·，Tab → →，换行 → ↵），方便排查
 *     中文输入法偷偷塞的全角空格 / Tab。
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import commitizen from './commitizen.mjs';

/**
 * 把不可见空白可视化，方便调试 commit msg 里的隐藏字符（中文输入法常见问题）。
 * @param {string} text 原始 commit message 第一行
 * @returns {string} 替换后的可读字符串
 */
function visualizeWhitespace(text) {
  return text
    .replace(/ /g, '·') // Space → ·
    .replace(/\t/g, '→') // Tab → →
    .replace(/\n/g, '↵\n'); // Newline → ↵
}

console.log('🐟🐟🐟 Validating git commit message 🐟🐟🐟');
const branchName = execSync('git symbolic-ref --short -q HEAD').toString().trim();
// 只在 NEED_CHECK_COMMIT_BRANCH_NAMES 列出的分支（默认 main）上做严格校验，
// 其余分支直接放行，不阻塞特性分支的提交。
if (!['main'].includes(branchName)) {
  process.exit();
}
let gitMessage;

const commitMsgFile = process.argv[2];
if (commitMsgFile) {
  gitMessage = fs.readFileSync(commitMsgFile, 'utf8').trim();
} else {
  // Use --pretty=%B to get only the commit message body (not the full commit object)
  let gitLogCmd = 'git log -1 --no-merges --pretty=%B';

  const gitRemotes = execSync('git remote -v').toString().trim().split('\n');
  const upstreamRemote = gitRemotes.find(remote => remote.includes('aiao-io/rxdb.git'));
  if (upstreamRemote) {
    const upstreamRemoteIdentifier = upstreamRemote.split('\t')[0].trim();
    console.log(`Comparing against remote ${upstreamRemoteIdentifier}`);
    const currentBranch = execSync('git branch --show-current').toString().trim();

    // exclude all commits already present in upstream/main
    gitLogCmd = gitLogCmd + ` ${currentBranch} ^${upstreamRemoteIdentifier}/main`;
  } else {
    console.error('No upstream remote found for nrwl/nx.git. Skipping comparison against upstream main.');
  }

  gitMessage = execSync(gitLogCmd).toString().trim();
}

if (!gitMessage) {
  console.log('No commits found. Skipping commit message validation.');
  process.exit(0);
}

// 从 commitizen 配置里抽出合法的 type / scope，构建校验正则。
const allowedTypes = commitizen.types.map(type => type.value).join('|');
const allowedScopes = commitizen.scopes.map(scope => scope.value).join('|');

// `\\s*` 容忍冒号后的空格（可零个），照顾中文输入法偶尔漏掉空格的情况。
const commitMsgRegex = `(${allowedTypes})\\((${allowedScopes})\\)!?:\\s*(.+)`;

const matchCommit = new RegExp(commitMsgRegex, 'g').test(gitMessage);
const matchRevert = /Revert/gi.test(gitMessage);
const matchRelease = /Release/gi.test(gitMessage);
const matchWip = /wip/gi.test(gitMessage);
const exitCode = +!(matchRelease || matchRevert || matchCommit || matchWip);

if (exitCode === 0) {
  console.log('Commit ACCEPTED 👍');
} else {
  const firstLine = gitMessage.split('\n')[0];
  const visualizedFirstLine = visualizeWhitespace(firstLine);

  console.log(
    '[Error]: Oh no! 😦 Your commit message does not follow the convention.\n' +
      '-------------------------------------------------------------------\n' +
      'First line (with visible whitespace):\n' +
      `  ${visualizedFirstLine}\n` +
      '-------------------------------------------------------------------\n' +
      'Full message:\n' +
      gitMessage +
      '\n-------------------------------------------------------------------' +
      '\n\n 👉️ Convention: type(scope): subject'
  );
  console.log('\nRequired format:');
  console.log('  type(scope): subject');
  console.log('  BLANK LINE');
  console.log('  body (optional)');
  console.log('\n');
  console.log(`✅ Allowed types: ${allowedTypes}`);
  console.log(`✅ Allowed scopes: ${allowedScopes} (if unsure use "core")`);
  console.log(
    '\n📝 EXAMPLES:\n' +
      '  feat(nx): add an option to generate lazy-loadable modules\n' +
      '  fix(core)!: breaking change should have exclamation mark\n'
  );
}
process.exit(exitCode);
