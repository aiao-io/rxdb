import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const files = [
  'shared/types.ts',
  'content/bridge-core.ts',
  'content/opfs.ts',
  'background/background-core.ts',
  'devtools/scripts/utils.ts',
  'devtools/pages/opfs-page.utils.ts',
  'devtools/components/opfs/opfs-context-menu.component.ts',
  'devtools/services/inspected-page-access.service.ts'
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
