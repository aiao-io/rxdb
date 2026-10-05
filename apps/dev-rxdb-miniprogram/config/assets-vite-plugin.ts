import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/** 代码包里的 wasm 路径：微信 `DEFAULT_WASM_PATH`、抖音 host 的绝对路径、支付宝默认的相对路径都指向它。 */
export const WASM_PATH = 'wa-sqlite/wa-sqlite.wasm';

/**
 * 支付宝 wasm 的 base64 文本副本后缀；必须与 adapter 的 `ALIPAY_WASM_TEXT_COPY_SUFFIX` 一致（单测核对）。
 * 构建配置不 import adapter：它的包入口指向 dist/，配置加载不该依赖上游 build。
 */
export const WASM_TEXT_COPY_SUFFIX = '.base64.txt';

/** 支付宝随机数 Worker 在代码包里的路径；`app.config.ts` 的 `workers` 与 `runtime-preflight.ts` 的 `my.createWorker` 都用它。 */
export const ALIPAY_WORKER_PATH = 'workers/index.js';

/** 本插件服务的 Taro 平台名。 */
export type AssetsPlatform = 'weapp' | 'tt' | 'alipay';

/**
 * 把 adapter 运行时要从代码包读的文件发进产物，三个平台同一条路径。
 *
 * - 全部平台：`@subframe7536/sqlite-wasm` 的 wasm。按 adapter 包的依赖解析：glue 由 adapter 加载，wasm 必须与它同源，
 *   混用会 `LinkError`。
 * - 支付宝另发两份（接法见 adapter README「支付宝」）：
 *   - wasm 的 base64 文本副本：模拟器把代码包文件当 UTF-8 文本读，二进制会被改写，只能读副本；iOS 真机读原文件。
 *     adapter 按锁定版本的指纹选对得上的那份。
 *   - adapter 包里预编译的 ES5 随机数 Worker，原样拷贝；`project.alipay.json` 让开发者工具跳过转译。
 *
 * 走 `emitFile` 而不是 Taro 的 copy 规则：base64 副本要现算，三个平台放在一处。
 *
 * @param platform - Taro 平台名
 * @param appRoot - 本 app 的根目录（有 package.json 的那层），从这里解析 adapter 包
 */
export function miniProgramAssetsVitePlugin(platform: AssetsPlatform, appRoot: string): Plugin {
  const appRequire = createRequire(join(appRoot, 'package.json'));
  const adapterRequire = createRequire(appRequire.resolve('@aiao/rxdb-adapter-miniprogram/package.json'));
  return {
    name: 'dev-rxdb-miniprogram:assets',
    apply: 'build',
    generateBundle() {
      const wasm = readFileSync(adapterRequire.resolve('@subframe7536/sqlite-wasm/wasm'));
      this.emitFile({ type: 'asset', fileName: WASM_PATH, source: wasm });
      if (platform !== 'alipay') return;
      this.emitFile({
        type: 'asset',
        fileName: `${WASM_PATH}${WASM_TEXT_COPY_SUFFIX}`,
        source: wasm.toString('base64')
      });
      this.emitFile({
        type: 'asset',
        fileName: ALIPAY_WORKER_PATH,
        source: readFileSync(appRequire.resolve('@aiao/rxdb-adapter-miniprogram/alipay-random-worker.js'), 'utf8')
      });
    }
  };
}
