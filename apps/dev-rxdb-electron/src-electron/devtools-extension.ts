/**
 * @fileoverview DevTools 扩展的开发态加载闸门（US-904 阶段 D，AC#45）。
 *
 * @remarks
 * 「production 不加载」有两种做法，这里两种都用，因为它们挡的不是同一件事：
 *
 * 1. **运行时闸门**（本文件）：不读到显式的开发环境变量就一步都不往下走。它挡的是
 *    「有人拿 dev 产物当日常应用跑」。
 * 2. **构建期排除**（`electron-builder.json` 的 `!src-electron/devtools-*`）：正式安装包里
 *    根本没有这个文件。它挡的是「闸门本身被改坏」——而这正是 AC#45 要检查的那一半：
 *    产物里不得有扩展源码、加载路径或 bootstrap。
 *
 * 只留运行时闸门是不够的：一个 `if` 写反了就是一个能加载任意 unpacked 扩展的正式产物，
 * 而这种改动在 code review 里长得像重构。只留构建期排除也不够：e2e 跑的是解包产物
 * （`electron-builder.dir.json`），那份产物里文件是在的。
 *
 * 配置一律**显式给全，缺一即抛**：没有默认扩展目录、没有默认档位。猜一个目录出来，
 * 意味着某次路径写错时应用会去加载另一个碰巧存在的扩展；给档位一个默认值，
 * 意味着漏配的那次运行拿到的是「某个人当初觉得合理」的权限，而不是本次运行想要的权限。
 *
 * @module devtools-extension
 */

import type { DevToolsCapability } from '@aiao/rxdb-devtools';
import { isDevToolsCapability, type DevToolsMutationPolicy } from '@aiao/rxdb-devtools';

/** 总开关；值必须逐字为 `'1'`。 */
export const DEVTOOLS_ENABLE_ENV = 'DEV_RXDB_DEVTOOLS';

/** unpacked 扩展目录的绝对路径。 */
export const DEVTOOLS_EXTENSION_PATH_ENV = 'DEV_RXDB_DEVTOOLS_EXTENSION';

/** 本次运行的能力档；`none` / `readonly` / `full` 三选一。 */
export const DEVTOOLS_CAPABILITY_ENV = 'DEV_RXDB_DEVTOOLS_CAPABILITY';

/** 写入开关；只有逐字 `'allow'` 才开写，省略即只读。 */
export const DEVTOOLS_MUTATION_ENV = 'DEV_RXDB_DEVTOOLS_MUTATION';

/**
 * 把能力档带进渲染进程的启动参数前缀。
 *
 * @remarks
 * 用 `additionalArguments` 而不是 IPC，是因为**时序**：页内 connector 在应用 bootstrap 时
 * 就要拿到档位（`getDevToolsConnector()` 是一次性的全局单例），异步 IPC 到不了那么早，
 * 会退化成「先按默认档建好、再想办法改」——那等于让授权有一段可用的空窗。
 * 启动参数在 preload 执行前就已在 `process.argv` 里，读它是同步的。
 */
export const DEVTOOLS_CAPABILITY_ARG = '--rxdb-devtools-capability=';

/** 把写入开关带进渲染进程的启动参数前缀；语义同 {@link DEVTOOLS_CAPABILITY_ARG}。 */
export const DEVTOOLS_MUTATION_ARG = '--rxdb-devtools-mutation=';

/**
 * 把已校验的开发态配置编码成渲染进程启动参数。
 *
 * @param config - 已校验的开发态配置；`undefined` 表示本次运行没开 DevTools。
 * @returns 传给 `webPreferences.additionalArguments` 的数组；未开启时为空数组。
 *
 * @remarks
 * **未开启时必须是空数组**，而不是「带着默认值的两条参数」：production 的渲染进程里
 * 不该出现任何调试配置的痕迹，`parseDevToolsLaunchArguments` 也据此返回 `undefined`。
 */
export function devToolsLaunchArguments(config: DevToolsDevConfig | undefined): string[] {
  if (config === undefined) return [];
  return [`${DEVTOOLS_CAPABILITY_ARG}${config.capability}`, `${DEVTOOLS_MUTATION_ARG}${config.mutationPolicy}`];
}

/** 一次开发态 DevTools 运行的完整配置。 */
export interface DevToolsDevConfig {
  /** unpacked 扩展目录的绝对路径。 */
  readonly extensionPath: string;
  /** 本次运行的能力档。 */
  readonly capability: DevToolsCapability;
  /** 本次运行的写入开关。 */
  readonly mutationPolicy: DevToolsMutationPolicy;
}

