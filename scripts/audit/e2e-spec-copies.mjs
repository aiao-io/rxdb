/**
 * scripts/audit/e2e-spec-copies.mjs
 *
 * 三端 e2e「同内容三副本」的同步门禁：{@link COPY_GROUPS} 里登记的 spec 在
 * `apps/dev-rxdb-{angular,react,vue}-e2e/src/` 各有一份，三份只许导入不同——
 * Angular 从 `./fixtures.js` 取 `test` / `expect`（US-909 失败归档守卫），React / Vue 从
 * `@playwright/test` 取，导入的合并方式与先后顺序随各自的格式化；把这一处换源算掉之后，
 * 导入集合必须相同，导入之外的文件头与正文必须逐字节相同。
 *
 * 为什么是门禁而不是约定：三份副本是刻意的——e2e 项目的 tsconfig `rootDir` 各是自己的项目目录，
 * 跨项目 import `.ts` 会触发 TS6059 / TS6307（见 `modules/e2e-parity/README.md`）；
 * 而改一端漏两端时三端 e2e 各自照绿，对拍的前提「三端跑的是同一场景」就悄悄不成立了。
 * 放在 CI setup 的静态门禁组而不是某个 e2e 项目的测试里：副本改动只让对应 e2e 项目进 affected，
 * 挂在任何单个项目上都会在另两端漏跑。
 *
 * 新增一组三端副本时在 {@link COPY_GROUPS} 登记；登记了却在某端找不到文件（含整组删掉、登记表过期）同样报出。
 *
 * 触发路径：
 *   - `pnpm audit:e2e-spec-copies`（手动）
 *   - `.github/workflows/ci-template.yml` 的 setup job（阻塞门禁）
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

/** 三端 e2e 项目（`apps/<项目>/src/` 下放 spec），第一项是比对基准。 */
export const E2E_PROJECTS = ['dev-rxdb-angular-e2e', 'dev-rxdb-react-e2e', 'dev-rxdb-vue-e2e'];

/** 三端同内容副本登记表（文件名相同，分处三个 e2e 项目）。 */
export const COPY_GROUPS = ['board.spec.ts', 'board-parity.spec.ts', 'entity-model-parity.spec.ts'];

/** 只有基准端（Angular）允许把这个来源当作 `@playwright/test`。 */
const ANGULAR_FIXTURES = './fixtures.js';
const PLAYWRIGHT = '@playwright/test';

/** 一条导入声明展开成「来源 + 绑定」对：类型导入记 `type X`，别名记 `a as b`。 */
const importPairs = (declaration, sourceAlias) => {
  const source = sourceAlias(declaration.moduleSpecifier.text);
  const clause = declaration.importClause;
  if (clause === undefined) return [{ source, binding: '(side effect)' }];
  const typePrefix = name => (clause.isTypeOnly ? `type ${name}` : name);
  const pairs = clause.name === undefined ? [] : [{ source, binding: typePrefix(`default as ${clause.name.text}`) }];
  const bindings = clause.namedBindings;
  if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
    pairs.push({ source, binding: typePrefix(`* as ${bindings.name.text}`) });
  }
  if (bindings !== undefined && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      const name = element.propertyName ? `${element.propertyName.text} as ${element.name.text}` : element.name.text;
      pairs.push({ source, binding: element.isTypeOnly ? `type ${name}` : typePrefix(name) });
    }
  }
  return pairs;
};

/**
 * 拆出文件头（首条导入之前）、导入对与正文（末条连续导入之后）。
 *
 * @param {string} text spec 源码
 * @param {(source: string) => string} sourceAlias 导入来源换算（基准端把 fixtures 记作 playwright）
 */
const splitSpec = (text, sourceAlias) => {
  const file = ts.createSourceFile('copy.spec.ts', text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const imports = [];
  let bodyStart = 0;
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) break;
    imports.push(...importPairs(statement, sourceAlias));
    bodyStart = statement.end;
  }
  const header = imports.length > 0 ? text.slice(0, file.statements[0].getStart(file)) : '';
  return {
    header,
    imports: new Set(imports.map(({ source, binding }) => `${source}\u0000${binding}`)),
    body: text.slice(bodyStart),
    bodyLine: text.slice(0, bodyStart).split('\n').length
  };
};

