#!/usr/bin/env node

/**
 * scripts/commit-lint.mjs
 *
 * commit message 校验器。
 * 触发路径：
 *   - `package.json#pre-commit` / `#pre-push`（husky 钩子）
 *   - `package.json#check-commit`（手动跑）
 *   - `.github/workflows/ci-template.yml` 的 setup job（PR 上校验整个区间，见 --range）
 *
 * 四种模式：
 *   1. `commit-lint.mjs <msg-file>`   husky 的 commit-msg 钩子，读文件那一条；
 *                                    与无参模式一样，只在 NEED_CHECK_BRANCHES 上校验；
 *   2. `commit-lint.mjs`              本地兜底，只在 NEED_CHECK_BRANCHES 列出的分支上
 *                                    校验「与 upstream/main 的差集」里最新一条非 merge commit，
 *                                    其余分支直接放行 —— 不让特性分支早期被文案卡住；
 *   3. `commit-lint.mjs --message=…`  校验一条现成的文案。CI 用它校验 **PR 标题**；
 *   4. `commit-lint.mjs --range=A..B` 校验区间内**每一条**非 merge commit，
 *                                    不看分支名（PR 上 HEAD 是 detached 的 merge 提交，
 *                                    `git symbolic-ref` 会直接抛错，根本走不到分支判断）。
 *
 * CI 里用的是 3 而不是 4，这是被合并策略决定的：本仓库走 squash merge
 * （`main` 上的提交长这样：`feat(rxdb-adapter-tauri): 添加 tauri 本地数据库支持 (#7)`），
 * 分支上的中间提交在合并时会被丢弃，落进 main 的只有 GitHub 从 **PR 标题** 生成的那一条。
 * 卡中间提交既拦不住坏历史，又会把「随手 commit、合并前整理」这种正常节奏堵死。
 * 若哪天改成 merge commit / rebase merge，把 CI 换成 4（`--range=main..HEAD`）即可，
 * 两条路径共用同一个校验函数。
 *
 * 校验规则：首行必须是 `<type>(<scope>)!?: subject`，type/scope 取自 commitizen 配置；
 * 或以 `Revert` / `Release` / `wip` 开头。
 *
 * 三个前缀例外**锚定在首行开头，且必须是完整的词**。历史版本先是用 `/wip/gi.test(整条消息)`
 * 这种无锚点匹配，`fix the release notes`、`swipe 手势` 都能蒙混过关；后来改成 `startsWith`，
 * 又漏掉词边界，`wipe out the cache`、`Released 1.2.3` 照样能过 —— 那不是门禁，是装饰。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import commitizen from './commitizen.mjs';
import { NEED_CHECK_COMMIT_BRANCH_NAMES } from './workspace.mjs';

/** 本地模式（含 commit-msg 文件）才校验的分支；其余分支放行。CI 的 --message / --range 不受此限制。 */
export const NEED_CHECK_BRANCHES = NEED_CHECK_COMMIT_BRANCH_NAMES;

/** 允许绕过 `type(scope):` 的首行前缀（大小写不敏感，但必须在开头，且必须是完整的词）。 */
export const ALLOWED_PREFIXES = ['Revert', 'Release', 'wip'];

/**
 * 前缀例外的匹配正则：锚在首行开头 + 词边界。
 *
 * 只锚开头是不够的 —— `startsWith` 会把「以前缀开头的更长的词」一并放行：
 * `wipe out the cache`、`Released 1.2.3`、`Reverting my decision` 都不是例外情形。
 * `\b` 要求前缀后面紧跟非单词字符（空格、冒号、引号）或直接结束。
 */
const ALLOWED_PREFIX_REGEX = new RegExp(`^(?:${ALLOWED_PREFIXES.join('|')})\\b`, 'i');

/**
 * 把不可见空白可视化，方便调试 commit msg 里的隐藏字符（中文输入法常见问题）。
 * @param {string} text 原始 commit message 第一行
 * @returns {string} 替换后的可读字符串
 */
export function visualizeWhitespace(text) {
  return text
    .replace(/ /g, '·') // Space → ·
    .replace(/\t/g, '→') // Tab → →
    .replace(/\n/g, '↵\n'); // Newline → ↵
}

/**
 * 用 commitizen 的 type / scope 构造首行校验正则。
 *
 * 锚点是关键：`^…$` 保证 `chore(rxdb): x` 之外的前后缀（`[skip ci] fix(rxdb): x`）
 * 不会被放行。scope 用 `(?:a|b)` 而非捕获组，避免调用方误用编号分组。
 *
 * @param {{value: string}[]} types commitizen 的 type 列表
 * @param {{value: string}[]} scopes commitizen 的 scope 列表
 * @returns {RegExp} 匹配单行的锚定正则
 */
