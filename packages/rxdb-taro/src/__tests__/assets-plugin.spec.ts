import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { miniProgramAssetsVitePlugin } from '../assets-plugin.js';
import { ALIPAY_WORKER_PATH, WASM_PATH, WASM_TEXT_COPY_SUFFIX } from '../constants.js';
import { FAKE_WASM, FAKE_WORKER, createFakeApp } from './fake-app.js';

/** 本包把 adapter 列为 devDependency，包根就能当 app 根解析它。 */
const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const appRequire = createRequire(new URL('../../package.json', import.meta.url));
const adapterRequire = createRequire(appRequire.resolve('@aiao/rxdb-adapter-miniprogram/package.json'));

interface EmittedAsset {
  readonly type: string;
  readonly fileName: string;
  readonly source: string | Uint8Array;
}

function emit(platform: 'weapp' | 'tt' | 'alipay', appRoot = APP_ROOT): Map<string, EmittedAsset> {
  const emitted = new Map<string, EmittedAsset>();
  const plugin = miniProgramAssetsVitePlugin(platform, appRoot);
  const generateBundle = plugin.generateBundle as (this: unknown) => void;
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
  it('只在 build 生效', () => {
    expect(miniProgramAssetsVitePlugin('weapp', APP_ROOT).apply).toBe('build');
  });

  it.each(['weapp', 'tt'] as const)('%s 只发 adapter glue 同源的 wasm', platform => {
    const emitted = emit(platform);

    expect([...emitted.keys()]).toEqual([WASM_PATH]);
    expect(emitted.get(WASM_PATH)?.type).toBe('asset');
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
      readFileSync(appRequire.resolve('@aiao/rxdb-adapter-miniprogram/alipay-random-worker.js'), 'utf8')
    );
  });

  it('从 app 根解析 adapter，wasm 按 adapter 自己的依赖解析', () => {
    const emitted = emit('alipay', createFakeApp());

    expect(Buffer.from(emitted.get(WASM_PATH)?.source ?? '').equals(FAKE_WASM)).toBe(true);
    expect(emitted.get(`${WASM_PATH}${WASM_TEXT_COPY_SUFFIX}`)?.source).toBe(FAKE_WASM.toString('base64'));
    expect(emitted.get(ALIPAY_WORKER_PATH)?.source).toBe(FAKE_WORKER);
  });
});
