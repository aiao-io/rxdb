/**
 * 包组合知识的确定性生成：事实源 + manifest + 插件源码 + 样例 → `requirements/generated/package-knowledge.{json,md}`。
 *
 * @remarks
 * `development` 取工作区 manifest；`delivery` 取登记发布标签树里的 manifest，安装命令只给这个集合。
 * 情景的插件闭包与样例两边都取工作区源码（样例在 CI 中执行过），可能新于登记的发布——生成物正文如实注明。
 * 输出稳定排序、不含当前时间，带发布版本与全部输入的摘要。
 */

import { createHash } from 'node:crypto';
import ts from 'typescript';
import { dependencyEdges } from './package-discovery.mjs';
import { analyzePackageGraph } from './package-graph-validation.mjs';
import { resolveScenario } from './package-plugins.mjs';

/**
 * 键排序后的 JSON（两空格缩进、末尾换行），同一输入逐字节一致。
 *
 * @param value - 任意 JSON 值
 * @returns 序列化文本
 */
export function stableJson(value) {
  const normalize = input => {
    if (Array.isArray(input)) return input.map(normalize);
    if (!input || typeof input !== 'object') return input;
    return Object.fromEntries(
      Object.keys(input)
        .sort()
        .map(key => [key, normalize(input[key])])
    );
  };
  return JSON.stringify(normalize(value), null, 2) + '\n';
}

const packageOf = specifier =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/');

