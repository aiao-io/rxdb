import {
  ALIPAY_WASM_TEXT_COPY_SUFFIX,
  DEFAULT_WASM_PATH,
  SUBFRAME_WASM_SUBPATH,
  createDouyinMiniProgramHost,
  type MiniProgramDouyinApi
} from '@aiao/rxdb-adapter-miniprogram';
import { describe, expect, it } from 'vitest';
import { WASM_PATH, WASM_SOURCE_SUBPATH, WASM_TEXT_COPY_SUFFIX } from '../constants.js';

// 本包是 Node 侧构建插件，不能在运行时引入 adapter（会拖进 sqlite-core / comlink），所以持有副本、在这里对拍
describe('构建期常量与 adapter 对拍', () => {
  it('wasm 源子路径与 adapter 加载的 glue 同源', () => {
    expect(WASM_SOURCE_SUBPATH).toBe(SUBFRAME_WASM_SUBPATH);
  });

  it('代码包内 wasm 路径与微信默认路径一致', () => {
    expect(WASM_PATH).toBe(DEFAULT_WASM_PATH);
  });

  it('代码包内 wasm 路径与抖音 host 的绝对路径指向同一个文件', () => {
    expect(createDouyinMiniProgramHost({} as MiniProgramDouyinApi).defaultWasmPath).toBe(`/${WASM_PATH}`);
  });

  it('支付宝 base64 副本后缀与 adapter 运行时读的一致', () => {
    expect(WASM_TEXT_COPY_SUFFIX).toBe(ALIPAY_WASM_TEXT_COPY_SUFFIX);
  });
});
