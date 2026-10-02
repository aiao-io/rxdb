import { resolveMiniProgramHost } from './host.js';
import type {
  MiniProgramHost,
  MiniProgramHostSelection,
  WaSqliteMiniProgramBaseOptions
} from './mini-program.interface.js';
import type { MiniProgramRuntimeSource } from './runtime-source.js';
import { resolveMiniProgramRuntimeGlobal } from './runtime-global.js';
import { readMiniProgramRuntimeSources } from './runtime-source.js';

/** 小程序运行 RxDB 所需的一项能力。 */
export interface MiniProgramRuntimeCapability {
  readonly name: string;
  readonly available: boolean;
  readonly source?: MiniProgramRuntimeSource;
}

/**
 * 运行时预检需要的配置：模块工厂、WASM 运行时、宿主，以及可选的数据库目录。
 *
 * 给了 `databaseRoot` 就不再要求宿主提供用户数据目录。
 */
export type MiniProgramRuntimeCapabilityOptions = Pick<
  WaSqliteMiniProgramBaseOptions,
  'moduleFactory' | 'wasmRuntime' | 'databaseRoot'
> &
  MiniProgramHostSelection;

/** 非空串才算一个可用目录。 */
function isUsableDirectory(value: string | undefined): boolean {
  return typeof value === 'string' && value !== '';
}

/** 数据库目录：显式 `databaseRoot` 优先，否则由宿主用户目录推导，与文件 VFS 的取值顺序一致。 */
function hasDatabaseDirectory(host: MiniProgramHost, options: MiniProgramRuntimeCapabilityOptions): boolean {
  if (options.databaseRoot !== undefined) return isUsableDirectory(options.databaseRoot);
  return isUsableDirectory(host.userDataPath);
}

/** 文件 VFS 用到的全部同步方法。 */
const FILE_SYSTEM_METHODS = ['accessSync', 'mkdirSync', 'readFileSync', 'unlinkSync', 'writeFileSync'] as const;

/**
 * 文件系统能力：入口拿不到时报入口本身；拿到了但缺方法时逐个报缺失的方法。
 *
 * 只认入口返回值会把缺方法的平台放进 VFS，到第一次读写才以 `TypeError` 暴露。
 */
function listFileSystemCapabilities(host: MiniProgramHost): readonly MiniProgramRuntimeCapability[] {
  const name = host.capabilityNames.fileSystem;
  const fileSystem: unknown = host.getFileSystemManager();
  if (typeof fileSystem !== 'object' || fileSystem === null) return [{ name, available: false }];
  const methods = fileSystem as Record<string, unknown>;
  const missing = FILE_SYSTEM_METHODS.filter(method => typeof methods[method] !== 'function');
  if (missing.length === 0) return [{ name, available: true }];
  return missing.map(method => ({ name: `${name}().${method}`, available: false }));
}

/** 按已解析的宿主列能力矩阵；客户端连接时复用同一个宿主，不重复解析。 */
export function listMiniProgramHostCapabilities(
  host: MiniProgramHost,
  options: MiniProgramRuntimeCapabilityOptions
): readonly MiniProgramRuntimeCapability[] {
  const runtimeGlobal = resolveMiniProgramRuntimeGlobal(host);
  const sources = readMiniProgramRuntimeSources(runtimeGlobal);
  return [
    { name: 'moduleFactory', available: typeof options.moduleFactory === 'function' },
    {
      name: `${host.wasmRuntimeName}.instantiate`,
      available: typeof options.wasmRuntime?.instantiate === 'function'
    },
    ...listFileSystemCapabilities(host),
    { name: host.capabilityNames.userDataPath, available: hasDatabaseDirectory(host, options) },
    { name: 'BigInt', available: typeof runtimeGlobal.BigInt === 'function' },
    { name: 'crypto.getRandomValues', available: sources.random !== 'missing', source: sources.random },
    {
      name: 'structuredClone',
      available: sources.structuredClone !== 'missing',
      source: sources.structuredClone
    },
    { name: 'TextEncoder', available: sources.textEncoder !== 'missing', source: sources.textEncoder },
    { name: 'TextDecoder', available: sources.textDecoder !== 'missing', source: sources.textDecoder },
    { name: 'performance.now', available: sources.performanceNow !== 'missing', source: sources.performanceNow },
    { name: 'queueMicrotask', available: typeof runtimeGlobal.queueMicrotask === 'function' }
  ];
}

/** 按已解析的宿主断言硬依赖齐全；缺失时列出全部缺失项。 */
export function assertMiniProgramHostCapabilities(
  host: MiniProgramHost,
  options: MiniProgramRuntimeCapabilityOptions
): void {
  const missing = listMiniProgramHostCapabilities(host, options).filter(capability => !capability.available);
  if (missing.length === 0) return;
  throw new Error(`${host.displayName}运行时缺少 RxDB 必需能力: ${missing.map(item => item.name).join(', ')}`);
}

/**
 * 检查小程序逻辑层运行完整 RxDB/wa-sqlite 所需的能力。
 *
 * 平台相关能力名取自宿主（微信为 `WXWebAssembly.instantiate` / `wx.*`）；
 * 未知平台 id 直接抛 `MiniProgramUnknownPlatformError`。
 */
export function checkMiniProgramRuntimeCapabilities(
  options: MiniProgramRuntimeCapabilityOptions
): readonly MiniProgramRuntimeCapability[] {
  return listMiniProgramHostCapabilities(resolveMiniProgramHost(options), options);
}

/** 缺少硬依赖时在加载 WASM 前给出完整能力清单。 */
export function assertMiniProgramRuntimeCapabilities(options: MiniProgramRuntimeCapabilityOptions): void {
  assertMiniProgramHostCapabilities(resolveMiniProgramHost(options), options);
}
