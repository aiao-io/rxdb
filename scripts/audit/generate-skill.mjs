/**
 * 主包内嵌 Agent Skill 的生成入口（US-602 C）：build 期把 `packages/rxdb/skills/aiao-rxdb/SKILL.md`
 * 渲染成与事实源、manifest、插件源码、样例同版，供随后的 `pnpm pack` 打包。
 *
 * @remarks
 * 与 `package-graph.mjs --update` 的差别：本脚本只写 SKILL.md 一个文件，不碰提交的
 * `requirements/generated/*`。语义事实直接读事实源；投递快照（已发布包名与版本）读提交的
 * `requirements/generated/package-knowledge.json`——它由门禁保证与登记发布标签树一致，
 * 因此构建期不碰 git（CI 的构建 lane 是浅克隆、没有 tag）。仓库根从脚本自身位置解析，不依赖 cwd。
 *
 * @example
 * ```bash
 * node scripts/audit/generate-skill.mjs              # 工作区根
 * node scripts/audit/generate-skill.mjs --root=<dir> # 指定仓库根（fixture 测试）
 * ```
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePackageGraph } from './lib/package-graph-validation.mjs';
import { SKILL_MAX_BYTES } from './lib/package-skill.mjs';
import { readKnowledgeInput, renderSkillFromSnapshot, scanPackages } from './package-graph.mjs';

function isCliEntrypoint() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

function main() {
  const rootArgument = process.argv.find(arg => arg.startsWith('--root='));
  const root =
    rootArgument ?
      resolve(rootArgument.slice('--root='.length))
    : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const factsPath = join(root, 'requirements/package-graph.json');
  const facts = JSON.parse(readFileSync(factsPath, 'utf8'));
  const graph = analyzePackageGraph(facts, scanPackages(join(root, 'packages')), factsPath);
  if (graph.errors.length) throw new Error(graph.errors.join('\n'));
  const input = readKnowledgeInput(root);
  const snapshotPath = join(root, 'requirements/generated/package-knowledge.json');
  if (!existsSync(snapshotPath)) throw new Error(`${snapshotPath} 不存在，请先运行 pnpm audit:package-graph --update`);
  const skill = renderSkillFromSnapshot(root, graph, facts, input, JSON.parse(readFileSync(snapshotPath, 'utf8')));
  const output = join(root, 'packages/rxdb/skills/aiao-rxdb/SKILL.md');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, skill);
  console.log(
    `✅ SKILL.md 已生成：packages/rxdb/skills/aiao-rxdb/SKILL.md（${Buffer.byteLength(skill, 'utf8')} 字节 ≤ ${SKILL_MAX_BYTES}）`
  );
}

if (isCliEntrypoint()) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
