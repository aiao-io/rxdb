import ts from 'typescript';

function diagnosticMessage(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (!diagnostic.file || diagnostic.start === undefined) return message;
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} ${message}`;
}

/** 将受控 Angular TS 模块转换为保留 ESM 导入的 JS，模板编译由预览内 JIT 负责。 */
export async function compileAngular(source: string, filename: string): Promise<string> {
  const result = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      experimentalDecorators: true,
      useDefineForClassFields: true,
      importHelpers: false,
      emitDecoratorMetadata: false,
      sourceMap: false
    }
  });
  const errors = result.diagnostics?.filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error) ?? [];
  if (errors.length > 0) throw new Error(errors.map(diagnosticMessage).join('\n'));
  return result.outputText;
}
