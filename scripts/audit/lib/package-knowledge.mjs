import { createHash } from 'node:crypto';
import { dependencyEdges } from './package-discovery.mjs';
import { auditPackageGraph } from './package-graph-validation.mjs';
import { collectPlugins, resolveScenario } from './package-plugins.mjs';

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

export function buildKnowledge(facts, records, release, input) {
  const errors = auditPackageGraph(facts, records);
  if (errors.length) throw new Error(errors.join('\n'));
  const byName = new Map(facts.packages.map(fact => [fact.name, fact]));
  const collected = collectPlugins(facts, records);
  const packageInfo = record => ({
    ...byName.get(record.name),
    version: record.manifest.version,
    implementationDependencies: dependencyEdges(record)
  });
  const development = {
    packages: records.map(packageInfo),
    scenarios: facts.scenarios
      .map(scenario => resolveScenario(scenario, facts, collected.plugins))
      .map(scenario => ({
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
      }))
      .sort((a, b) => a.id.localeCompare(b.id, 'en'))
  };
  const published = new Set(release.packages.map(record => record.name));
  for (const name of published) if (!byName.has(name)) throw new Error(`${release.tag}: 发布包 ${name} 未登记`);
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
        plugins: [...collected.plugins.values()],
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

export function renderKnowledge(knowledge, template) {
  const packages = [
    '| 包 | 角色 | 槽位 | 宿主 | 框架 |',
    '| --- | --- | --- | --- | --- |',
    ...knowledge.delivery.packages.map(
      pkg =>
        `| ${pkg.name} | ${pkg.role} | ${pkg.slots.join(', ')} | ${pkg.hosts.join(', ')} | ${pkg.framework ?? ''} |`
    )
  ].join('\n');
  const scenarios = knowledge.delivery.scenarios
    .map(
      scenario =>
        `### ${scenario.description}\n\n必需包：${scenario.packages.join('、')}\n\n插件：${scenario.plugins.map(plugin => plugin.factory).join(' → ') || '无'}\n\n槽位：${stableJson(scenario.slots).trim()}\n\n时序：${scenario.timing.join('、') || '无'}`
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

export function queryCacheRequirements(facts, records) {
  const errors = auditPackageGraph(facts, records);
  if (errors.length) throw new Error(errors.join('\n'));
  const scenario = facts.scenarios.find(scenario => scenario.id === 'http-querycache');
  if (!scenario) throw new Error('事实源缺少 http-querycache 情景');
  const { plugins } = collectPlugins(facts, records);
  const resolved = resolveScenario(scenario, facts, plugins);
  const names = [...new Set([...scenario.plugins, ...resolved.plugins.map(plugin => plugin.name)])];
  return { packages: names, factories: names.map(name => plugins.get(name).factory) };
}