export function buildSubjectRegex(types, scopes) {
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const typeAlt = types.map(type => escape(type.value)).join('|');
  const scopeAlt = scopes.map(scope => escape(scope.value)).join('|');

  // `\s*` 容忍冒号后的空格（可零个），照顾中文输入法偶尔漏掉空格的情况。
  return new RegExp(`^(?:${typeAlt})\\((?:${scopeAlt})\\)!?:\\s*\\S.*$`);
}

/**
 * 校验一条 commit message。
 *
 * @param {string} message 完整 commit message（可含 body）
 * @param {{types: {value: string}[], scopes: {value: string}[]}} config commitizen 配置
 * @returns {{ok: true} | {ok: false, firstLine: string}} 失败时带回首行，供调用方渲染错误
 */
export function validateCommitMessage(message, config) {
  const firstLine = message.split('\n')[0].trim();

  if (ALLOWED_PREFIX_REGEX.test(firstLine)) return { ok: true };

  if (buildSubjectRegex(config.types, config.scopes).test(firstLine)) return { ok: true };

  return { ok: false, firstLine };
}

/**
 * 当前分支是否需要做 commit 文案校验。
 * detached HEAD（拿不到分支名）视为不校验。
 *
 * @param {string} branchName `git symbolic-ref --short HEAD` 的结果；失败时传空串
 * @param {string[]} [branches] 白名单，默认 NEED_CHECK_BRANCHES
 * @returns {boolean}
 */
export function shouldCheckCurrentBranch(branchName, branches = NEED_CHECK_BRANCHES) {
  return branches.includes(branchName);
}

/**
 * 解析 `--flag=value` 或 `--flag value` 形式的选项。
 *
 * @param {string[]} argv 完整 argv
 * @param {string} flag 选项名，含前导 `--`
 * @param {string} hint 缺值时的报错示例
 * @returns {string | null} 选项值；未传返回 null
 */
export function parseOption(argv, flag, hint) {
  const index = argv.findIndex(arg => arg === flag || arg.startsWith(`${flag}=`));
  if (index === -1) return null;

  const value = argv[index].startsWith(`${flag}=`) ? argv[index].slice(flag.length + 1) : argv[index + 1];
  if (!value) throw new Error(`${flag} 需要一个参数，例如 ${hint}`);
  return value;
}

/**
 * 解析 `--range=A..B` 或 `--range A..B`。
 *
 * @param {string[]} argv 完整 argv
 * @returns {string | null} 区间字符串；未传返回 null
 */
export const parseRange = argv => parseOption(argv, '--range', '--range=main..HEAD');

/**
 * 解析 `--message=…` 或 `--message …`。
 *
 * @param {string[]} argv 完整 argv
 * @returns {string | null} 待校验文案；未传返回 null
 */
export const parseMessage = argv => parseOption(argv, '--message', '--message="feat(rxdb): 标题"');

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });

/**
 * 读当前分支名。detached HEAD 时 symbolic-ref 以非零退出，视为无分支。
 * @returns {string}
 */
function readCurrentBranchName() {
  try {
    return git('symbolic-ref', '--short', '-q', 'HEAD').trim();
  } catch {
    return '';
  }
}

/**
 * 解析 `%H %B%x00` 格式的 git log 输出。
 *
 * 用 NUL 分隔而不是换行：commit message 本身是多行的，换行分隔会把一条拆成多条。
 *
 * @param {string} raw `git log --pretty=format:%H %B%x00` 的原始输出
 * @returns {{sha: string, message: string}[]} 由新到旧
 */
export function parseCommitLog(raw) {
  return raw
    .split('\0')
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .map(chunk => {
      const separator = chunk.indexOf(' ');
      // 空 message 的提交 trim 完只剩一个 sha，找不到分隔空格。
      // 不特判的话 slice(0, -1) 会砍掉 sha 最后一位，再把整个 sha 当成 message
      // 送去校验 —— 报出来的是「40 位十六进制不合规」，完全指不到真正的毛病。
      if (separator === -1) return { sha: chunk, message: '' };
      return { sha: chunk.slice(0, separator), message: chunk.slice(separator + 1).trim() };
    });
}

/**
 * 列出区间内所有非 merge commit 的完整 message。
 *
 * @param {string} range 形如 `main..HEAD`
 * @returns {{sha: string, message: string}[]} 由新到旧
 */
export function listCommitsInRange(range) {
  return parseCommitLog(git('log', '--no-merges', '--pretty=format:%H %B%x00', range));
}

