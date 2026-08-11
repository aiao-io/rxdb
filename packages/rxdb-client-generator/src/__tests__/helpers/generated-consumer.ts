import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SourceFile } from '../../core/ts-morph-browser.js';

const RXDB_IMPORT_PATTERN = /import \{ ([^}]+) \} from '@aiao\/rxdb';/g;
const TYPESCRIPT_COMPILER_PATH = fileURLToPath(
  new URL('../../../../../node_modules/typescript/bin/tsc', import.meta.url)
);

const collectRxDBImports = (sourceFiles: readonly SourceFile[]): string[] => {
  const imports = new Set<string>();

  sourceFiles.forEach(sourceFile => {
    for (const match of sourceFile.getText().matchAll(RXDB_IMPORT_PATTERN)) {
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

const renderRxDBStub = (sourceFiles: readonly SourceFile[]): string => {
  const imports = collectRxDBImports(sourceFiles);
  const hasTreeBase = imports.some(name => name === 'TreeAdjacencyListEntityBase' || name === 'TreeEntityBase');
  const declarations = (hasTreeBase && !imports.includes('EntityBase') ? ['EntityBase', ...imports] : imports).map(
    renderRxDBDeclaration
  );
  return ["import type { Observable } from 'rxjs';", 'export interface RxDB {}', ...declarations].join('\n');
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

const runTypeScriptCompiler = (configPath: string): Promise<string[]> =>
  new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [TYPESCRIPT_COMPILER_PATH, '--project', configPath, '--pretty', 'false'],
      { encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (!error) {
          resolve([]);
          return;
        }

        const diagnostics = `${stdout}\n${stderr}`
          .split('\n')
          .map(line => line.trim())
          .filter(Boolean);
        if (diagnostics.length > 0) {
          resolve(diagnostics);
          return;
        }

        reject(error);
      }
    );
  });

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
      writePackage(root, '@aiao/rxdb', renderRxDBStub(sourceFiles)),
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
