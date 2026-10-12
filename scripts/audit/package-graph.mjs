/**
 * 包组合知识门禁（US-602 A1/A2）：校验 `requirements/package-graph.json` 与工作区一致，
 * 并核对提交的 `requirements/generated/package-knowledge.{json,md}` 与当前输入逐字节一致。
 *
 * @remarks
 * 投递范围读事实源 `release` 登记的发布标签树，需要本地有该 tag（CI 的 setup job 已 `fetch-tags`）。
 * 文档站只读提交的生成物、构建期不碰 git，因此生成物是包组合知识唯一的投递源；
 * 改了事实源、manifest、插件源码、模板或样例之后跑 `--update` 重新生成，与改动一起提交。
 *
 * A2 起还校验 `@aiao/*` 安装边写法（核心一律 peer `workspace:^`、其余 peer 与兄弟依赖同写 `workspace:^`、
 * 发布标签树里标过的 optional peer 不得删掉 optional 语义），并以标签树 manifest 为 optional 保留基线。
 *
 * @example
 * ```bash
 * pnpm audit:package-graph                                  # 门禁
 * node scripts/audit/package-graph.mjs --update             # 重新生成
 * node scripts/audit/package-graph.mjs --check --root=<dir> # 对另一份工作区副本跑门禁
 * ```
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverRelease, scanPackages } from './lib/package-discovery.mjs';
import { analyzePackageGraph, auditPackageGraph } from './lib/package-graph-validation.mjs';
import {
  buildKnowledge,
  releaseFromSnapshot,
  renderKnowledge,
  snapshotFromKnowledgeJson
} from './lib/package-knowledge.mjs';
import { renderSkill } from './lib/package-skill.mjs';

export { queryCacheRequirements, releaseFromSnapshot, snapshotFromKnowledgeJson } from './lib/package-knowledge.mjs';
export {
  analyzePackageGraph,
  auditPackageGraph,
  buildKnowledge,
  discoverRelease,
  renderKnowledge,
  renderSkill,
  scanPackages
};

/**
 * 读取知识生成的非事实源输入：模板、样例源、安装清单、编译选项与生成器源码。
 *
 * @param root - 仓库根目录
 * @returns `buildKnowledge` 的 `input`；`generatorSources` 让生成器改动进入摘要
 * @throws 样例编译依赖未在根 `devDependencies` 声明时
 */
export function readKnowledgeInput(root) {
  const sampleRoot = join(root, 'scripts/examples/ai-local');
  const generatorFiles = [
    join(root, 'scripts/audit/package-graph.mjs'),
    join(root, 'scripts/audit/generate-skill.mjs'),
    ...readdirSync(join(root, 'scripts/audit/lib'))
      .filter(name => name.startsWith('package-') && name.endsWith('.mjs'))
      .map(name => join(root, 'scripts/audit/lib', name))
  ];
  const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const tools = JSON.parse(readFileSync(join(sampleRoot, 'dev-install.json'), 'utf8'));
  const compilerDependencies = Object.fromEntries(
    tools.map(name => {
      const range = rootManifest.devDependencies[name];
      if (!range) throw new Error(`package.json: 样例编译依赖 ${name} 未声明`);
      return [name, range];
    })
  );
  return {
    compilerDependencies,
    template: readFileSync(join(root, 'scripts/audit/templates/package-knowledge.md'), 'utf8'),
    skillTemplate: readFileSync(join(root, 'scripts/audit/templates/skill-aiao-rxdb.md'), 'utf8'),
    sample: readFileSync(join(sampleRoot, 'main.ts'), 'utf8'),
    compilerOptions: JSON.parse(readFileSync(join(sampleRoot, 'tsconfig.json'), 'utf8')).compilerOptions,
    install: JSON.parse(readFileSync(join(sampleRoot, 'install.json'), 'utf8')),
    generatorSources: generatorFiles.sort().map(file => readFileSync(file, 'utf8'))
  };
}

/**
 * 核对（或在 `update` 时写回）提交的两份生成物。
 *
 * @param root - 仓库根目录
 * @param rendered - `renderKnowledge` 的结果
 * @param update - 为真时写回而不是核对
 * @returns 漂移的文件，空数组即一致
 */
export function checkGenerated(root, rendered, update = false) {
  const outputs = [
    [join(root, 'requirements/generated', 'package-knowledge.json'), rendered.json],
    [join(root, 'requirements/generated', 'package-knowledge.md'), rendered.markdown],
    [join(root, 'packages/rxdb/skills/aiao-rxdb', 'SKILL.md'), rendered.skill]
  ];
  const errors = [];
  for (const [file, text] of outputs) {
    if (update) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
      continue;
    }
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text)
      errors.push(`${file}: 生成物漂移，请运行 pnpm audit:package-graph --update`);
  }
  return errors;
}

/**
 * 渲染主包 Skill：投递快照来自提交的 package-knowledge.json（门禁保证与发布标签树一致），
 * 构建期不碰 git（CI 构建 lane 是浅克隆、没有 tag）。`update` 时快照取本次新渲染的
 * json，避免 SKILL.md 基于旧快照写回后再次漂移。
 *
 * @param root - 仓库根目录
 * @param graph - {@link analyzePackageGraph} 的结果
 * @param facts - 事实源
 * @param input - `readKnowledgeInput` 的结果
 * @param snapshotJson - 已解析的 package-knowledge.json（提交版或本次新渲染版）
 * @returns SKILL.md 文本
 */
export function renderSkillFromSnapshot(root, graph, facts, input, snapshotJson) {
  const snapshot = snapshotFromKnowledgeJson(snapshotJson);
  return renderSkill(
    buildKnowledge(graph, releaseFromSnapshot(facts, graph.records, snapshot), input),
    input.skillTemplate
  );
}

function main() {
  const rootArgument = process.argv.find(arg => arg.startsWith('--root='));
  const root = rootArgument ? resolve(rootArgument.slice('--root='.length)) : process.cwd();
  const factsPath = join(root, 'requirements/package-graph.json');
  const facts = JSON.parse(readFileSync(factsPath, 'utf8'));
  const release = discoverRelease(root, facts.release);
  const graph = analyzePackageGraph(facts, scanPackages(join(root, 'packages')), factsPath, release.packages);
  if (graph.errors.length) throw new Error(graph.errors.join('\n'));
  const input = readKnowledgeInput(root);
  const knowledge = buildKnowledge(graph, release, input);
  const rendered = renderKnowledge(knowledge, input.template);
  const update = process.argv.includes('--update');
  const snapshotJson =
    update ?
      JSON.parse(rendered.json)
    : JSON.parse(readFileSync(join(root, 'requirements/generated/package-knowledge.json'), 'utf8'));
  const generated = checkGenerated(
    root,
    { ...rendered, skill: renderSkillFromSnapshot(root, graph, facts, input, snapshotJson) },
    update
  );
  if (generated.length) throw new Error(generated.join('\n'));
  console.log(
    `✅ 包组合门禁：登记 ${graph.records.length} 包，发布 ${release.packages.length} 包（${release.tag}），${knowledge.development.scenarios.length} 个情景`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
