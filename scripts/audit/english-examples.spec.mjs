import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '../..');
const guides = 'website/i18n/en/docusaurus-plugin-content-docs/current';
const frameworks = ['angular', 'react', 'vue'];

function examples(path) {
  const markdown = readFileSync(join(root, path), 'utf8');
  const blocks = [...markdown.matchAll(/^```(ts|typescript|tsx|vue)\n([\s\S]*?)^```$/gm)];
  assert.ok(blocks.length, `Missing TypeScript examples in ${path}`);
  return blocks.map(([, language, body]) =>
    language === 'vue' ? /<script\b[^>]*>([\s\S]*?)<\/script\s*>/i.exec(body)[1] : body
  );
}

test('英文入门文档和核心与首批适配器包 README 的示例符合工作区类型签名', t => {
  const temporaryRoot = join(root, 'tmp');
  mkdirSync(temporaryRoot, { recursive: true });
  const directory = mkdtempSync(join(temporaryRoot, 'english-examples-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const write = (name, text) => {
    const path = join(directory, name);
    writeFileSync(path, text);
    return path;
  };
  const fixture = write(
    'context.d.ts',
    `
    declare const database: import('@aiao/rxdb').RxDB;
    declare const rxdb: typeof database;
    declare const runtime: import('@aiao/rxdb-i18n').I18n;
    declare const metadata: import('@aiao/rxdb').EntityMetadata;
    declare const catalogs: import('@aiao/rxdb-i18n').MessageCatalog[];
    declare const Todo: typeof import('./getting-started').Todo;
    type Todo = InstanceType<typeof Todo>;
    declare const defineProps: typeof import('vue').defineProps;
    declare class AppComponent {}
    declare function App(): import('react').ReactElement;
    declare function TodoList(): import('react').ReactElement;
  `
  );
  write('database.ts', "export declare const database: import('@aiao/rxdb').RxDB;");
  const complete = [
    ['README.md', 'root'],
    ['packages/rxdb/README.md', 'core'],
    [`${guides}/getting-started/README.md`, 'getting-started']
  ];
  const files = [fixture, ...complete.map(([path, name]) => write(`${name}.ts`, examples(path).join('\n')))];
  const partial = [
    ...[
      'model',
      'i18n',
      'admin',
      'adapter-wa-sqlite',
      'adapter-pglite',
      ...frameworks,
      ...frameworks.map(name => `i18n-${name}`)
    ].map(name => `packages/rxdb-${name}/README.md`),
    `${guides}/getting-started/install.md`,
    `${guides}/i18n/README.md`,
    `${guides}/plugins/authoring.md`,
    ...['model-definition', 'model-query', 'model-mutation'].map(section => `${guides}/${section}/README.md`),
    `${guides}/model-query/query-realtime.md`,
    ...frameworks.map(name => `${guides}/frameworks/${name}.md`)
  ];
  for (const path of partial) {
    examples(path).forEach((code, i) =>
      files.push(write(`${path.replaceAll('/', '-')}-${i}.tsx`, `${code}\nexport {};`))
    );
  }
  const base = ts.readConfigFile(join(root, 'tsconfig.base.json'), ts.sys.readFile).config.compilerOptions;
  const { options, errors } = ts.convertCompilerOptionsFromJson(
    {
      ...base,
      composite: false,
      noEmit: true,
      emitDeclarationOnly: false,
      module: 'esnext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      noUnusedLocals: false
    },
    root
  );
  assert.deepEqual(errors, []);
  const program = ts.createProgram(files, options);
  const diagnostics = files.flatMap(path => {
    const file = program.getSourceFile(path);
    return [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)];
  });
  assert.equal(
    ts.formatDiagnostics(diagnostics, {
      getCurrentDirectory: () => root,
      getNewLine: () => '\n',
      getCanonicalFileName: name => name
    }),
    ''
  );
});

test('英文安装指南复制适配器实际依赖的 WASM 文件', t => {
  const guide = readFileSync(join(root, guides, 'getting-started/install.md'), 'utf8');
  const snippet = /^```javascript\n([\s\S]*?)^```$/m.exec(guide);
  assert.ok(snippet, '安装页缺少可执行的 WASM 复制示例');

  const temporaryRoot = join(root, 'website/tmp');
  mkdirSync(temporaryRoot, { recursive: true });
  const app = mkdtempSync(join(temporaryRoot, 'english-install-'));
  t.after(() => rmSync(app, { recursive: true, force: true }));
  const script = join(app, 'copy-wa-sqlite.mjs');
  writeFileSync(script, snippet[1]);
  execFileSync(process.execPath, [script], { cwd: app });

  const fromAdapter = createRequire(join(root, 'packages/rxdb-adapter-wa-sqlite/package.json'));
  const expected = readFileSync(fromAdapter.resolve('wa-sqlite/dist/wa-sqlite-async.wasm'));
  assert.deepEqual(readFileSync(join(app, 'public/wa-sqlite/wa-sqlite-async.wasm')), expected);
});
