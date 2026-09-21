import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SourceFile } from '../../core/ts-morph-browser.js';
import { runTypeScriptCompiler } from './typescript-compiler.js';

const RXDB_PACKAGE = '@aiao/rxdb';
const TREE_PLUGIN_PACKAGE = '@aiao/rxdb-plugin-tree';

/** 生成物按模块分桶导入（树符号在 `@aiao/rxdb-plugin-tree`），桩包也得按模块分别渲染。 */
const collectImports = (sourceFiles: readonly SourceFile[], moduleSpecifier: string): string[] => {
  const pattern = new RegExp(`import(?:\\s+type)? \\{ ([^}]+) \\} from '${moduleSpecifier.replace('/', '\\/')}';`, 'g');
  const imports = new Set<string>();

  sourceFiles.forEach(sourceFile => {
    for (const match of sourceFile.getText().matchAll(pattern)) {
      match[1]?.split(',').forEach(name => imports.add(name.trim()));
    }
  });

  return Array.from(imports).filter(Boolean).sort();
};

const renderGenericType = (name: string): string =>
  `export interface ${name}<T0 = unknown, T1 = unknown, T2 = unknown, T3 = unknown> {}`;

const renderEntityBaseDeclaration =
  (): string => `export declare abstract class EntityBase<Id extends string | number | bigint = string> {
  id: Id;
  static get: <T extends EntityBase<string | number | bigint>>(this: new () => T, id: T['id']) => Observable<T>;
  static findOne: <T extends EntityBase<string | number | bigint>>(this: new () => T, options: FindOneOptions<new () => T>) => Observable<T | null>;
  static findOneOrFail: <T extends EntityBase<string | number | bigint>>(this: new () => T, options: FindOneOrFailOptions<new () => T>) => Observable<T>;
  static find: <T extends EntityBase<string | number | bigint>>(this: new () => T, options: FindOptions<new () => T>) => Observable<T[]>;
  static findAll: <T extends EntityBase<string | number | bigint>>(this: new () => T, options: FindAllOptions<new () => T>) => Observable<T[]>;
  static findByCursor: <T extends EntityBase<string | number | bigint>>(this: new () => T, options: FindByCursorOptions<new () => T>) => Observable<T[]>;
  static count: <T extends EntityBase<string | number | bigint>>(this: new () => T, options: CountOptions<new () => T>) => Observable<number>;
  remove: () => Promise<this>;
  reset: () => void;
  save: () => Promise<this>;
}`;

const renderTreeEntityBaseDeclaration = (
  name: string
): string => `export declare abstract class ${name} extends EntityBase {
  static findDescendants: <T extends ${name}>(this: new () => T, options: FindTreeOptions<new () => T>) => Observable<T[]>;
  static countDescendants: <T extends ${name}>(this: new () => T, options: FindTreeOptions<new () => T>) => Observable<number>;
  static findAncestors: <T extends ${name}>(this: new () => T, options: FindTreeOptions<new () => T>) => Observable<T[]>;
  static countAncestors: <T extends ${name}>(this: new () => T, options: FindTreeOptions<new () => T>) => Observable<number>;
}`;

const renderRxDBDeclaration = (name: string): string => {
  switch (name) {
    case 'ENTITY_STATIC_TYPES':
      return 'export declare const ENTITY_STATIC_TYPES: unique symbol;';
    case 'EntityBase':
      return renderEntityBaseDeclaration();
    case 'TreeAdjacencyListEntityBase':
    case 'TreeEntityBase':
      return renderTreeEntityBaseDeclaration(name);
    case 'EntityType':
      return 'export type EntityType = abstract new (...args: never[]) => object;';
    case 'IEntity':
    case 'ITreeEntity':
      return `export interface ${name} {}`;
    case 'RelationEntitiesObservable':
    case 'RelationEntityObservable':
      return `export interface ${name}<T extends EntityType> { readonly entityType?: T; }`;
    case 'UUID':
      return 'export type UUID = string;';
    default:
      return renderGenericType(name);
  }
};

const hasTreeBase = (imports: readonly string[]): boolean =>
  imports.some(name => name === 'TreeAdjacencyListEntityBase' || name === 'TreeEntityBase');

const renderRxDBStub = (sourceFiles: readonly SourceFile[]): string => {
  const imports = collectImports(sourceFiles, RXDB_PACKAGE);
  // 树基类继承 `EntityBase`：插件桩包要 import 得到它，核心桩包就必须导出它。
  const needsEntityBase = hasTreeBase(imports) || hasTreeBase(collectImports(sourceFiles, TREE_PLUGIN_PACKAGE));
  const declarations = (needsEntityBase && !imports.includes('EntityBase') ? ['EntityBase', ...imports] : imports).map(
    renderRxDBDeclaration
  );
  return ["import type { Observable } from 'rxjs';", 'export interface RxDB {}', ...declarations].join('\n');
};

const renderTreePluginStub = (sourceFiles: readonly SourceFile[]): string => {
  const imports = collectImports(sourceFiles, TREE_PLUGIN_PACKAGE);
  return [
    "import type { Observable } from 'rxjs';",
    `import type { EntityBase } from '${RXDB_PACKAGE}';`,
    'export type { EntityBase };',
    ...imports.map(renderRxDBDeclaration)
  ].join('\n');
};

const writePackage = async (root: string, packageName: string, declaration: string): Promise<void> => {
  const packageDir = path.join(root, 'node_modules', ...packageName.split('/'));
  await mkdir(packageDir, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(packageDir, 'package.json'),
      JSON.stringify({ name: packageName, type: 'module', exports: { '.': './index.d.ts' } }, null, 2)
    ),
    writeFile(path.join(packageDir, 'index.d.ts'), declaration)
  ]);
};

export const compileGeneratedConsumer = async (
  sourceFiles: readonly SourceFile[],
  consumerSource: string
): Promise<string[]> => {
  const root = await mkdtemp(path.join(tmpdir(), 'rxdb-generated-consumer-'));
  const generatedDir = path.join(root, 'generated');
  const consumerPath = path.join(root, 'consumer.ts');
  const configPath = path.join(root, 'tsconfig.json');

  try {
    await mkdir(generatedDir, { recursive: true });
    await Promise.all(
      sourceFiles
        .filter(sourceFile => sourceFile.getFilePath().endsWith('.d.ts'))
        .map(async sourceFile => {
          const targetPath = path.join(generatedDir, sourceFile.getFilePath());
          await mkdir(path.dirname(targetPath), { recursive: true });
          await writeFile(targetPath, sourceFile.getText());
        })
    );
    await Promise.all([
      writePackage(root, RXDB_PACKAGE, renderRxDBStub(sourceFiles)),
      writePackage(root, TREE_PLUGIN_PACKAGE, renderTreePluginStub(sourceFiles)),
      writePackage(root, 'rxjs', 'export interface Observable<T> { readonly value?: T; }'),
      writeFile(path.join(root, 'package.json'), JSON.stringify({ private: true, type: 'module' })),
      writeFile(consumerPath, consumerSource),
      writeFile(
        configPath,
        JSON.stringify(
          {
            compilerOptions: {
              module: 'NodeNext',
              moduleResolution: 'NodeNext',
              noEmit: true,
              skipLibCheck: false,
              strict: true,
              target: 'ES2022',
              types: []
            },
            files: ['./consumer.ts']
          },
          null,
          2
        )
      )
    ]);

    return await runTypeScriptCompiler(configPath);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};
