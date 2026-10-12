/**
 * 包组合知识门禁（US-602 A1）：校验 `requirements/package-graph.json` 与工作区一致，
 * 并核对提交的 `requirements/generated/package-knowledge.{json,md}` 与当前输入逐字节一致。
 *
 * @remarks
 * 投递范围读事实源 `release` 登记的发布标签树，需要本地有该 tag（CI 的 setup job 已 `fetch-tags`）。
 * 文档站只读提交的生成物、构建期不碰 git，因此生成物是包组合知识唯一的投递源；
 * 改了事实源、manifest、插件源码、模板或样例之后跑 `--update` 重新生成，与改动一起提交。
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
import { buildKnowledge, renderKnowledge } from './lib/package-knowledge.mjs';

export { queryCacheRequirements } from './lib/package-knowledge.mjs';
export { analyzePackageGraph, auditPackageGraph, buildKnowledge, discoverRelease, renderKnowledge, scanPackages };

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
    ['package-knowledge.json', rendered.json],
    ['package-knowledge.md', rendered.markdown]
  ];
  const errors = [];
  for (const [name, text] of outputs) {
    const file = join(root, 'requirements/generated', name);
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

function main() {
  const rootArgument = process.argv.find(arg => arg.startsWith('--root='));
  const root = rootArgument ? resolve(rootArgument.slice('--root='.length)) : process.cwd();
  const factsPath = join(root, 'requirements/package-graph.json');
  const facts = JSON.parse(readFileSync(factsPath, 'utf8'));
  const graph = analyzePackageGraph(facts, scanPackages(join(root, 'packages')), factsPath);
  if (graph.errors.length) throw new Error(graph.errors.join('\n'));
  const release = discoverRelease(root, facts.release);
  const input = readKnowledgeInput(root);
  const knowledge = buildKnowledge(graph, release, input);
  const generated = checkGenerated(root, renderKnowledge(knowledge, input.template), process.argv.includes('--update'));
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
