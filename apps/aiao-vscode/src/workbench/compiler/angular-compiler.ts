import ts from 'typescript';

function diagnosticMessage(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (!diagnostic.file || diagnostic.start === undefined) return message;
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} ${message}`;
}

interface TemplateUrlReference {
  start: number;
  end: number;
  url: string;
}

/** 收集类装饰器配置里的 templateUrl 字符串位置；只接受字符串字面量。 */
function templateUrlReferences(source: string, filename: string): TemplateUrlReference[] {
  const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const references: TemplateUrlReference[] = [];
  const collect = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node)) {
      for (const decorator of ts.getDecorators(node) ?? []) {
        const expression = decorator.expression;
        if (!ts.isCallExpression(expression) || expression.arguments.length !== 1) continue;
        const config = expression.arguments[0];
        if (!ts.isObjectLiteralExpression(config)) continue;
        for (const property of config.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const name = property.name;
          if ((!ts.isIdentifier(name) && !ts.isStringLiteral(name)) || name.text !== 'templateUrl') continue;
          if (!ts.isStringLiteral(property.initializer)) throw new Error(`${filename}: templateUrl 只支持字符串字面量`);
          references.push({ start: property.getStart(), end: property.end, url: property.initializer.text });
        }
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(sourceFile);
  return references;
}

/**
 * 将受控 Angular TS 模块转换为保留 ESM 导入的 JS，模板编译由预览内 JIT 负责。
 * templateUrl 在转译前经 resolveTemplate 解析 HTML 并内联为 template：沙箱预览没有
 * 网络能力，缺文件快照解析器的 templateUrl 模块会在编译期明确拒绝。
 */
export async function compileAngular(
  source: string,
  filename: string,
  resolveTemplate?: (url: string) => string
): Promise<string> {
  const references = templateUrlReferences(source, filename);
  if (references.length > 0) {
    if (!resolveTemplate) throw new Error(`${filename}: templateUrl 需要项目文件快照解析器`);
    references.sort((left, right) => left.start - right.start);
    let inlined = '';
    let offset = 0;
    for (const reference of references) {
      inlined += source.slice(offset, reference.start);
      inlined += `template: ${JSON.stringify(resolveTemplate(reference.url))}`;
      offset = reference.end;
    }
    source = inlined + source.slice(offset);
  }
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
