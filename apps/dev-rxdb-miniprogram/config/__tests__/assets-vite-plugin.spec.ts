// 构建期测试，只读 adapter 轻量 /runtime 入口的常量来核对；nx 按包判定，把 rxdb-demo 的动态 import 也算成懒加载
// eslint-disable-next-line @nx/enforce-module-boundaries
import { ALIPAY_WASM_TEXT_COPY_SUFFIX } from '@aiao/rxdb-adapter-miniprogram/runtime';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALIPAY_WORKER_PATH,
  WASM_PATH,
  WASM_TEXT_COPY_SUFFIX,
  miniProgramAssetsVitePlugin
} from '../assets-vite-plugin';

const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const adapterRequire = createRequire(
  new URL('../../../../packages/rxdb-adapter-miniprogram/package.json', import.meta.url)
);

interface EmittedAsset {
  readonly type: string;
  readonly fileName: string;
  readonly source: string | Uint8Array;
}

function emit(platform: 'weapp' | 'tt' | 'alipay'): Map<string, EmittedAsset> {
  const emitted = new Map<string, EmittedAsset>();
  const generateBundle = miniProgramAssetsVitePlugin(platform, APP_ROOT).generateBundle as (this: unknown) => void;
  generateBundle.call({
    emitFile(file: EmittedAsset) {
      emitted.set(file.fileName, file);
      return file.fileName;
    }
  });
  return emitted;
}

const wasm = readFileSync(adapterRequire.resolve('@subframe7536/sqlite-wasm/wasm'));

describe('miniProgramAssetsVitePlugin', () => {
  it.each(['weapp', 'tt'] as const)('%s 只发 adapter glue 同源的 wasm', platform => {
    const emitted = emit(platform);

    expect([...emitted.keys()]).toEqual([WASM_PATH]);
    expect(Buffer.from(emitted.get(WASM_PATH)?.source ?? '').equals(wasm)).toBe(true);
  });

  it('支付宝另发 wasm 的 base64 文本副本与随机数 Worker', () => {
    const emitted = emit('alipay');

    expect([...emitted.keys()].sort()).toEqual(
      [WASM_PATH, `${WASM_PATH}${WASM_TEXT_COPY_SUFFIX}`, ALIPAY_WORKER_PATH].sort()
    );
    expect(
      Buffer.from(String(emitted.get(`${WASM_PATH}${WASM_TEXT_COPY_SUFFIX}`)?.source), 'base64').equals(wasm)
    ).toBe(true);
    expect(emitted.get(ALIPAY_WORKER_PATH)?.source).toBe(
      readFileSync(adapterRequire.resolve('@aiao/rxdb-adapter-miniprogram/alipay-random-worker.js'), 'utf8')
    );
  });

  it('副本后缀与 adapter 运行时读的一致', () => {
    expect(WASM_TEXT_COPY_SUFFIX).toBe(ALIPAY_WASM_TEXT_COPY_SUFFIX);
  });
});
