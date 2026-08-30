import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const files = [
  'content/bridge-core.ts',
  'background/background-core.ts',
  'devtools/services/inspected-page-access.service.ts',
  // DevToolsEndpointService 已上移到共享 panel（`modules/rxdb-devtools-panel`），
  // 它的 TSDoc 门禁归 panel 的 public-contracts.spec.ts 管，不在这里重复查。
  'devtools/services/port.service.ts'
];

function exportedDeclarationsWithoutTsdoc(file: string): string[] {
  const path = resolve(import.meta.dirname, file);
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  return source.statements.flatMap(statement => {
    if (ts.isExportDeclaration(statement)) return [];
    const exported =
      ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported || ts.getJSDocCommentsAndTags(statement).length > 0) return [];
    const named = statement as ts.DeclarationStatement;
    return [`${file}:${named.name?.getText(source) ?? statement.kind}`];
  });
}

describe('cross-context public contracts', () => {
  it('requires TSDoc on every exported trust-boundary declaration', () => {
    expect(files.flatMap(exportedDeclarationsWithoutTsdoc)).toEqual([]);
  });
});
