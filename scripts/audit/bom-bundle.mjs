import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '../..');
const entries = {
  core: 'packages/rxdb-plugin-bom/dist/index.js',
  testing: 'packages/rxdb-plugin-bom/dist/testing/index.js',
  angular: 'dist/packages/rxdb-plugin-bom-angular/fesm2022/aiao-rxdb-plugin-bom-angular.mjs',
  react: 'packages/rxdb-plugin-bom-react/dist/index.js',
  vue: 'packages/rxdb-plugin-bom-vue/dist/index.js'
};
const budget = 50_000;
const gzipBytes = file => gzipSync(readFileSync(file), { level: 6 }).length;

const dependencies = (entry, dynamic) => {
  const files = new Set();
  const external = new Set();
  const visit = file => {
    if (files.has(file)) return;
    if (!existsSync(file)) throw new Error(`缺少构建产物：${relative(root, file)}`);
    files.add(file);
    const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const follow = specifier => {
      if (specifier.startsWith('.')) visit(resolve(dirname(file), specifier));
      else external.add(specifier);
    };
    const scan = node => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        follow(node.moduleSpecifier.text);
      }
      if (
        dynamic &&
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        follow(node.arguments[0].text);
      }
      ts.forEachChild(node, scan);
    };
    scan(ast);
  };
  visit(entry);
  return {
    gzipBytes: [...files].reduce((sum, file) => sum + gzipBytes(file), 0),
    rawBytes: [...files].reduce((sum, file) => sum + readFileSync(file).length, 0),
    files: [...files].map(file => relative(root, file)),
    external: [...external].sort()
  };
};

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  budgetBytes: budget,
  method: 'TypeScript AST遍历包内相对静态import/export及字面动态import；每文件gzip(level=6)求和，外部peer依赖另列',
  entries: Object.fromEntries(
    Object.entries(entries).map(([name, path]) => {
      const entry = resolve(root, path);
      const measured = {
        path,
        entryGzipBytes: gzipBytes(entry),
        static: dependencies(entry, false),
        reachable: dependencies(entry, true)
      };
      return [name, { ...measured, withinBudget: measured.static.gzipBytes < budget }];
    })
  )
};
const directory = resolve(root, 'benchmarks/reports');
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, 'bom-bundle.json'), `${JSON.stringify(report, null, 2)}\n`);
for (const [name, entry] of Object.entries(report.entries)) {
  console.log(
    `${name}: entry=${entry.entryGzipBytes}, static=${entry.static.gzipBytes}, reachable=${entry.reachable.gzipBytes}, budget=${entry.withinBudget ? 'PASS' : 'FAIL'}`
  );
}
if (Object.values(report.entries).some(entry => !entry.withinBudget)) process.exitCode = 1;
