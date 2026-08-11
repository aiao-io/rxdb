import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const appDir = resolve(import.meta.dirname, '..');

/**
 * 找出 `source` 中所有缺少 TSDoc 的导出声明。
 *
 * 用 TS 自己的 AST 而不是正则：`@Component({...})` 这类多行装饰器夹在
 * 文档注释与 `export class` 之间，任何「往上看一行」的文本启发式都会误判。
 */
function findUndocumentedExports(fileName: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const undocumented: string[] = [];

  for (const statement of sourceFile.statements) {
    if (!isExported(statement)) continue;
    // 纯再导出（`export type { A } from './x'`）的文档挂在原始声明上。
    if (ts.isExportDeclaration(statement)) continue;
    if (ts.getJSDocCommentsAndTags(statement).length > 0) continue;

    const line = sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1;
    undocumented.push(`${fileName}:${line}`);
  }

  return undocumented;
}

function isExported(statement: ts.Statement): boolean {
  if (ts.isExportAssignment(statement)) return true;
  if (!ts.canHaveModifiers(statement)) return false;
  return (ts.getModifiers(statement) ?? []).some(m => m.kind === ts.SyntaxKind.ExportKeyword);
}

function collectSourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectSourceFiles(full));
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.d.ts')) continue;
    found.push(full);
  }
  return found;
}

describe('ELEC-12 TSDoc 门禁', () => {
  // 先证明探测器本身有效 —— 否则「全绿」可能只是它什么都没看出来。
  describe('findUndocumentedExports', () => {
    it('抓得到没写文档的导出', () => {
      expect(findUndocumentedExports('t.ts', 'export const a = 1;\n')).toEqual(['t.ts:1']);
    });

    it('放过写了文档的导出', () => {
      expect(findUndocumentedExports('t.ts', '/** doc */\nexport const a = 1;\n')).toEqual([]);
    });

    // 这是正则方案会漏判的形态：文档注释与 `export` 之间隔着多行装饰器。
    it('装饰器隔在中间时仍认得出文档', () => {
      const source = ['/** doc */', '@Injectable({', "  providedIn: 'root'", '})', 'export class A {}', ''].join('\n');
      expect(findUndocumentedExports('t.ts', source)).toEqual([]);
    });

    it('装饰器隔在中间且没有文档时照样报出来', () => {
      const source = ['@Injectable({', "  providedIn: 'root'", '})', 'export class A {}', ''].join('\n');
      // 装饰器属于声明节点本身，所以报的是装饰器起始行而不是 `export` 行。
      expect(findUndocumentedExports('t.ts', source)).toEqual(['t.ts:1']);
    });

    // 这条钉住的是一个很容易踩的坑：TSDoc 必须在装饰器**之上**。
    // 夹在装饰器与 `export class` 之间的注释不会挂到声明上，
    // 编辑器悬浮、API 文档工具、以及本门禁都看不见它。
    it('文档夹在装饰器与 export 之间时不算数', () => {
      const source = ['@Injectable()', '/** doc */', 'export class A {}', ''].join('\n');
      expect(findUndocumentedExports('t.ts', source)).toEqual(['t.ts:1']);
    });

    it('不把非导出声明算进来', () => {
      expect(findUndocumentedExports('t.ts', 'const a = 1;\n')).toEqual([]);
    });
  });

  it('src/ 与 src-electron/ 的每个导出都有 TSDoc', () => {
    const files = [
      ...collectSourceFiles(resolve(appDir, 'src')),
      ...collectSourceFiles(resolve(appDir, 'src-electron'))
    ];

    // 探测器扫不到文件就等于没门禁，这里把它钉住。
    expect(files.length).toBeGreaterThan(10);

    const undocumented = files.flatMap(file =>
      findUndocumentedExports(relative(appDir, file), readFileSync(file, 'utf8'))
    );

    expect(undocumented).toEqual([]);
  });
});
