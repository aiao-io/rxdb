import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const websiteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(websiteRoot, '..');
const ts = createRequire(join(repoRoot, 'package.json'))('typescript');

// 图查询示例最容易写反返回类型：无 `$` 的静态方法返回 Promise，带 `$` 的才是 Observable
const GRAPH_DOCS = [
  'docs/model-query/findNeighbors.md',
  'docs/model-query/countNeighbors.md',
  'docs/model-query/findPaths.md',
  'docs/plugins/rxdb-plugin-graph/graph-entity.md'
];
const CODE_BLOCK = /^```(?:ts|typescript)[^\n]*\n([\s\S]*?)^```$/gm;

// 文档约定：`Person` 是图实体，`alice` / `bob` 是它的实例；示例前后承接，后面的块不重复 import
const PRELUDE = [
  "import { GraphEntityBase } from '@aiao/rxdb-plugin-graph';",
  'declare class Person extends GraphEntityBase { name: string }',
  'declare const alice: Person;',
  'declare const bob: Person;'
];

const toModule = code => {
  const lines = code.split('\n');
  const imports = lines.filter(line => line.startsWith('import '));
  const needsRxjs = code.includes('firstValueFrom') && !imports.some(line => line.includes('firstValueFrom'));
  return [
    ...imports,
    ...(needsRxjs ? ["import { firstValueFrom } from 'rxjs';"] : []),
    ...PRELUDE,
    'export async function example(): Promise<void> {',
    ...lines.filter(line => !line.startsWith('import ')),
    '}'
  ].join('\n');
};

const collectExamples = () =>
  GRAPH_DOCS.flatMap(doc =>
    [...readFileSync(join(websiteRoot, doc), 'utf8').matchAll(CODE_BLOCK)]
      .map((match, index) => ({ doc, index, code: match[1] }))
      .filter(({ code }) => /\bPerson\.\w+\$?\(/.test(code))
  );

const compilerOptions = () => {
  const base = JSON.parse(readFileSync(join(repoRoot, 'tsconfig.base.json'), 'utf8')).compilerOptions;
  const json = {
    ...base,
    baseUrl: '.',
    composite: false,
    declaration: false,
    declarationMap: false,
    emitDeclarationOnly: false,
    ignoreDeprecations: '6.0',
    noEmit: true,
    noUnusedLocals: false,
    types: []
  };
  return ts.convertCompilerOptionsFromJson(json, repoRoot).options;
};

test('图查询文档的 ts 示例按真实类型编译通过', () => {
  const examples = collectExamples();
  assert.ok(examples.length >= 6, `只找到 ${examples.length} 个图查询示例，代码块匹配可能失效`);

  const files = new Map(
    examples.map(example => [
      join(repoRoot, 'website', '.doc-examples', `${example.doc.replace(/\W/g, '_')}_${example.index}.ts`),
      example
    ])
  );
  const options = compilerOptions();
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.readFile = fileName => (files.has(fileName) ? toModule(files.get(fileName).code) : readFile(fileName));
  host.fileExists = fileName => files.has(fileName) || fileExists(fileName);

  const program = ts.createProgram([...files.keys()], options, host);
  const problems = ts
    .getPreEmitDiagnostics(program)
    .filter(diagnostic => diagnostic.file && files.has(diagnostic.file.fileName))
    .map(diagnostic => {
      const { doc, index } = files.get(diagnostic.file.fileName);
      return `${doc} 第 ${index + 1} 个 ts 代码块：${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`;
    });

  assert.deepEqual(problems, []);
});
