/**
 * 包组合事实源（`requirements/package-graph.json`）的漂移门禁规则。
 *
 * @remarks
 * 校验登记完整（工作区非 private 包全部登记、无删包残留与重复）、字段与角色 / 槽位合法、
 * 情景无悬空引用、`@aiao/*` 依赖不成环、情景的必需插件对 `inject` 闭合。错误指向事实源路径、包名与字段。
 *
 * 已发布的包删目录时，条目标 `retired: true` 保留：它仍在登记的发布里、仍可安装。
 * `release` 切到不含它的标签后，知识生成会要求删掉条目（见 `package-knowledge.mjs`）。
 */

import { dependencyEdges } from './package-discovery.mjs';
import { collectPlugins, resolveScenario } from './package-plugins.mjs';

const roles = new Set([
  'core',
  'backend',
  'shared-impl',
  'capability',
  'plugin',
  'binding',
  'model',
  'tool',
  'standalone'
]);
const frameworks = new Set(['angular', 'react', 'vue']);
const hostNames = new Set(['browser', 'node', 'electron', 'tauri', 'miniprogram']);
const releaseTag = /^v\d+\.\d+\.\d+$/;
const arrayOfStrings = value =>
  Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0);

function validateFact(fact) {
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) return ['package 必须为对象'];
  const errors = [];
  const report = field => errors.push(`${fact.name ?? '(unnamed)'}: ${field} 无效`);
  if (typeof fact.name !== 'string' || !fact.name) report('name');
  if (typeof fact.description !== 'string' || !fact.description) report('description');
  if (!roles.has(fact.role)) report('role');
  if (!arrayOfStrings(fact.hosts) || !fact.hosts.length || fact.hosts.some(host => !hostNames.has(host)))
    report('hosts');
  if (!arrayOfStrings(fact.slots) || fact.slots.some(slot => !['local', 'remote'].includes(slot))) report('slots');
  if (fact.role !== 'backend' && fact.slots?.length) report('slots（只有 backend 可占槽位）');
  if (fact.role === 'backend' && !fact.slots?.length) report('slots（backend 必须声明槽位）');
  if (fact.role === 'binding' ? !frameworks.has(fact.framework) : fact.framework !== null) report('framework');
  if (
    fact.role === 'plugin' &&
    !['source', 'class', 'factory'].every(key => typeof fact.plugin?.[key] === 'string' && fact.plugin[key])
  )
    report('plugin');
  if ('retired' in fact && fact.retired !== true) report('retired（只能省略或为 true）');
  if (['dependencies', 'peerDependencies', 'optionalDependencies', 'inject'].some(key => key in fact))
    report('人工复制的依赖边');
  return errors;
}

function validateScenario(scenario, byName) {
  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) return ['scenario 必须为对象'];
  const errors = [];
  const report = message => errors.push(`${scenario.id ?? '(unnamed)'}: ${message}`);
  if (
    typeof scenario.id !== 'string' ||
    !scenario.id ||
    typeof scenario.description !== 'string' ||
    !scenario.description
  )
    report('id/description 无效');
  for (const field of ['packages', 'plugins', 'timing']) if (!arrayOfStrings(scenario[field])) report(`${field} 无效`);
  if (!scenario.slots || typeof scenario.slots !== 'object' || Array.isArray(scenario.slots)) report('slots 无效');
  if (errors.length) return errors;
  for (const name of [...scenario.packages, ...scenario.plugins]) {
    if (!byName.has(name)) report(`引用未登记包 ${name}`);
    else if (byName.get(name).retired) report(`引用退役包 ${name}`);
  }
  for (const [slot, name] of Object.entries(scenario.slots)) {
    const fact = byName.get(name);
    if (!['local', 'remote'].includes(slot) || fact?.role !== 'backend' || !fact.slots.includes(slot))
      report(`${slot} 槽位与 ${name} 不匹配`);
    if (!scenario.packages.includes(name)) report(`${slot} 槽位的包 ${name} 不在必需包集合`);
  }
  for (const name of scenario.packages) {
    const fact = byName.get(name);
    if (fact?.role === 'backend' && !Object.values(scenario.slots).includes(name))
      report(`backend ${name} 未分配槽位（同槽双后端）`);
  }
  return errors;
}

