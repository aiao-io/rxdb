import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(import.meta.dirname, '../..');
const entries = [
  path.join(packageRoot, 'src/index.ts'),
  path.join(packageRoot, 'src/cli/cli.ts'),
  path.join(packageRoot, 'src/plugins/vite.ts')
];

const program = ts.createProgram(entries, {
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ESNext,
  skipLibCheck: true
});
const checker = program.getTypeChecker();

const hasDocumentation = (declaration: ts.Declaration): boolean => {
  let current: ts.Node | undefined = declaration;
  while (current && !ts.isSourceFile(current)) {
    if (ts.getJSDocCommentsAndTags(current).length > 0) return true;
    if (ts.isStatement(current)) return false;
    current = current.parent;
  }
  return false;
};

describe('公开生成器 API 文档', () => {
  it.each(entries)('%s 的所有导出均有 TSDoc', entry => {
    const source = program.getSourceFile(entry);
    expect(source).toBeDefined();
    const moduleSymbol = checker.getSymbolAtLocation(source!);
    expect(moduleSymbol).toBeDefined();
    const undocumented = checker
      .getExportsOfModule(moduleSymbol!)
      .filter(symbol => {
        const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
        return !resolved.declarations?.some(hasDocumentation);
      })
      .map(symbol => symbol.getName())
      .sort();

    expect(undocumented).toEqual([]);
  });
});
