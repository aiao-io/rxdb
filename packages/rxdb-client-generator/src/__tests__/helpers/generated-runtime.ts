import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTypeScriptCompiler } from './typescript-compiler.js';

/**
 * 临时工程必须落在本包内部：`@aiao/rxdb` 靠 `node_modules` 逐级上溯解析，
 * 只有在包内才能命中工作区软链并拿到**真实**的 `dist/index.d.ts`。
 * `compileGeneratedConsumer` 那套桩件是通用占位类型，验不了运行时元数据的可赋值性。
 */
const PACKAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** 与 `tsconfig.base.json` 对齐的公共编译选项；不继承 base，避免 `customConditions` 把依赖解析回源码。 */
const BASE_COMPILER_OPTIONS = {
  esModuleInterop: true,
  experimentalDecorators: true,
  forceConsistentCasingInFileNames: true,
  isolatedModules: true,
  lib: ['es2025', 'dom', 'WebWorker'],
  noEmit: true,
  noFallthroughCasesInSwitch: true,
  noImplicitOverride: true,
  noImplicitReturns: true,
  noUnusedLocals: true,
  skipLibCheck: true,
  strict: true,
  target: 'ES2022',
  types: []
} as const;

/**
 * 三端 `tsconfig.lib.json` 里真正会左右生成产物类型表现的差异项。
 *
 * @remarks
 * Angular 沿用 base 的 `nodenext`；React / Vue 走 `esnext` + `bundler`，且各带一套 JSX 配置。
 * 同一份产物在三套选项下诊断必须一致——这才是「三框架类型表现一致」的可证形式。
 */
export const FRAMEWORK_COMPILER_PROFILES = {
  angular: { module: 'NodeNext', moduleResolution: 'NodeNext' },
  react: { jsx: 'react-jsx', module: 'ESNext', moduleResolution: 'Bundler' },
  vue: { jsx: 'preserve', jsxImportSource: 'vue', module: 'ESNext', moduleResolution: 'Bundler' }
} as const;

/** 可编译的框架档位。 */
export type FrameworkCompilerProfile = keyof typeof FRAMEWORK_COMPILER_PROFILES;

/** 待编译的生成产物：`path` 是相对于产物根的 `.js` 路径。 */
export interface GeneratedRuntimeSource {
  readonly path: string;
  readonly text: string;
}

/**
 * 把生成的运行时产物按 `.ts` 重新落盘，用指定框架档位的编译选项跑真实 `tsc`。
 *
 * @remarks
 * 生成的 `.js` 本身就是合法 TypeScript，改后缀即可让编译器按 `@aiao/rxdb` 的真实声明
 * 检查 `Entity({...})` 里的元数据字面量——`format` 判别对象塌缩成字符串会在这里编译失败。
 * 相对导入保留 `.js` 后缀，`nodenext` 与 `bundler` 都能解析到同名 `.ts`。
 *
 * @param sources 生成产物中的运行时文件
 * @param profile 框架编译档位
 * @returns 诊断行；空数组即编译通过
 */
export const compileGeneratedRuntime = async (
  sources: readonly GeneratedRuntimeSource[],
  profile: FrameworkCompilerProfile
): Promise<string[]> => {
  const root = await mkdtemp(path.join(PACKAGE_ROOT, '.tmp-generated-runtime-'));
  const configPath = path.join(root, 'tsconfig.json');

  try {
    const files = await Promise.all(
      sources.map(async source => {
        const relativePath = source.path.replace(/\.js$/, '.ts');
        const targetPath = path.join(root, relativePath);
        await mkdir(path.dirname(targetPath), { recursive: true });
        await writeFile(targetPath, source.text);
        return `./${relativePath}`;
      })
    );
    await writeFile(
      configPath,
      JSON.stringify(
        { compilerOptions: { ...BASE_COMPILER_OPTIONS, ...FRAMEWORK_COMPILER_PROFILES[profile] }, files },
        null,
        2
      )
    );

    return await runTypeScriptCompiler(configPath);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};
