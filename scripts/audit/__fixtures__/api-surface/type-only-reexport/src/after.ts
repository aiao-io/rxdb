// 改动后：同样的纯值改成仅类型转出，发射后运行时一个导出都不剩。
// 三种写法：语句级 type-only（runTask、VERSION）、逐 specifier 的 type-only（LIMIT）、`import type` 之后再本地转出（Ceiling）。
export { type LIMIT } from './models.js';
export type { runTask, VERSION } from './models.js';
export { Ceiling };

import type { LIMIT as Ceiling } from './models.js';
