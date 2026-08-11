import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const emitDeclarations = (): Map<string, string> => {
  const tsconfigPath = resolve(PACKAGE_ROOT, 'tsconfig.lib.json');
  const config = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.formatDiagnostic(config.error, formatHost));

  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    PACKAGE_ROOT,
    {
      composite: false,
      declaration: true,
      declarationMap: false,
      emitDeclarationOnly: true,
      incremental: false,
      noEmit: false,
      tsBuildInfoFile: undefined
    },
    tsconfigPath
  );
  const output = new Map<string, string>();
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences
  });
  const emitted = program.emit(undefined, (fileName, text) => output.set(fileName, text));
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics].filter(
    diagnostic => diagnostic.category === ts.DiagnosticCategory.Error
  );
  if (diagnostics.length > 0) throw new Error(ts.formatDiagnostics(diagnostics, formatHost));
  return output;
};

const formatHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: fileName => fileName,
  getCurrentDirectory: () => PACKAGE_ROOT,
  getNewLine: () => '\n'
};

const findDeclaration = (output: Map<string, string>, fileName: string): string => {
  const found = Array.from(output.entries()).find(([path]) => path.endsWith(`/${fileName}`));
  if (!found) throw new Error(`未生成声明：${fileName}`);
  return found[1];
};

const documentationFor = (source: string, declaration: RegExp): string => {
  const match = declaration.exec(source);
  if (!match) throw new Error(`未找到声明：${declaration.source}`);
  const before = source.slice(0, match.index).trimEnd();
  if (!before.endsWith('*/')) return '';
  const start = before.lastIndexOf('/**');
  return start === -1 ? '' : before.slice(start);
};

describe('RWS-010 发布声明 TSDoc 契约', () => {
  const declarations = emitDeclarations();
  const entry = findDeclaration(declarations, 'index.d.ts');
  const workspace = findDeclaration(declarations, 'RxDBPluginWorkspace.d.ts');

  it('入口导出与 augmentation 使用的公开类型都进入声明产物', () => {
    for (const exported of [
      'rxDBPluginWorkspace',
      'WorkspaceFlushError',
      'RxDBPluginWorkspaceOptions',
      'WorkspaceCacheEntry',
      'WorkspaceCacheId',
      'WorkspaceCorruptedEntry'
    ]) {
      expect(entry).toContain(exported);
    }
    expect(workspace).toContain("declare module '@aiao/rxdb'");
    expect(workspace).toContain('workspace: RxDBPluginWorkspace;');
  });

  it('生成后的公开声明都保留紧邻 TSDoc', () => {
    const declarations = [
      /export interface RxDBPluginWorkspaceOptions/,
      /autoSave\?: boolean/,
      /export declare class WorkspaceFlushError/,
      /readonly cacheIds:/,
      /constructor\(cacheIds:/,
      /export interface WorkspaceCacheEntry/,
      /cacheId: WorkspaceCacheId/,
      /namespace: string/,
      /entity: string/,
      /id: UUID/,
      /data: Record<string, unknown>/,
      /export declare class RxDBPluginWorkspace/,
      /readonly name:/,
      /readonly changes\$/,
      /get ready\(\):/,
      /get cacheCount\(\):/,
      /get corruptedEntries\(\):/,
      /constructor\(rxdb:/,
      /flush\(\):/,
      /install\(\):/,
      /list\(\): WorkspaceCacheEntry\[\]/,
      /discard\(cacheId:/,
      /destroy\(\):/,
      /export declare const rxDBPluginWorkspace:/,
      /workspace: RxDBPluginWorkspace/
    ];

    expect(declarations.filter(declaration => documentationFor(workspace, declaration) === '')).toEqual([]);
  });

  it('快照、异常与终态语义存在于生成声明', () => {
    expect(documentationFor(workspace, /list\(\): WorkspaceCacheEntry\[\]/)).toContain('深快照');
    expect(documentationFor(workspace, /list\(\): WorkspaceCacheEntry\[\]/)).toContain('@throws');
    expect(documentationFor(workspace, /flush\(\):/)).toContain('@throws');
    expect(documentationFor(workspace, /constructor\(rxdb:/)).toContain('@throws');
    expect(documentationFor(workspace, /discard\(cacheId:/)).toContain('不是落盘屏障');
    expect(documentationFor(workspace, /destroy\(\):/)).toContain('终态');
  });
});
