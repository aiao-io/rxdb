import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const files = [
  '../wire/types.ts',
  'scripts/utils.ts',
  'pages/opfs-page.utils.ts',
  'components/opfs/opfs-context-menu.component.ts',
  'transport/devtools-transport.ts',
  'transport/devtools-host-access.ts',
  'transport/devtools-file-channel.ts',
  'transport/v2-file-channel.ts',
  'transport/devtools-panel-version.ts'
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

describe('panel public contracts', () => {
  it('requires TSDoc on every exported trust-boundary declaration', () => {
    expect(files.flatMap(exportedDeclarationsWithoutTsdoc)).toEqual([]);
  });
});
