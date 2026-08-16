/**
 * scripts/audit/workflow-action-pins.mjs
 *
 * 第三方 action 钉 commit SHA 审计：扫描 `.github` 下所有 workflow 与复合 action，
 * 拒绝任何指向可变引用（tag / 分支 / 短 SHA）的 `uses:`。
 *
 * 为什么是硬门禁而不是约定：tag 可以被强推。上游账号一旦失陷，把 `v7` 指到新
 * commit 就能拿到本仓库 CI 的 secrets 与 id-token —— 我们这边不会有任何改动，
 * code review 也看不出来。只有 40 位 commit SHA 是不可变的。
 * （`# vX` 尾注保留，Dependabot 靠它识别版本并提 bump PR。）
 *
 * 触发路径：
 *   - `pnpm audit:action-pins`（手动）
 *   - `.github/workflows/ci-template.yml` 的 setup job（阻塞门禁）
 *
 * 豁免两类：
 *   - `./…` 本仓库内的 reusable workflow / 复合 action —— 它们跟着同一个 commit 走，
 *     钉 SHA 只会让每次改动都要同步改调用方；
 *   - `docker://…` 镜像引用 —— 它没有 commit SHA 这一说（镜像 digest 是另一套机制）。
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** `uses:` 行（数组项或裸 key 均可）。行首出现 `#` 的注释行天然匹配不上。 */
const USES_LINE = /^\s*(?:-\s+)?uses:\s*(.+?)\s*$/;

/** 不可变引用的唯一形态：`owner/repo@` + 40 位十六进制 commit SHA。 */
const PINNED_REF = /@[0-9a-f]{40}$/;

/** 去掉行尾注释与包裹引号，取出 `uses:` 的真实取值。 */
const normalizeRef = raw => raw.replace(/\s+#.*$/, '').replace(/^['"]|['"]$/gu, '');

/**
 * 找出一份 YAML 里所有未钉 commit SHA 的 `uses:`。
 *
 * @param {string} file 用于报错定位的文件名（相对路径即可）
 * @param {string[]} lines 该文件按行拆开的内容
 * @returns {string[]} 形如 `['ci.yml:4 -> codecov/codecov-action@v7']`，无违规时为空数组
 */
export function findUnpinnedUses(file, lines) {
  const offenders = [];

  lines.forEach((line, index) => {
    const matched = USES_LINE.exec(line);
    if (matched === null) return;

    const ref = normalizeRef(matched[1]);
    if (ref.startsWith('./') || ref.startsWith('docker://')) return;
    if (PINNED_REF.test(ref)) return;

    offenders.push(`${file}:${index + 1} -> ${ref}`);
  });

  return offenders;
}

/** 递归收集目录下的 `.yml` / `.yaml`。 */
async function collectYamlFiles(dir) {
  const files = [];

  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectYamlFiles(full)));
    } else if (/\.ya?ml$/.test(entry.name)) {
      files.push(full);
    }
  }

  return files;
}

/**
 * 扫描 `.github` 下全部 workflow 与复合 action。
 *
 * @param {string} githubDir .github 目录的绝对路径
 * @returns {Promise<string[]>} 全部违规项
 */
export async function auditGithubDir(githubDir) {
  const offenders = [];

  for (const file of await collectYamlFiles(githubDir)) {
    const content = await readFile(file, 'utf8');
    offenders.push(...findUnpinnedUses(path.relative(githubDir, file), content.split('\n')));
  }

  return offenders;
}

const main = async () => {
  const offenders = await auditGithubDir(path.resolve('.github'));

  if (offenders.length > 0) {
    // 不用 assert：CI 里一屏 AssertionError 堆栈掩盖真正的信息（哪个文件哪一行）。
    console.error('❌ 第三方 action 未钉 commit SHA：');
    for (const offender of offenders) console.error(`   ${offender}`);
    console.error('\n改成 `owner/repo@<40 位 commit SHA> # vX`，尾注供 Dependabot 识别版本。');
    process.exit(1);
  }

  process.stdout.write('✅ Workflow action pins passed.\n');
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
