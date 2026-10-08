/** adapter 的包名：wasm 与支付宝 Worker 都按它的依赖解析。 */
export const ADAPTER_PACKAGE = '@aiao/rxdb-adapter-miniprogram';

/**
 * `@subframe7536/sqlite-wasm` 的 wasm 子路径，同 adapter 的 `SUBFRAME_WASM_SUBPATH`（单测对拍）。
 * 本包跑在 Node 里，不引 adapter：它的运行时入口会拖进 sqlite-core / comlink。
 */
export const WASM_SOURCE_SUBPATH = '@subframe7536/sqlite-wasm/wasm';

/** 代码包里的 wasm 路径：微信 `DEFAULT_WASM_PATH`、抖音 host 的绝对路径、支付宝默认的相对路径都指向它（单测对拍）。 */
export const WASM_PATH = 'wa-sqlite/wa-sqlite.wasm';

/** 支付宝 wasm 的 base64 文本副本后缀，同 adapter 的 `ALIPAY_WASM_TEXT_COPY_SUFFIX`（单测对拍）。 */
export const WASM_TEXT_COPY_SUFFIX = '.base64.txt';

/** adapter 包里预编译的 ES5 支付宝随机数 Worker 子路径。 */
export const ALIPAY_WORKER_SOURCE_SUBPATH = `${ADAPTER_PACKAGE}/alipay-random-worker.js`;

/**
 * 支付宝随机数 Worker 在代码包里的路径。
 *
 * `app.config.ts` 的 `workers` 与运行时 `my.createWorker` 都要用它。
 *
 * @experimental
 */
export const ALIPAY_WORKER_PATH = 'workers/index.js';
