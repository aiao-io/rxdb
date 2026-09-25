import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SourceFile } from '../core/ts-morph-browser.js';
import { runTypeScriptCompiler } from './typescript-compiler.js';

const RXDB_PACKAGE = '@aiao/rxdb';

/**
 * 一个插件桩包的描述。
 *
 * @remarks
 * 生成器包不认识任何插件，插件自己的基类长什么样只有插件包知道，
 * 所以由调用方把桩声明递进来。
 */
export interface GeneratedConsumerPluginStub {
  /** 桩包的模块名，如 `@aiao/rxdb-plugin-tree`。 */
  readonly moduleSpecifier: string;
  /** 具名导出 → 声明文本；没列到的名字按通用泛型接口兜底。 */
  readonly declarations?: Readonly<Record<string, string>>;
  /** 要从核心桩包转出的符号（插件基类通常 `extends EntityBase`）。 */
  readonly reexportsFromCore?: readonly string[];
}

/** {@link compileGeneratedConsumer} 的可选项。 */
export interface CompileGeneratedConsumerOptions {
  /** 生成物引用到的插件包，逐个渲染成桩包。 */
  readonly pluginStubs?: readonly GeneratedConsumerPluginStub[];
}

/** 生成物按模块分桶导入（插件符号在各自的包里），桩包也得按模块分别渲染。 */
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

const renderRxDBDeclaration = (name: string): string => {
  switch (name) {
    case 'ENTITY_STATIC_TYPES':
      return 'export declare const ENTITY_STATIC_TYPES: unique symbol;';
    case 'EntityBase':
      return renderEntityBaseDeclaration();
    case 'EntityType':
      return 'export type EntityType = abstract new (...args: never[]) => object;';
    case 'IEntity':
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

const renderRxDBStub = (sourceFiles: readonly SourceFile[], coreReexports: ReadonlySet<string>): string => {
  const imports = collectImports(sourceFiles, RXDB_PACKAGE);
  // 插件基类 `extends EntityBase`：插件桩包要 import 得到它，核心桩包就必须导出它。
  const missing = [...coreReexports].filter(name => !imports.includes(name)).sort();
  const declarations = [...missing, ...imports].map(renderRxDBDeclaration);
  return ["import type { Observable } from 'rxjs';", 'export interface RxDB {}', ...declarations].join('\n');
};

const renderPluginStub = (sourceFiles: readonly SourceFile[], stub: GeneratedConsumerPluginStub): string => {
  const imports = collectImports(sourceFiles, stub.moduleSpecifier);
  const reexports = stub.reexportsFromCore ?? [];
  return [
    "import type { Observable } from 'rxjs';",
    ...(reexports.length > 0 ?
      [`import type { ${reexports.join(', ')} } from '${RXDB_PACKAGE}';`, `export type { ${reexports.join(', ')} };`]
    : []),
    ...imports.map(name => stub.declarations?.[name] ?? renderRxDBDeclaration(name))
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

/**
 * 把生成物连同桩包写进临时工程，用真实 `tsc` 编译使用方代码。
 *
 * @param sourceFiles - 生成器产出的源文件，只有 `.d.ts` 会被写出
 * @param consumerSource - 使用方代码，按 `./generated/index.js` 引用生成物
 * @param options - 生成物引用到的插件包桩声明
 * @returns 诊断行；空数组即编译通过
 */
export const compileGeneratedConsumer = async (
  sourceFiles: readonly SourceFile[],
  consumerSource: string,
  options: CompileGeneratedConsumerOptions = {}
): Promise<string[]> => {
  const pluginStubs = options.pluginStubs ?? [];
  const coreReexports = new Set(pluginStubs.flatMap(stub => stub.reexportsFromCore ?? []));
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
      writePackage(root, RXDB_PACKAGE, renderRxDBStub(sourceFiles, coreReexports)),
      ...pluginStubs.map(stub => writePackage(root, stub.moduleSpecifier, renderPluginStub(sourceFiles, stub))),
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
