/**
 * 发布类型消费者与运行时基线对账（RV-01a1bbbcfca2）。
 *
 * @remarks
 * `public-contract/consumer.ts` 由 `tsconfig.publish.json`（strict、NodeNext、`paths: {}`、`noUnusedLocals`）
 * 按真实 `exports` 编译：一个入口只要被 import，它的声明缺失（TS7016）或少了某个导出（TS2305）都会让
 * build 失败，`noUnusedLocals` 又保证 import 进来的名字确实被用到。剩下的缺口是「consumer 根本没 import」——
 * 运行时基线照样通过，真实用户首次导入才报错。这里按 `baseline.json` 机械核对每个入口、每个运行时导出
 * 都出现在 consumer 的 import 里。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type Baseline = Record<string, Record<string, string>>;

const PACKAGE_NAME = '@aiao/rxdb-test';
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const readPackageFile = (path: string): string => readFileSync(resolve(PACKAGE_ROOT, path), 'utf8');

const baseline = JSON.parse(readPackageFile('public-contract/baseline.json')) as Baseline;
const consumerSource = readPackageFile('public-contract/consumer.ts');

const specifierOf = (entry: string): string => (entry === '.' ? PACKAGE_NAME : `${PACKAGE_NAME}/${entry.slice(2)}`);

/** consumer 对每个模块说明符 import 的导出名（取被导入的名字，不取本地别名）。 */
const importedNames = (source: string): Map<string, Set<string>> => {
  const file = ts.createSourceFile('consumer.ts', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const imported = new Map<string, Set<string>>();
  for (const statement of file.statements.filter(ts.isImportDeclaration)) {
    const specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
    const bindings = statement.importClause?.namedBindings;
    const names = bindings && ts.isNamedImports(bindings) ? bindings.elements : [];
    imported.set(
      specifier,
      new Set([...(imported.get(specifier) ?? []), ...names.map(n => (n.propertyName ?? n.name).text)])
    );
  }
  return imported;
};

/** baseline 里没被 consumer import 的运行时导出，按入口列出；全覆盖时为空对象。 */
const unconsumedExports = (expected: Baseline, source: string): Record<string, string[]> => {
  const imported = importedNames(source);
  const gaps = Object.entries(expected).map(([entry, exports]) => {
    const names = imported.get(specifierOf(entry)) ?? new Set<string>();
    return [entry, Object.keys(exports).filter(name => !names.has(name))] as const;
  });
  return Object.fromEntries(gaps.filter(([, missing]) => missing.length > 0));
};

describe('public-contract consumer 覆盖发布基线', () => {
  it('consumer 覆盖 baseline.json 的每个入口与每个运行时导出', () => {
    expect(unconsumedExports(baseline, consumerSource)).toEqual({});
  });

  it('反向样例：少 import 一整个入口或一个导出时，对账报出缺口', () => {
    const withoutEntry = consumerSource.replace(/import \{[^}]*\} from '@aiao\/rxdb-test\/check-constraint';/, '');
    const withoutName = consumerSource.replace(/^\s*TypeDemoNative,\n/m, '');

    expect(withoutEntry).not.toBe(consumerSource);
    expect(unconsumedExports(baseline, withoutEntry)).toEqual({
      './check-constraint': Object.keys(baseline['./check-constraint'])
    });
    expect(withoutName).not.toBe(consumerSource);
    expect(unconsumedExports(baseline, withoutName)).toEqual({ './entities': ['TypeDemoNative'] });
  });

  it('consumer 的编译配置保住对账依赖的前提：strict、NodeNext 按 exports 解析、不跳过声明、未用即报错', () => {
    const { compilerOptions } = JSON.parse(readPackageFile('tsconfig.publish.json')) as {
      compilerOptions: Record<string, unknown>;
    };

    expect(compilerOptions).toMatchObject({
      strict: true,
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      skipLibCheck: false,
      noUnusedLocals: true,
      paths: {}
    });
  });
});