function validateDependencies(records) {
  const byName = new Map(records.map(record => [record.name, record]));
  const errors = [];
  const visited = new Set();
  const active = new Set();
  const visit = (name, trail) => {
    if (active.has(name)) {
      errors.push(`${byName.get(name).source}: manifest 依赖循环 ${[...trail, name].join(' → ')}`);
      return;
    }
    if (visited.has(name)) return;
    active.add(name);
    for (const edge of dependencyEdges(byName.get(name))) {
      if (!byName.has(edge.name)) errors.push(`${byName.get(name).source}: ${edge.kind} 引用未登记兄弟包 ${edge.name}`);
      else visit(edge.name, [...trail, name]);
    }
    active.delete(name);
    visited.add(name);
  };
  for (const name of byName.keys()) visit(name, []);
  return errors;
}

function registrationErrors(facts, records, factsPath) {
  const errors = facts.packages.flatMap(validateFact).map(error => `${factsPath}: ${error}`);
  if (typeof facts.release !== 'string' || !releaseTag.test(facts.release))
    errors.push(`${factsPath}: release 必须是正式版发布标签 v<major>.<minor>.<patch>`);
  const byName = new Map();
  for (const fact of facts.packages) {
    if (byName.has(fact.name)) errors.push(`${factsPath}: 包重复 ${fact.name}`);
    byName.set(fact.name, fact);
  }
  const actual = new Set();
  for (const record of records) {
    if (actual.has(record.name)) errors.push(`${record.source}: manifest.name 重复 ${record.name}`);
    actual.add(record.name);
  }
  for (const name of actual) if (!byName.has(name)) errors.push(`${factsPath}: 漏登记 ${name}`);
  for (const [name, fact] of byName) {
    if (fact.retired && actual.has(name)) errors.push(`${factsPath}: 退役包 ${name} 仍在 packages/`);
    if (!fact.retired && !actual.has(name))
      errors.push(`${factsPath}: 删包残留 ${name}（已发布的包删目录时改标 retired: true）`);
  }
  return [...errors, ...validateDependencies(records)];
}

function scenarioErrors(facts, factsPath) {
  const byName = new Map(facts.packages.map(fact => [fact.name, fact]));
  const errors = [];
  const ids = new Set();
  for (const scenario of facts.scenarios) {
    if (ids.has(scenario.id)) errors.push(`${factsPath}: 情景重复 ${scenario.id}`);
    ids.add(scenario.id);
    errors.push(...validateScenario(scenario, byName).map(error => `${factsPath}: ${error}`));
  }
  return errors;
}

/**
 * 校验事实源与工作区，并一次求出工作区的插件元数据。
 *
 * @param facts - 事实源
 * @param records - 门禁范围的包记录（{@link scanPackages}）
 * @param factsPath - 报错定位用的事实源路径
 * @returns 原样带回的 `facts` / `records`、工作区插件元数据与错误；有错误时 `plugins` 为空
 */
export function analyzePackageGraph(facts, records, factsPath = 'requirements/package-graph.json') {
  const result = errors => ({ facts, records, plugins: new Map(), errors });
  if (!facts || facts.schemaVersion !== 1 || !Array.isArray(facts.packages) || !Array.isArray(facts.scenarios))
    return result([`${factsPath}: schemaVersion/packages/scenarios 无效`]);
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!facts.packages.every(isRecord)) return result([`${factsPath}: packages 项必须为对象`]);
  if (!facts.scenarios.every(isRecord)) return result([`${factsPath}: scenarios 项必须为对象`]);
  const registration = registrationErrors(facts, records, factsPath);
  if (registration.length) return result(registration);
  const scenarios = scenarioErrors(facts, factsPath);
  if (scenarios.length) return result(scenarios);
  const { plugins, errors } = collectPlugins(facts, records);
  for (const scenario of facts.scenarios)
    errors.push(...resolveScenario(scenario, facts, plugins).errors.map(error => `${factsPath}: ${error}`));
  return { facts, records, plugins, errors };
}

/**
 * 包组合漂移门禁。
 *
 * @param facts - 事实源
 * @param records - 门禁范围的包记录
 * @param factsPath - 报错定位用的事实源路径
 * @returns 错误列表，空数组即通过
 */
export function auditPackageGraph(facts, records, factsPath) {
  return analyzePackageGraph(facts, records, factsPath).errors;
}