/** 主进程 session 上加载扩展所需的最小面；真实实现是 `session.defaultSession.extensions`。 */
export interface DevToolsExtensionLoader {
  /** 加载一个 unpacked 扩展目录。 */
  loadExtension(path: string, options: { allowFileAccess: boolean }): Promise<{ id: string; name: string }>;
  /** 当前已加载的扩展。 */
  getAllExtensions(): readonly { id: string; name: string }[];
}

function requireEnv(env: Record<string, string | undefined>, key: string): string {
  const value = env[key];
  if (value === undefined || value.length === 0) {
    throw new Error(`[devtools] ${key} 未设置；开发态 DevTools 的配置必须显式给全`);
  }
  return value;
}

/**
 * 判断本次运行是否显式开启了开发态 DevTools。
 *
 * @param env - 进程环境变量。
 * @returns 开关逐字为 `'1'` 时为 `true`。
 */
export function isDevToolsEnabled(env: Record<string, string | undefined>): boolean {
  return env[DEVTOOLS_ENABLE_ENV] === '1';
}

/**
 * 解析开发态 DevTools 配置。
 *
 * @remarks
 * 未开启时返回 `undefined`——调用方据此**完全跳过**扩展相关的一切，而不是拿一份「空配置」
 * 继续往下走。绝对路径是硬要求：相对路径的基准是主进程的 cwd，而打包产物启动时的 cwd
 * 取决于用户怎么点开它。
 *
 * @param env - 进程环境变量。
 * @param isAbsolutePath - 路径绝对性判定（注入以便跨平台测试）。
 * @returns 已校验的配置；未开启时为 `undefined`。
 * @throws {Error} 开启但配置缺失或非法时。
 */
export function resolveDevToolsDevConfig(
  env: Record<string, string | undefined>,
  isAbsolutePath: (path: string) => boolean
): DevToolsDevConfig | undefined {
  if (!isDevToolsEnabled(env)) return undefined;

  const extensionPath = requireEnv(env, DEVTOOLS_EXTENSION_PATH_ENV);
  if (!isAbsolutePath(extensionPath)) {
    throw new Error(`[devtools] ${DEVTOOLS_EXTENSION_PATH_ENV} 必须是绝对路径`);
  }

  const capability = requireEnv(env, DEVTOOLS_CAPABILITY_ENV);
  if (!isDevToolsCapability(capability)) {
    throw new Error(`[devtools] ${DEVTOOLS_CAPABILITY_ENV} 必须是 none / readonly / full 之一`);
  }

  // 省略即只读：写入开关是 owner 为**这一次运行**打开的，不该被上一次的配置或某个默认值代表。
  const mutation = env[DEVTOOLS_MUTATION_ENV];
  if (mutation !== undefined && mutation !== 'allow') {
    throw new Error(`[devtools] ${DEVTOOLS_MUTATION_ENV} 只接受 allow；省略即只读`);
  }

  return { extensionPath, capability, mutationPolicy: mutation === 'allow' ? 'allow' : 'omit' };
}

/**
 * 加载工作区里那一个 unpacked 扩展。
 *
 * @remarks
 * 加载前后各查一次已加载清单：**加载前**必须为空，**加载后**必须恰好是这一个。AC#45 要的是
 * 「唯一工作区扩展」，而 Electron 的 `loadExtension` 对重复加载不会报错——少了这两查，
 * 一次重复调用会得到两份 relay，其表征是面板收到重复帧，排查时看不出源头在加载环节。
 *
 * `allowFileAccess: false` 是显式的：面板通过 v2 通道拿字节，任何 `file:` 读取都不在契约里。
 *
 * @param loader - 主进程 session 的扩展加载面。
 * @param config - 已校验的开发态配置。
 * @returns 被加载扩展的 id 与名字。
 * @throws {Error} 加载前已有扩展，或加载后数量不为 1 时。
 */
export async function loadDevToolsExtension(
  loader: DevToolsExtensionLoader,
  config: DevToolsDevConfig
): Promise<{ id: string; name: string }> {
  const before = loader.getAllExtensions();
  if (before.length > 0) {
    throw new Error(`[devtools] session 上已有 ${String(before.length)} 个扩展，拒绝再加载`);
  }

  const loaded = await loader.loadExtension(config.extensionPath, { allowFileAccess: false });

  const after = loader.getAllExtensions();
  if (after.length !== 1) {
    throw new Error(`[devtools] 加载后扩展数为 ${String(after.length)}，期望恰好 1 个`);
  }
  return loaded;
}