function sampleImports(sample) {
  const file = ts.createSourceFile('sample.ts', sample, ts.ScriptTarget.Latest, true);
  return file.statements
    .filter(node => (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
    .map(node => node.moduleSpecifier.text)
    .filter(specifier => !specifier.startsWith('.') && !specifier.startsWith('node:'))
    .map(packageOf);
}

const describeScenario = scenario => ({
  id: scenario.id,
  description: scenario.description,
  packages: scenario.packages,
  slots: scenario.slots,
  timing: scenario.timing,
  plugins: scenario.plugins.map(plugin => ({
    name: plugin.name,
    id: plugin.id,
    factory: plugin.factory,
    inject: plugin.inject
  }))
});

/**
 * 生成包组合知识。
 *
 * @param graph - {@link analyzePackageGraph} 的结果，必须无错误
 * @param release - 登记发布标签的投递范围（{@link discoverRelease}），标签必须等于 `facts.release`
 * @param input - 模板、样例、安装清单与编译选项（`readKnowledgeInput`）
 * @returns 带 `version`（发布标签）与 `digest`（全部输入的 SHA-256）的知识对象
 * @throws 门禁错误、发布包未登记、退役包已不在发布里、样例 import 不在安装清单或安装包未发布时
 */
export function buildKnowledge(graph, release, input) {
  if (graph.errors.length) throw new Error(graph.errors.join('\n'));
  const { facts, records, plugins } = graph;
  if (release.tag !== facts.release)
    throw new Error(`投递范围 ${release.tag} 与事实源 release ${facts.release} 不一致`);
  const byName = new Map(facts.packages.map(fact => [fact.name, fact]));
  const published = new Set(release.packages.map(record => record.name));
  for (const name of published) if (!byName.has(name)) throw new Error(`${release.tag}: 发布包 ${name} 未登记`);
  for (const fact of facts.packages)
    if (fact.retired && !published.has(fact.name))
      throw new Error(`${release.tag}: 退役包 ${fact.name} 已不在发布里，删除其登记`);
  const undeclared = sampleImports(input.sample).filter(name => !input.install.includes(name));
  if (undeclared.length) throw new Error(`样例 import 的包不在 install.json：${[...new Set(undeclared)].join('、')}`);
  const packageInfo = record => ({
    ...byName.get(record.name),
    version: record.manifest.version,
    homepage: record.manifest.homepage ?? null,
    implementationDependencies: dependencyEdges(record)
  });
  const development = {
    packages: records.map(packageInfo),
    scenarios: facts.scenarios
      .map(scenario => describeScenario(resolveScenario(scenario, facts, plugins)))
      .sort((a, b) => a.id.localeCompare(b.id, 'en'))
  };
  const delivery = {
    packages: release.packages.map(packageInfo),
    scenarios: development.scenarios.filter(scenario => scenario.packages.every(name => published.has(name)))
  };
  const installation = input.install.map(name => {
    const record = release.packages.find(record => record.name === name);
    if (!record) throw new Error(`${release.tag}: 样例包 ${name} 未发布`);
    return `${name}@^${record.manifest.version}`;
  });
  const digest = createHash('sha256')
    .update(
      stableJson({
        facts,
        manifests: records.map(record => ({ name: record.name, manifest: record.manifest })),
        release: {
          tag: release.tag,
          packages: release.packages.map(record => ({ name: record.name, manifest: record.manifest }))
        },
        plugins: [...plugins.values()],
        input
      })
    )
    .digest('hex');
  return {
    schemaVersion: 1,
    version: release.tag,
    digest,
    development,
    delivery,
    sample: {
      install: `pnpm add ${installation.join(' ')}`,
      devInstall: `pnpm add -D ${Object.entries(input.compilerDependencies)
        .map(([name, range]) => `${name}@${range}`)
        .join(' ')}`,
      compilerOptions: input.compilerOptions,
      source: input.sample
    }
  };
}

/**
 * 把知识渲染成提交的两份生成物。
 *
 * @param knowledge - {@link buildKnowledge} 的结果
 * @param template - Markdown 模板，`{{字段}}` 只认 version / digest / packages / scenarios / sample
 * @returns `json` 与 `markdown` 文本，均以换行结尾
 * @throws 模板引用未知字段时
 */
export function renderKnowledge(knowledge, template) {
  const packages = [
    '| 包 | 角色 | 槽位 | 宿主 | 框架 |',
    '| --- | --- | --- | --- | --- |',
    ...knowledge.delivery.packages.map(
      pkg =>
        `| ${pkg.name}${pkg.retired ? '（已退役）' : ''} | ${pkg.role} | ${pkg.slots.join(', ')} | ${pkg.hosts.join(', ')} | ${pkg.framework ?? ''} |`
    )
  ].join('\n');
  const scenarios = knowledge.delivery.scenarios
    .map(
      scenario =>
        `### ${scenario.description}\n\n必需包：${scenario.packages.join('、')}\n\n插件（顺序不限）：${scenario.plugins.map(plugin => plugin.factory).join('、') || '无'}\n\n槽位：${stableJson(scenario.slots).trim()}\n\n时序：${scenario.timing.join('、') || '无'}`
    )
    .join('\n\n');
  const sample = `\`\`\`sh\n${knowledge.sample.install}\n${knowledge.sample.devInstall}\n\`\`\`\n\n\`\`\`json\n${stableJson(knowledge.sample.compilerOptions).trim()}\n\`\`\`\n\n\`\`\`ts\n${knowledge.sample.source.trim()}\n\`\`\``;
  const fields = { version: knowledge.version, digest: knowledge.digest, packages, scenarios, sample };
  const markdown = template.replace(/\{\{(\w+)\}\}/g, (_match, name) => {
    if (!(name in fields)) throw new Error(`模板包含未知字段 ${name}`);
    return fields[name];
  });
  return { json: stableJson(knowledge), markdown: markdown.endsWith('\n') ? markdown : markdown + '\n' };
}

/**
 * 事实源 `http-querycache` 情景闭合后的 QueryCache 必需插件包与注册工厂，供文档门禁比对示例。
 *
 * @param facts - 事实源
 * @param records - 门禁范围的包记录
 * @returns 插件包名与一一对应的工厂名（情景入口在前，`inject` 闭合出的在后）
 * @throws 门禁错误或事实源缺少该情景时
 */
export function queryCacheRequirements(facts, records) {
  const { errors, plugins } = analyzePackageGraph(facts, records);
  if (errors.length) throw new Error(errors.join('\n'));
  const scenario = facts.scenarios.find(scenario => scenario.id === 'http-querycache');
  if (!scenario) throw new Error('事实源缺少 http-querycache 情景');
  const resolved = resolveScenario(scenario, facts, plugins);
  const names = [...new Set([...scenario.plugins, ...resolved.plugins.map(plugin => plugin.name)])];
  return { packages: names, factories: names.map(name => plugins.get(name).factory) };
}