/**
 * 渲染一条失败信息（保留原有的可视化空白输出，中文输入法的全角空格全靠它）。
 * @param {string} firstLine 违规提交的首行
 * @param {string} message 完整 message
 * @param {string} allowedTypes 供提示的 type 列表
 * @param {string} allowedScopes 供提示的 scope 列表
 */
function reportFailure(firstLine, message, allowedTypes, allowedScopes) {
  console.log(
    '[Error]: Oh no! 😦 Your commit message does not follow the convention.\n' +
      '-------------------------------------------------------------------\n' +
      'First line (with visible whitespace):\n' +
      `  ${visualizeWhitespace(firstLine)}\n` +
      '-------------------------------------------------------------------\n' +
      'Full message:\n' +
      message +
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
  console.log(`✅ Allowed prefixes: ${ALLOWED_PREFIXES.join(' / ')}`);
  console.log(
    '\n📝 EXAMPLES:\n' +
      '  feat(rxdb): add an option to generate lazy-loadable modules\n' +
      '  fix(aiao)!: breaking change should have exclamation mark\n'
  );
}

/** 无参模式：取「当前分支与 upstream/main 的差集」里最新一条非 merge commit。 */
function readLatestLocalCommit() {
  const remotes = git('remote', '-v').trim().split('\n');
  const upstream = remotes.find(remote => remote.includes('aiao-io/rxdb.git'));

  if (!upstream) {
    console.error('No upstream remote found for aiao-io/rxdb.git. Skipping comparison against upstream main.');
    return git('log', '-1', '--no-merges', '--pretty=%B').trim();
  }

  const remoteName = upstream.split('\t')[0].trim();
  console.log(`Comparing against remote ${remoteName}`);
  const branch = git('branch', '--show-current').trim();

  return git('log', '-1', '--no-merges', '--pretty=%B', branch, `^${remoteName}/main`).trim();
}

const main = () => {
  console.log('🐟🐟🐟 Validating git commit message 🐟🐟🐟');

  const allowedTypes = commitizen.types.map(type => type.value).join('|');
  const allowedScopes = commitizen.scopes.map(scope => scope.value).join('|');

  // ---- CI 模式（PR 标题）：单条现成文案 ---------------------------------
  const message = parseMessage(process.argv);
  if (message !== null) {
    const result = validateCommitMessage(message, commitizen);
    if (result.ok) {
      console.log(`Commit ACCEPTED 👍  ${message}`);
      return 0;
    }
    console.log('这条文案会成为 squash merge 后落在 main 上的提交，必须合规。\n');
    reportFailure(result.firstLine, message, allowedTypes, allowedScopes);
    return 1;
  }

  const range = parseRange(process.argv);

  // ---- 区间模式：逐条校验 -----------------------------------------------
  if (range !== null) {
    const commits = listCommitsInRange(range);
    if (commits.length === 0) {
      console.log(`区间 ${range} 内没有非 merge commit，跳过。`);
      return 0;
    }

    const failures = commits.filter(commit => !validateCommitMessage(commit.message, commitizen).ok);
    console.log(`区间 ${range}：${commits.length} 条 commit，${failures.length} 条不合规。`);

    for (const commit of failures) {
      console.log(`\n❌ ${commit.sha.slice(0, 8)}`);
      reportFailure(commit.message.split('\n')[0].trim(), commit.message, allowedTypes, allowedScopes);
    }

    if (failures.length > 0) return 1;
    console.log('Commit ACCEPTED 👍');
    return 0;
  }

  // ---- 本地模式（commit-msg 文件 / 无参兜底）-----------------------------
  // 特性分支不卡文案。commit-msg 钩子会带消息文件，必须先看分支再读文件，
  // 否则 NEED_CHECK_BRANCHES 形同虚设。
  // `git symbolic-ref` 在 detached HEAD 上会抛错 —— rebase / CI 不该走到这里。
  const branchName = readCurrentBranchName();
  if (!shouldCheckCurrentBranch(branchName)) return 0;

  const commitMsgFile = process.argv[2];
  const gitMessage = commitMsgFile ? fs.readFileSync(commitMsgFile, 'utf8').trim() : readLatestLocalCommit();

  if (!gitMessage) {
    console.log('No commits found. Skipping commit message validation.');
    return 0;
  }

  const result = validateCommitMessage(gitMessage, commitizen);
  if (result.ok) {
    console.log('Commit ACCEPTED 👍');
    return 0;
  }

  reportFailure(result.firstLine, gitMessage, allowedTypes, allowedScopes);
  return 1;
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