/** 导入对按来源分组成 `来源 { 绑定, … }`。 */
const describeImports = keys => {
  const bySource = new Map();
  for (const key of [...keys].sort()) {
    const [source, binding] = key.split('\u0000');
    bySource.set(source, [...(bySource.get(source) ?? []), binding]);
  }
  return [...bySource].map(([source, bindings]) => `${source} { ${bindings.join(', ')} }`).join('、');
};

const importProblem = (reference, copy) => {
  const extra = [...copy.imports].filter(key => !reference.imports.has(key));
  const missing = [...reference.imports].filter(key => !copy.imports.has(key));
  const parts = [];
  if (extra.length > 0) parts.push(`多 ${describeImports(extra)}`);
  if (missing.length > 0) parts.push(`少 ${describeImports(missing)}`);
  return parts.length > 0 ? `导入与 ${reference.project} 不同（${parts.join('；')}）` : null;
};

const bodyProblem = (reference, copy) => {
  if (copy.body === reference.body) return null;
  const left = reference.body.split('\n');
  const right = copy.body.split('\n');
  let index = 0;
  while (left[index] === right[index]) index++;
  return `正文与 ${reference.project} 不同（${copy.project} 第 ${copy.bodyLine + index} 行起）`;
};

/**
 * 比对一组三端副本。
 *
 * @param {string} name 副本文件名（报错定位用）
 * @param {{ project: string, text: string }[]} copies 按 {@link E2E_PROJECTS} 顺序的三份源码
 * @returns {string[]} 违规项，同步时为空数组
 */
export function compareCopies(name, copies) {
  const [reference, ...others] = copies.map((copy, index) => ({
    project: copy.project,
    ...splitSpec(copy.text, source => (index === 0 && source === ANGULAR_FIXTURES ? PLAYWRIGHT : source))
  }));
  const problems = [];
  for (const copy of others) {
    const found = [
      copy.header === reference.header ? null : `文件头与 ${reference.project} 不同`,
      importProblem(reference, copy),
      bodyProblem(reference, copy)
    ];
    for (const problem of found) if (problem !== null) problems.push(`${name}：${copy.project} ${problem}`);
  }
  return problems;
}

/**
 * 核对工作区里全部登记的副本组。
 *
 * @param {string} root 工作区根目录
 * @param {string[]} groups 副本文件名登记表（默认 {@link COPY_GROUPS}）
 * @returns {string[]} 全部违规项
 */
export function auditSpecCopies(root, groups = COPY_GROUPS) {
  const problems = [];
  for (const name of groups) {
    const files = E2E_PROJECTS.map(project => path.posix.join('apps', project, 'src', name));
    const missing = files.filter(file => !existsSync(path.join(root, file)));
    if (missing.length > 0) {
      problems.push(`${name}：缺 ${missing.join('、')}`);
      continue;
    }
    const copies = E2E_PROJECTS.map((project, index) => ({
      project,
      text: readFileSync(path.join(root, files[index]), 'utf8')
    }));
    problems.push(...compareCopies(name, copies));
  }
  return problems;
}

const main = () => {
  const problems = auditSpecCopies(process.cwd());

  if (problems.length > 0) {
    // 不用 assert：CI 里一屏 AssertionError 堆栈掩盖真正的信息（哪组副本、哪一端、第几行）。
    console.error('❌ 三端 e2e 副本不同步：');
    for (const problem of problems) console.error(`   ${problem}`);
    console.error('\n三份副本改一处改三处；只有 Angular 端从 ./fixtures.js 取 test / expect。');
    process.exit(1);
  }

  process.stdout.write(`✅ E2E spec copies passed: ${COPY_GROUPS.length} 组三端副本同步。\n`);
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
