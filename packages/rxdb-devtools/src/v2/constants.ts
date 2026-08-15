/**
 * @fileoverview v2 协议全部冻结数值的唯一真相源。
 *
 * @remarks
 * US-904c（Chrome）、US-904d（Electron）、US-905（Tauri）只引用本模块，不重新定义任何一个数字。
 * 任何一处硬编码副本都会在三端之间制造静默分叉：同一条 wire 在一端合法、在另一端越限，
 * 而两端都不会报错。改动这里的值等于改协议。
 *
 * @module @aiao/rxdb-devtools/v2/constants
 */

/** v2 协议版本号。 */
export const DEVTOOLS_PROTOCOL_VERSION_V2 = 2 as const;

/**
 * 版本决策窗口，单位毫秒。
 *
 * @remarks
 * 从**首次暂存 legacy HANDSHAKE** 起算，不是从 panel 初始化起算。以 init 起算会让
 * content script 注入等待（`chrome.permissions.request` 的用户授权，延迟无上界）
 * 把窗口耗尽，从而让「双方都支持 v2」的组合稳定退回 v1。
 */
export const DEVTOOLS_NEGOTIATION_WINDOW_MS = 1_000 as const;

/** `PROTOCOL_HELLO.supportedVersions` 的最大长度。 */
export const DEVTOOLS_MAX_SUPPORTED_VERSIONS = 8 as const;

/** 协议版本号下界。 */
export const DEVTOOLS_MIN_PROTOCOL_VERSION = 1 as const;

/** 协议版本号上界。 */
export const DEVTOOLS_MAX_PROTOCOL_VERSION = 255 as const;

/** `requestId` / `transferId` 的最大字符数。 */
export const DEVTOOLS_MAX_IDENTIFIER_LENGTH = 128 as const;

/** 单 session 在途 request 上限。 */
export const DEVTOOLS_MAX_INFLIGHT_REQUESTS = 32 as const;

/** 单 session 在途 transfer 上限。 */
export const DEVTOOLS_MAX_INFLIGHT_TRANSFERS = 2 as const;

/**
 * 单 session 终态 request ID 墓碑上限。
 *
 * @remarks
 * 「终态 ID 不得复用」必须用**有界**墓碑实现。无界集合会让长 session 的内存随请求数
 * 单调增长，而这条增长在功能测试里完全看不见。达到上限后新登记返回
 * `session_budget_exhausted`，由 panel 重新握手换取新 session。
 */
export const DEVTOOLS_MAX_REQUEST_TOMBSTONES = 4_096 as const;

/** 单 session 终态 transfer ID 墓碑上限。 */
export const DEVTOOLS_MAX_TRANSFER_TOMBSTONES = 256 as const;

/** 非流式 request 的端到端时限，单位毫秒；从通过 guard 起算。 */
export const DEVTOOLS_REQUEST_TIMEOUT_MS = 15_000 as const;

/**
 * transfer 的 idle 时限，单位毫秒。
 *
 * @remarks
 * 只被**通过 guard** 的 START / CHUNK / COMPLETE 帧刷新。被拒帧刷新计时器等于让
 * 攻击者用非法帧无限续命，所以拒绝判定必须排在刷新之前。
 */
export const DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS = 15_000 as const;

/**
 * transfer 的总时长上限，单位毫秒；从 START 通过 guard 起算。
 *
 * @remarks
 * 10 分钟在 1 GiB 上限下等价于要求约 1.7 MiB/s 的最低吞吐，本地 IPC / Port 远高于此。
 * 流式传输不适用 15 秒端到端时限——那个值在 1 GiB 上限下必然误杀。
 */
export const DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS = 600_000 as const;

/** 单个 chunk 解码后的最小字节数；空 chunk 一律非法。 */
export const DEVTOOLS_MIN_CHUNK_BYTES = 1 as const;

/** 单个 chunk 解码后的最大字节数（256 KiB）。按**解码后**字节数计算，不是 base64 串长。 */
export const DEVTOOLS_MAX_CHUNK_BYTES = 262_144 as const;

/** `maxTransferBytes` 的绝对上界（1 GiB）。 */
export const DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT = 1_073_741_824 as const;

/** 浏览器 OPFS 固定的 `maxTransferBytes`（50 MiB）。 */
export const DEVTOOLS_BROWSER_OPFS_MAX_TRANSFER_BYTES = 52_428_800 as const;

/** 分页默认页大小。 */
export const DEVTOOLS_DEFAULT_PAGE_SIZE = 100 as const;

/** 分页最大页大小。 */
export const DEVTOOLS_MAX_PAGE_SIZE = 500 as const;

/** 单个 snapshot 的最大记录条数；超过立即报错，**不截断**。 */
export const DEVTOOLS_MAX_SNAPSHOT_RECORDS = 100_000 as const;

/** 单个 snapshot 的最大规范记录字节数（32 MiB）；不计 transport envelope。 */
export const DEVTOOLS_MAX_SNAPSHOT_BYTES = 33_554_432 as const;

/** snapshot 端到端时限，单位毫秒；覆盖等锁、物化、epoch 重试与资源登记。 */
export const DEVTOOLS_SNAPSHOT_TIMEOUT_MS = 15_000 as const;

/** snapshot cursor 的无活动释放时限，单位毫秒。 */
export const DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS = 60_000 as const;

/** snapshot 因 capture epoch 变化而重试的最大次数。 */
export const DEVTOOLS_MAX_SNAPSHOT_EPOCH_RETRIES = 3 as const;
