import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import {
  ADAPTER_PACKAGE,
  ALIPAY_WORKER_PATH,
  ALIPAY_WORKER_SOURCE_SUBPATH,
  WASM_PATH,
  WASM_SOURCE_SUBPATH,
  WASM_TEXT_COPY_SUFFIX
} from './constants.js';

/** 资源插件服务的 Taro 平台名。 */
export type AssetsPlatform = 'weapp' | 'tt' | 'alipay';

/**
 * 把 adapter 运行时要从代码包读的文件发进产物，三个平台同一条路径。
 *
 * - 全部平台：`@subframe7536/sqlite-wasm` 的 wasm。按 adapter 包的依赖解析：glue 由 adapter 加载，wasm 必须与它同源，
 *   混用会 `LinkError`。
 * - 支付宝另发两份：
 *   - wasm 的 base64 文本副本：模拟器把代码包文件当 UTF-8 文本读，二进制会被改写，只能读副本；iOS 真机读原文件。
 *     adapter 按锁定版本的指纹选对得上的那份。
 *   - adapter 包里预编译的 ES5 随机数 Worker，原样拷贝。
 *
 * 走 `emitFile` 而不是 Taro 的 copy 规则：产物路径相对 outputRoot，不受 `copy.patterns` 的 `to` 前缀语义影响；
 * base64 副本也要现算。adapter 在创建插件时就解析，app 没装它时构建一开始就失败。
 *
 * @param platform - Taro 平台名
 * @param appRoot - app 根目录（有 package.json 的那层），从这里解析 adapter 包
 */
export function miniProgramAssetsVitePlugin(platform: AssetsPlatform, appRoot: string): Plugin {
  const appRequire = createRequire(join(appRoot, 'package.json'));
  const adapterRequire = createRequire(appRequire.resolve(`${ADAPTER_PACKAGE}/package.json`));
  return {
    name: 'aiao-rxdb-taro:assets',
    apply: 'build',
    generateBundle() {
      const wasm = readFileSync(adapterRequire.resolve(WASM_SOURCE_SUBPATH));
      this.emitFile({ type: 'asset', fileName: WASM_PATH, source: wasm });
      if (platform !== 'alipay') return;
      this.emitFile({ type: 'asset', fileName: `${WASM_PATH}${WASM_TEXT_COPY_SUFFIX}`, source: wasm.toString('base64') });
      this.emitFile({
        type: 'asset',
        fileName: ALIPAY_WORKER_PATH,
        source: readFileSync(appRequire.resolve(ALIPAY_WORKER_SOURCE_SUBPATH), 'utf8')
      });
    }
  };
}
