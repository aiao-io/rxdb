import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * 工作树是可选 peer：发出去的 `.d.ts` 不能 import 它。
 *
 * @remarks
 * `import type` 会从 JS 里消失，却会留在声明里——只要它出现在导出签名上。没装工作树的 strict 消费方
 * （`skipLibCheck: false`）解析主入口的声明图时就会撞 TS2307，哪怕只用录制、从不调 restore。
 * 本包测试环境把工作树装成了 devDependency，正常的类型检查看不见这条红。
 *
 * 逐文件 `transpileDeclaration`：与构建同一套导入省略规则，不做类型检查，整包不到一秒。
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });

const declarationOf = (path: string): string =>
  ts.transpileDeclaration(readFileSync(path, 'utf8'), {
    fileName: path,
    compilerOptions: { module: ts.ModuleKind.NodeNext, removeComments: true }
  }).outputText;

describe('可选 peer 不进声明', () => {
  it.each(sourceFiles(SRC).map(path => relative(SRC, path)))('%s 的声明不引用 @aiao/rxdb-plugin-working-tree', file => {
    expect(declarationOf(join(SRC, file))).not.toContain('@aiao/rxdb-plugin-working-tree');
  });
});
