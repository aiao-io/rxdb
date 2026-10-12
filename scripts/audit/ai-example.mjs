/**
 * 离线 AI 样例与实际打包声明的验证（US-602 AC#12、AC#15）。
 *
 * @remarks
 * 1. 真实 `pnpm pack` 核心包，按文件读 tgz 里的 `.d.ts`，跑 {@link auditEntryDocs}；
 * 2. 读各适配器包的非测试源码，跑 {@link auditTransactionOverrides}；
 * 3. 把 `RxDBAdapterLocalBase.transaction` 的 `@example` 正反例与 `scripts/examples/ai-local/main.ts`
 *    一起按样例 tsconfig 严格编译，再用 Node 执行样例：use → adapter → connect → CRUD → 事务执行器 → disconnect。
 *
 * 在 CI 的 extras job 跑（`dependsOn` 核心、PGlite、history 的构建），不进 setup 的免构建门禁。
 *
 * @example
 * ```bash
 * pnpm verify:ai-example
 * ```
 */

import { execFileSync } from 'node:child_process';
import { globSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { auditEntryDocs, auditTransactionOverrides } from './ai-entry-docs.mjs';

const root = process.cwd();
mkdirSync(join(root, 'tmp'), { recursive: true });
const temporary = mkdtempSync(join(root, 'tmp/us602-example-'));
const diagnostics = values =>
  ts.formatDiagnosticsWithColorAndContext(values, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n'
  });

function transactionExamples(declaration) {
  const file = ts.createSourceFile('index.d.ts', declaration, ts.ScriptTarget.Latest, true);
  const base = file.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'RxDBAdapterLocalBase');
  const overload = base.members.find(node => node.name?.getText(file) === 'transaction');
  const blocks = ts
    .getJSDocTags(overload)
    .filter(tag => tag.tagName.text === 'example')
    .flatMap(tag => [
      ...(ts.getTextOfJSDocComment(tag.comment) ?? '').matchAll(/```(?:ts|typescript)\n([\s\S]*?)\n```/g)
    ])
    .map(match => match[1]);
  if (blocks.length !== 2)
    throw new Error(
      `RxDBAdapterLocalBase.transaction 的 @example 必须是一个正例、一个反例（实际 ${blocks.length} 个 ts 代码块）`
    );
  return blocks;
}

function compile(directory, declaration) {
  const sample = readFileSync(join(root, 'scripts/examples/ai-local/main.ts'), 'utf8');
  writeFileSync(join(directory, 'package.json'), '{"type":"module","private":true}\n');
  writeFileSync(join(directory, 'main.ts'), sample);
  const source = [
    'import type { RxDBAdapterLocalBase } from "@aiao/rxdb";',
    'import { Note } from "./main.js";',
    ...transactionExamples(declaration).map(
      (block, index) =>
        `export async function example${index}(adapter: RxDBAdapterLocalBase, entity: Note) {\n${block}\n}`
    )
  ].join('\n');
  writeFileSync(join(directory, 'entry-examples.ts'), source);
  const config = JSON.parse(readFileSync(join(root, 'scripts/examples/ai-local/tsconfig.json'), 'utf8'));
  const options = ts.convertCompilerOptionsFromJson(config.compilerOptions, directory);
  if (options.errors.length) throw new Error(diagnostics(options.errors));
  const program = ts.createProgram([join(directory, 'main.ts'), join(directory, 'entry-examples.ts')], {
    ...options.options,
    outDir: join(directory, 'dist')
  });
  const errors = ts.getPreEmitDiagnostics(program);
  if (errors.length) throw new Error(diagnostics(errors));
  const emitted = program.emit();
  if (emitted.emitSkipped || emitted.diagnostics.length) throw new Error(diagnostics(emitted.diagnostics));
}

try {
  execFileSync('pnpm', ['pack', '--pack-destination', temporary], { cwd: join(root, 'packages/rxdb'), stdio: 'pipe' });
  const archive = readdirSync(temporary).find(name => name.endsWith('.tgz'));
  if (!archive) throw new Error('核心 pnpm pack 未生成 tgz');
  execFileSync('tar', ['-xzf', join(temporary, archive), '-C', temporary], { stdio: 'pipe' });
  const declarationsRoot = join(temporary, 'package/dist');
  const declarations = Object.fromEntries(
    readdirSync(declarationsRoot, { recursive: true })
      .filter(name => name.endsWith('.d.ts'))
      .sort()
      .map(name => [`${archive}:dist/${name}`, readFileSync(join(declarationsRoot, name), 'utf8')])
  );
  const adapterSources = Object.fromEntries(
    globSync('packages/rxdb-adapter-*/src/**/*.ts', { cwd: root })
      .filter(file => !/(?:^|\/)__tests__(?:\/|$)|\.(spec|test)\.ts$/.test(file))
      .sort()
      .map(file => [file, readFileSync(join(root, file), 'utf8')])
  );
  const errors = [
    ...auditEntryDocs(declarations, `${archive}:dist/index.d.ts`),
    ...auditTransactionOverrides(adapterSources)
  ];
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('✅ 实际核心 tgz 的入口说明、两个事务重载与适配器覆写验证通过');
  compile(temporary, Object.values(declarations).join('\n'));
  execFileSync(process.execPath, [resolve(temporary, 'dist/main.js')], { cwd: root, stdio: 'inherit', timeout: 30000 });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
