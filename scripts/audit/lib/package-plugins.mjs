/**
 * 插件元数据的静态读取与情景闭包：从插件类的源码 AST 读 `name` / `inject`，按 `inject` 闭合情景的必需插件。
 *
 * @remarks
 * 只读事实源登记的插件类与它跟随的局部常量，不启动全仓 TypeScript Program；读不出静态值时明确报错。
 */

import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

const parse = source => ts.createSourceFile(source, readFileSync(source, 'utf8'), ts.ScriptTarget.Latest, true);
const unwrap = node =>
  ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node) ?
    unwrap(node.expression)
  : node;

function constant(node, file, source, visited = new Set()) {
  const value = unwrap(node);
  if (ts.isStringLiteral(value)) return value.text;
  if (!ts.isIdentifier(value)) throw new Error(`${source}: 无法静态读取 ${value.getText(file)}`);
  const key = `${source}:${value.text}`;
  if (visited.has(key)) throw new Error(`${source}: 常量循环 ${value.text}`);
  visited.add(key);
  const declarations = file.statements
    .filter(ts.isVariableStatement)
    .flatMap(statement => statement.declarationList.declarations);
  const local = declarations.find(declaration => declaration.name.getText(file) === value.text);
  if (local?.initializer) return constant(local.initializer, file, source, visited);
  const imports = file.statements.filter(ts.isImportDeclaration);
  for (const statement of imports) {
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const binding = bindings.elements.find(element => element.name.text === value.text);
    if (!binding) continue;
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.startsWith('.')) throw new Error(`${source}: 常量 ${value.text} 必须可从局部源码静态读取`);
    const next = resolve(dirname(source), specifier.replace(/\.js$/, '.ts'));
    return constant(
      ts.factory.createIdentifier(binding.propertyName?.text ?? binding.name.text),
      parse(next),
      next,
      visited
    );
  }
  throw new Error(`${source}: 常量 ${value.text} 未定义`);
}

/**
 * 读取一个插件包的插件元数据。
 *
 * @param record - 工作区包记录
 * @param fact - 该包的事实源条目，`plugin` 登记 `source` / `class` / `factory`
 * @returns 插件身份 `id`（类的静态 `name`）、工厂名、`inject` 与源码全文
 * @throws `plugin.source` 不是包目录内的文件、类或工厂缺失、`name` / `inject` 无法静态读取时
 */
export function readPlugin(record, fact) {
  const source = resolve(record.directory, fact.plugin.source);
  const path = relative(record.directory, source);
  if (!path || isAbsolute(path) || path.split(sep)[0] === '..')
    throw new Error(`${record.source}: plugin.source 必须是包目录内的文件`);
  const text = readFileSync(source, 'utf8');
  const file = ts.createSourceFile(source, text, ts.ScriptTarget.Latest, true);
  const declaration = file.statements.find(
    node => ts.isClassDeclaration(node) && node.name?.text === fact.plugin.class
  );
  if (!declaration) throw new Error(`${source}: 缺少插件类 ${fact.plugin.class}`);
  const property = name =>
    declaration.members.find(node => ts.isPropertyDeclaration(node) && node.name.getText(file) === name);
  const identity = property('name');
  if (!identity?.initializer) throw new Error(`${source}: ${fact.plugin.class}.name 缺少静态初始值`);
  const id = constant(identity.initializer, file, source);
  const inject = property('inject');
  const expression = inject?.initializer && unwrap(inject.initializer);
  if (inject && !ts.isArrayLiteralExpression(expression)) throw new Error(`${source}: inject 必须为可静态读取的数组`);
  const dependencies = expression ? expression.elements.map(node => constant(node, file, source)) : [];
  const factory = file.statements
    .filter(ts.isVariableStatement)
    .flatMap(node => node.declarationList.declarations)
    .find(node => node.name.getText(file) === fact.plugin.factory);
  if (!factory) throw new Error(`${source}: 缺少工厂 ${fact.plugin.factory}`);
  return { name: record.name, id, factory: fact.plugin.factory, inject: dependencies, source: text };
}

/**
 * 收集一组包记录里全部插件的元数据。
 *
 * @param facts - 事实源
 * @param records - 工作区包记录；只收集其中存在的插件包（退役包已不在工作区）
 * @returns 包名 → 插件元数据，以及逐包的错误
 */
export function collectPlugins(facts, records) {
  const byName = new Map(records.map(record => [record.name, record]));
  const plugins = new Map();
  const errors = [];
  for (const fact of facts.packages.filter(fact => fact.role === 'plugin' && byName.has(fact.name))) {
    try {
      const plugin = readPlugin(byName.get(fact.name), fact);
      if ([...plugins.values()].some(existing => existing.id === plugin.id))
        errors.push(`${fact.name}: plugin.name 重复 ${plugin.id}`);
      plugins.set(fact.name, plugin);
    } catch (error) {
      errors.push(`${fact.name}: ${error.message}`);
    }
  }
  return { plugins, errors };
}

/**
 * 按插件 `inject` 闭合一个情景：`plugin:*` 前置并入必需插件与必需包，`adapter:*` 前置核对槽位。
 *
 * @param scenario - 事实源情景
 * @param facts - 事实源
 * @param plugins - {@link collectPlugins} 的结果
 * @returns 闭合后的情景（必需包排序、插件按包名排序）与逐条错误
 */
export function resolveScenario(scenario, facts, plugins) {
  const required = new Set(scenario.packages);
  const selected = new Map();
  const errors = [];
  const identities = new Map([...plugins.values()].map(plugin => [plugin.id, plugin]));
  const visiting = new Set();
  const visit = name => {
    if (visiting.has(name)) {
      errors.push(`${scenario.id}: plugin.inject 循环 ${name}`);
      return;
    }
    if (selected.has(name)) return;
    const plugin = plugins.get(name);
    if (!plugin) {
      errors.push(`${scenario.id}: 插件 ${name} 未登记或源码无效`);
      return;
    }
    visiting.add(name);
    for (const dependency of plugin.inject) visitDependency(dependency);
    visiting.delete(name);
    selected.set(name, plugin);
    required.add(name);
  };
  const visitDependency = dependency => {
    if (dependency.startsWith('adapter:')) {
      const slot = dependency.slice('adapter:'.length);
      if (!scenario.slots[slot]) errors.push(`${scenario.id}: inject 缺少 ${dependency} 槽位`);
      return;
    }
    const plugin = identities.get(dependency.slice('plugin:'.length));
    if (!dependency.startsWith('plugin:') || !plugin) {
      errors.push(`${scenario.id}: inject ${dependency} 找不到前置插件`);
      return;
    }
    visit(plugin.name);
  };
  scenario.plugins.forEach(visit);
  for (const name of required)
    if (!facts.packages.some(fact => fact.name === name)) errors.push(`${scenario.id}: 必需包 ${name} 未登记`);
  return {
    ...scenario,
    packages: [...required].sort(),
    plugins: [...selected.values()].sort((a, b) => a.name.localeCompare(b.name, 'en')),
    errors
  };
}
