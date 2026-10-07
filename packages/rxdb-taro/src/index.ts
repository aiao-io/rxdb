/**
 * Taro 插件：一行接入 `@aiao/rxdb-adapter-miniprogram` 的构建前提（实验性，微信与抖音，vite 编译器）。
 *
 * @packageDocumentation
 */
import { miniProgramVitePlugins } from './vite.js';

/** 本插件支持的 Taro 平台名。 */
const TARO_PLUGIN_PLATFORMS = ['weapp', 'tt'] as const;

type TaroPluginPlatform = (typeof TARO_PLUGIN_PLATFORMS)[number];

/** 平台判定的出处；adapter 拒绝未登记平台时指向同一份文件。 */
const PLATFORM_FEASIBILITY = 'aiao-io/rxdb 仓库的 requirements/stories/adapter/miniprogram-platform-feasibility.md';

/**
 * Taro 的编译器配置（对象写法）。
 *
 * @experimental
 */
export interface TaroCompilerOptions {
  readonly [key: string]: unknown;
  /** 编译器类型；本插件只接受 `'vite'`。 */
  readonly type: string;
  /** 追加给 vite 的插件；Taro 只认数组。 */
  readonly vitePlugins?: readonly unknown[];
}

/**
 * `modifyRunnerOpts` 拿到的整份项目配置；本插件只读写 `compiler`。
 *
 * @experimental
 */
export interface TaroRunnerOptions {
  [key: string]: unknown;
  /** 编译器：字符串、对象写法，或缺省（Taro 按 webpack5 处理）。 */
  compiler?: string | TaroCompilerOptions;
}

/**
 * 本插件用到的 Taro 插件上下文，结构上兼容 `@tarojs/service` 的 `IPluginContext`。
 *
 * @experimental
 */
export interface TaroPluginContext {
  /** 项目路径；`appPath` 是 app 根目录，从这里解析 adapter。 */
  readonly paths: { readonly appPath: string };
  /** 在 runner 启动前修改项目配置；Taro 会 await 它。 */
  modifyRunnerOpts(hook: (args: { opts: TaroRunnerOptions }) => void): void;
}

function assertTaroPluginPlatform(platform: string | undefined): asserts platform is TaroPluginPlatform {
  if ((TARO_PLUGIN_PLATFORMS as readonly (string | undefined)[]).includes(platform)) return;
  const alipay = platform === 'alipay' ? '支付宝请改用 @aiao/rxdb-taro/vite 组装（见 adapter README「支付宝」）。' : '';
  throw new Error(
    `@aiao/rxdb-taro 只支持 ${TARO_PLUGIN_PLATFORMS.join('、')}，当前构建平台 ${platform}。${alipay}` +
      `平台判定见 ${PLATFORM_FEASIBILITY}`
  );
}

function viteCompilerOptions(compiler: TaroRunnerOptions['compiler']): TaroCompilerOptions {
  const options = typeof compiler === 'string' ? { type: compiler } : compiler;
  if (options?.type !== 'vite') {
    throw new Error(
      `@aiao/rxdb-taro 只支持 vite 编译器，当前 compiler 为 ${JSON.stringify(compiler ?? 'webpack5（缺省）')}`
    );
  }
  if (options.vitePlugins !== undefined && !Array.isArray(options.vitePlugins)) {
    throw new Error(
      `compiler.vitePlugins 必须是数组（当前 ${typeof options.vitePlugins}），否则 Taro 不会挂上任何插件`
    );
  }
  return options;
}

/**
 * Taro 插件：把 adapter 的构建前提（glue 去 `import.meta.url`、wasm 发进代码包、抖音绑定真实全局对象）
 * 追加进 `compiler.vitePlugins`，组装方式同 `@aiao/rxdb-taro/vite` 的 `miniProgramVitePlugins`。
 *
 * 只经 `modifyRunnerOpts` 改配置：它在 runner 启动前被 await；`modifyViteConfig` 不被 await，排在异步插件之后会与
 * vite 读配置赛跑。平台不是 `weapp` / `tt`、或编译器不是 vite 时构建期直接失败。不读不写 `build.target`。
 *
 * @example
 * ```ts
 * // config/index.ts
 * export default defineConfig<'vite'>({
 *   compiler: 'vite',
 *   plugins: ['@aiao/rxdb-taro']
 * });
 * ```
 *
 * @param ctx - Taro 注入的插件上下文
 * @experimental
 */
export default function rxdbTaroPlugin(ctx: TaroPluginContext): void {
  ctx.modifyRunnerOpts(({ opts }) => {
    const platform = process.env.TARO_ENV;
    assertTaroPluginPlatform(platform);
    const compiler = viteCompilerOptions(opts.compiler);
    opts.compiler = {
      ...compiler,
      vitePlugins: [...(compiler.vitePlugins ?? []), ...miniProgramVitePlugins(platform, ctx.paths.appPath)]
    };
  });
}
