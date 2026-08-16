/**
 * @fileoverview capability 档位目录与序关系。
 *
 * @remarks
 * capability 是三层授权矩阵的第一层，语义与 v1 完全一致（`none` / `readonly` / `full`），
 * 因此这里复用 {@link DevToolsCapability} 而不是新造一个 v2 专属联合——两个同名不同义的档位
 * 会让 v1 facade 在翻译时必须做一次映射，而那次映射是没人会去测的。
 *
 * 档位来源永远是 connector owner 的**本地可信配置**；HANDSHAKE 里回显的 capability 只是告知。
 *
 * @module @aiao/rxdb-devtools/v2/capability
 */

import type { DevToolsCapability } from '../types.js';

/**
 * capability 的偏序：数值越大权限越宽。
 *
 * @remarks
 * `satisfies Record<DevToolsCapability, number>` 是有牙齿的：v1 联合里新增一个档位而这里没登记，
 * 直接编译失败，不会出现「新档位默认落到最宽」的静默扩权。
 */
export const DEVTOOLS_CAPABILITY_RANK = {
  none: 0,
  readonly: 1,
  full: 2
} as const satisfies Record<DevToolsCapability, number>;

/** 全部 capability 档位，按权限从窄到宽。 */
export const DEVTOOLS_CAPABILITIES = ['none', 'readonly', 'full'] as const satisfies readonly DevToolsCapability[];

/**
 * 判断值是否为合法的 capability 档位。
 *
 * @param value - 待检查值。
 * @returns 是三个已知档位之一时为 `true`。
 */
export function isDevToolsCapability(value: unknown): value is DevToolsCapability {
  return typeof value === 'string' && Object.hasOwn(DEVTOOLS_CAPABILITY_RANK, value);
}

/**
 * 判断实际档位是否达到所需档位。
 *
 * @param actual - connector owner 配置的实际档位。
 * @param required - 操作要求的最低档位。
 * @returns 达到或超过时为 `true`。
 */
export function satisfiesCapability(actual: DevToolsCapability, required: DevToolsCapability): boolean {
  return DEVTOOLS_CAPABILITY_RANK[actual] >= DEVTOOLS_CAPABILITY_RANK[required];
}
