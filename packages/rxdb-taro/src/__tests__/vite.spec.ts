import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { describe, expect, it } from 'vitest';
import { ALIPAY_WORKER_PATH, miniProgramVitePlugins, type MiniProgramBuildPlatform } from '../vite.js';

const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const PLATFORMS: readonly MiniProgramBuildPlatform[] = ['weapp', 'tt', 'alipay'];

function names(platform: MiniProgramBuildPlatform): string[] {
  return miniProgramVitePlugins(platform, APP_ROOT).map(plugin => plugin.name);
}

type ConfigHook = (config: object, env: object) => unknown;

describe('miniProgramVitePlugins', () => {
  it('微信：glue 改写、构建目标与代码包资源，不绑 realm（模块里有 globalThis）', () => {
    expect(names('weapp')).toEqual([
      'aiao-rxdb-taro:subframe-glue',
      'aiao-rxdb-taro:build-target',
      'aiao-rxdb-taro:assets'
    ]);
  });

  it.each(['tt', 'alipay'] as const)('%s：另把产物里的 globalThis 绑到真实全局对象', platform => {
    expect(names(platform)).toEqual([
      'aiao-rxdb-taro:subframe-glue',
      'aiao-rxdb-taro:build-target',
      'aiao-rxdb-taro:realm',
      'aiao-rxdb-taro:assets'
    ]);
  });

  function buildTargets(platform: MiniProgramBuildPlatform, target: string): unknown[] {
    const config = Object.freeze({ build: Object.freeze({ target }) });
    return miniProgramVitePlugins(platform, APP_ROOT)
      .map((plugin: Plugin): unknown => plugin.config)
      .filter((hook): hook is ConfigHook => typeof hook === 'function')
      .map(
        hook => hook(config, { command: 'build', mode: 'production' }) as { build?: { target?: unknown } } | undefined
      )
      .map(result => result?.build?.target)
      .filter(value => value !== undefined);
  }

  it.each(PLATFORMS)('%s：用户自己设的 build.target 不动', platform => {
    expect(buildTargets(platform, 'es2017')).toEqual([]);
  });

  it.each([
    ['weapp', 'es2020'],
    ['tt', 'es2020'],
    ['alipay', 'es2018']
  ] as const)('%s：只把 Taro 写死的 es6 抬到 %s', (platform, target) => {
    expect(buildTargets(platform, 'es6')).toEqual([target]);
  });

  it('支付宝随机数 Worker 在代码包里的路径', () => {
    expect(ALIPAY_WORKER_PATH).toBe('workers/index.js');
  });
});
