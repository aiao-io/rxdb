import { afterEach, describe, expect, it, vi } from 'vitest';
import { taroMiniProgramRuntime } from '../runtime.js';

const wasmRuntime = { instantiate: vi.fn() };

/** 按 Taro 平台名装上构建期常量与平台全局。 */
function stubPlatform(platform: string | undefined, globals: Record<string, unknown> = {}): void {
  vi.stubEnv('TARO_ENV', platform);
  for (const [name, value] of Object.entries(globals)) vi.stubGlobal(name, value);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('taroMiniProgramRuntime：微信', () => {
  it('返回微信 host 与 WXWebAssembly', () => {
    stubPlatform('weapp', { wx: {}, WXWebAssembly: wasmRuntime });

    const runtime = taroMiniProgramRuntime();

    expect(runtime.host.platform).toBe('wechat');
    expect(runtime.wasmRuntime).toBe(wasmRuntime);
  });

  it('没有 WXWebAssembly 时 wasmRuntime 为 undefined，交给运行时预检报缺失', () => {
    stubPlatform('weapp', { wx: {} });

    expect(taroMiniProgramRuntime().wasmRuntime).toBeUndefined();
  });

  it('没有全局 wx 时点名报错，不回退到抖音', () => {
    stubPlatform('weapp', { tt: {}, TTWebAssembly: wasmRuntime });

    expect(() => taroMiniProgramRuntime()).toThrow(/没有全局 wx/);
  });
});

describe('taroMiniProgramRuntime：抖音', () => {
  it('返回抖音 host 与 TTWebAssembly', () => {
    stubPlatform('tt', { tt: {}, TTWebAssembly: wasmRuntime });

    const runtime = taroMiniProgramRuntime();

    expect(runtime.host.platform).toBe('douyin');
    expect(runtime.wasmRuntime).toBe(wasmRuntime);
  });

  it('没有 TTWebAssembly 时 wasmRuntime 为 undefined', () => {
    stubPlatform('tt', { tt: {} });

    expect(taroMiniProgramRuntime().wasmRuntime).toBeUndefined();
  });

  it('没有全局 tt 时点名报错，不回退到微信', () => {
    stubPlatform('tt', { wx: {}, WXWebAssembly: wasmRuntime });

    expect(() => taroMiniProgramRuntime()).toThrow(/没有全局 tt/);
  });
});

describe('taroMiniProgramRuntime：其余平台', () => {
  it('支付宝报错并指向 adapter README', () => {
    stubPlatform('alipay', { my: {} });

    expect(() => taroMiniProgramRuntime()).toThrow(/支付宝.*README/);
  });

  it.each(['swan', 'h5', undefined])('平台 %s 报错，列出支持的平台', platform => {
    stubPlatform(platform);

    expect(() => taroMiniProgramRuntime()).toThrow(/weapp、tt/);
  });
});
