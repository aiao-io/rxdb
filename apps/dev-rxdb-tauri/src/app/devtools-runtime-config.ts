/**
 * 页内 DevTools 运行档位的轻量读取器（US-905 阶段 1）。
 *
 * @remarks
 * Rust 的注入脚本在页面脚本之前把整份配置序列化挂到 {@link DEVTOOLS_RUNTIME_CONFIG_KEY}。
 * 这个模块只读**档位**三个键（providerSource / snapshotScenario / forceVfs）；授权两个键
 * （capability / mutationPolicy）的翻译留在 `setup_rxdb_desktop.ts` 的 `devToolsRuntimeConfig()`，
 * 那里是连接器装配的地方，档位与授权在同一个展开里传给 `getDevToolsConnector()`。
 *
 * 本模块**零依赖**是硬约束：主 chunk 的 `setup_rxdb.ts`（后端候选表）也要读强制档，
 * 而 `setup_rxdb_desktop.ts` 静态引入整个 devtools 装配 —— 主 chunk import 它会把装配拽进
 * `main.js`，正是 US-207 E11 挡的那一类。挂载键因此定义在这里而不是桌面模块里，
 * 桌面模块只做 re-export。
 */

/**
 * 挂载键，与 Rust 侧 `devtools_config.rs` 的 `CONFIG_GLOBAL_KEY` 逐字一致。
 *
 * @remarks
 * 页面与 Rust 分属两条工具链，这里只能写字面量；由 `devtools-runtime-config.spec.ts`
 * 的一条用例读 Rust 源码把两处钉在一起。Electron 侧同名同值，页内读法因此两端一致。
 */
export const DEVTOOLS_RUNTIME_CONFIG_KEY = '__aiaoRxdbDevToolsConfig__';

/** wa-sqlite 后端/VFS 强制档的三个取值，与 Rust `FORCE_VFS_VALUES` 逐字一致。 */
export type DevToolsForcedVfs = 'opfs' | 'idb' | 'unavailable';

/** 档位配置的页内形状（serde camelCase 后的 `DevToolsRuntimeConfig`）。 */
export interface DevToolsTierConfig {
  /** provider 源档位：real 走桌面真实后端，fake 走 `fake-provider-gear.ts` 的假集合。 */
  readonly providerSource?: 'real' | 'fake';
  /** snapshot 场景档位：只配 providerSource=fake 合法（Rust 侧校验）。 */
  readonly snapshotScenario?: 'ok' | 'busy' | 'expired' | 'too_large';
  /** wa-sqlite VFS 强制档：只配 providerSource=real 合法（Rust 侧校验）。 */
  readonly forceVfs?: DevToolsForcedVfs;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/**
 * 读取注入的档位配置。
 *
 * @returns 注入的档位；没有注入（release、或没开开发态 DevTools）时为 `undefined`
 *
 * @remarks
 * 不做字段校验：注入方是同一个进程里 Rust 侧的 `plan_from_env`（配错 exit 4），
 * 值到页面之前已经校验过一遍，这里再校验就是第二个真相源。
 */
export function readDevToolsTierConfig(): DevToolsTierConfig | undefined {
  const raw = (globalThis as Record<string, unknown>)[DEVTOOLS_RUNTIME_CONFIG_KEY];
  return isRecord(raw) ? (raw as DevToolsTierConfig) : undefined;
}

/**
 * 读取 VFS 强制档。
 *
 * @returns 注入的 `forceVfs`；未配置时为 `undefined`，候选表维持原优先级
 */
export function readForcedVfs(): DevToolsForcedVfs | undefined {
  return readDevToolsTierConfig()?.forceVfs;
}
