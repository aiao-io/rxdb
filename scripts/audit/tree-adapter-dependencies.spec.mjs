import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const plugin = '@aiao/rxdb-plugin-tree';
const adapters = ['pglite', 'sqlite-core', 'supabase', 'sqlite-wasm'];
const packages = new URL('../../packages/', import.meta.url);

for (const adapter of adapters) {
  const root = new URL(`rxdb-adapter-${adapter}/`, packages);

  test(`${adapter} 不强制安装 tree 插件`, async () => {
    const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
    assert.equal(pkg.dependencies?.[plugin], undefined);
    assert.equal(pkg.optionalDependencies?.[plugin], undefined);
    assert.equal(pkg.devDependencies[plugin], 'workspace:*');
    if (adapter === 'sqlite-wasm') {
      assert.equal(pkg.peerDependencies?.[plugin], undefined);
      return;
    }
    assert.equal(pkg.peerDependencies[plugin], 'workspace:*');
    assert.equal(pkg.peerDependenciesMeta[plugin].optional, true);
  });

  test(`${adapter} 的生产代码只允许 tree 类型导入`, async () => {
    const src = new URL('src/', root);
    const files = await readdir(src, { recursive: true });
    const production = files.filter(file => file.endsWith('.ts') && !file.split('/').includes('__tests__'));
    for (const file of production) {
      const source = await readFile(new URL(file, src), 'utf8');
      const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      const imports = parsed.statements.filter(ts.isImportDeclaration);
      const treeImports = imports.filter(statement => statement.moduleSpecifier.text === plugin);
      for (const statement of treeImports) {
        assert.equal(statement.importClause?.isTypeOnly, true, `${file} 必须使用 import type`);
      }
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext, removeComments: true }
      });
      assert.ok(!outputText.includes(plugin), `${file} 不得生成 tree 运行时依赖`);
    }
  });
}
