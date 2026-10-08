import { describe, expect, it } from 'vitest';
import { buildTargetVitePlugin, TARO_DEFAULT_TARGET } from '../build-target-plugin.js';

type ConfigHook = (config: { build?: { target?: unknown } }) => unknown;

function configHook(platform: 'weapp' | 'tt' | 'alipay'): ConfigHook {
  return buildTargetVitePlugin(platform).config as ConfigHook;
}

describe('buildTargetVitePlugin', () => {
  it('排在 Taro 的 config 钩子之后', () => {
    expect(buildTargetVitePlugin('weapp').enforce).toBe('post');
  });

  it('Taro 写死的默认值就是 es6', () => {
    expect(TARO_DEFAULT_TARGET).toBe('es6');
  });

  it.each([
    ['weapp', 'es2020'],
    ['tt', 'es2020'],
    ['alipay', 'es2018']
  ] as const)('%s：把 Taro 的 es6 抬到 %s', (platform, target) => {
    expect(configHook(platform)({ build: { target: 'es6' } })).toEqual({ build: { target } });
  });

  it.each(['es2017', 'es2022', ['chrome80'], undefined])('用户设了别的构建目标（%o）时不动', target => {
    expect(configHook('weapp')({ build: { target } })).toBeUndefined();
  });

  it('没有 build 配置时不动', () => {
    expect(configHook('tt')({})).toBeUndefined();
  });
});
