import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** README 里第一个包含 `marker` 的 ts 代码块。 */
function readmeBlock(marker: string): string {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const block = [...readme.matchAll(/^```ts\n([\s\S]*?)^```$/gm)].map(match => match[1]).find(code => code.includes(marker));
  if (block === undefined) throw new Error(`README 里没有包含 ${marker} 的 ts 代码块`);
  return block;
}

/**
 * 按包自己的 tsconfig.lib.json 编译一段虚拟源码，返回它的语法与语义诊断。
 *
 * @remarks 虚拟文件放在 `src/` 下，`@aiao/*` 经工作区 paths 解析到源码（不依赖 dist）；不发射产物，
 * 所以去掉 `outDir` / `declarationDir` / `rootDir`（有 outDir 时 TS 6 默认 rootDir 为配置目录，核心源码不在其下会报错）；
 * 只关掉「未使用的局部变量」——示例常把结果赋给变量展示返回值。
 */
function diagnose(source: string): string[] {
  const fileName = join(root, 'src', '__readme-example__.ts');
  const parsed = ts.getParsedCommandLineOfConfigFile(join(root, 'tsconfig.lib.json'), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: diagnostic => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    }
  });
  if (!parsed) throw new Error('无法读取 tsconfig.lib.json');
  const options: ts.CompilerOptions = {
    ...parsed.options,
    noEmit: true,
    composite: false,
    incremental: false,
    declaration: false,
    emitDeclarationOnly: false,
    noUnusedLocals: false
  };
  delete options.outDir;
  delete options.declarationDir;
  delete options.rootDir;
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.getSourceFile = (name, language, ...rest) =>
    name === fileName ? ts.createSourceFile(name, source, language) : getSourceFile(name, language, ...rest);
  host.fileExists = name => name === fileName || fileExists(name);
  const program = ts.createProgram([fileName], options, host);
  const file = program.getSourceFile(fileName);
  return [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)].map(diagnostic =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  );
}

/**
 * README 示例与公开签名的一致性守卫。
 *
 * @remarks 查询构建器示例曾按旧签名写成 `addRule({ ... })`、`{ schema: { fields } }`：编译报类型错误，
 * 绕过类型检查时把规则对象当成分组 ID 查找并抛错（RV-01a1bb7e8c10776dab0c7a6441c44208）。
 * 示例里的 `metadata` 与 `MyEntity` 是读者上下文里的值，由守卫声明。
 */
describe('README 示例按当前公开签名编译', () => {
  it('查询构建器示例通过类型检查', () => {
    const source = [
      "import type { EntityMetadata } from '@aiao/rxdb';",
      'interface MyEntity { title: string }',
      'declare const metadata: EntityMetadata;',
      readmeBlock('createQueryBuilderService'),
      'export {};'
    ].join('\n');
    expect(diagnose(source)).toEqual([]);
  }, 60_000);
});
