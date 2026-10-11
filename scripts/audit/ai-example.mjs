import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { auditEntryDocs } from './ai-entry-docs.mjs';

const root = process.cwd();
mkdirSync(join(root, 'tmp'), { recursive: true });
const temporary = mkdtempSync(join(root, 'tmp/us602-example-'));
const diagnostics = values =>
  ts.formatDiagnosticsWithColorAndContext(values, {
    getCanonicalFileName: file => file,
    getCurrentDirectory: () => root,
    getNewLine: () => '\n'
  });

function compile(directory, declaration) {
  const sample = readFileSync(join(root, 'scripts/examples/ai-local/main.ts'), 'utf8');
  writeFileSync(join(directory, 'package.json'), '{"type":"module","private":true}\n');
  writeFileSync(join(directory, 'main.ts'), sample);
  const file = ts.createSourceFile('index.d.ts', declaration, ts.ScriptTarget.Latest, true);
  const base = file.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'RxDBAdapterLocalBase');
  const blocks = base.members
    .filter(node => node.name?.getText(file) === 'transaction')
    .flatMap(node => (node.jsDoc ?? []).flatMap(doc => [...doc.getText(file).matchAll(/```ts\n([\s\S]*?)```/g)]))
    .map(match =>
      match[1]
        .split('\n')
        .map(line => line.replace(/^\s*\* ?/, ''))
        .join('\n')
        .trim()
    );
  if (blocks.length !== 4) throw new Error('transaction 两个重载必须各有正例和反例代码块');
  const source = [
    'import type { RxDBAdapterLocalBase } from "@aiao/rxdb";',
    'import { Note } from "./main.js";',
    ...blocks.map(
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
  const errors = auditEntryDocs(declarations, `${archive}:dist/index.d.ts`);
  const declaration = Object.values(declarations).join('\n');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('✅ 实际核心 tgz：入口说明与两个事务重载验证通过');
  compile(temporary, declaration);
  execFileSync(process.execPath, [resolve(temporary, 'dist/main.js')], { cwd: root, stdio: 'inherit', timeout: 30000 });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
