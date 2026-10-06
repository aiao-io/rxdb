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
  it('微信：glue 改写与代码包资源，不绑 realm（模块里有 globalThis）', () => {
    expect(names('weapp')).toEqual(['aiao-rxdb-taro:subframe-glue', 'aiao-rxdb-taro:assets']);
  });

  it.each(['tt', 'alipay'] as const)('%s：另把产物里的 globalThis 绑到真实全局对象', platform => {
    expect(names(platform)).toEqual([
      'aiao-rxdb-taro:subframe-glue',
      'aiao-rxdb-taro:realm',
      'aiao-rxdb-taro:assets'
    ]);
  });

  it.each(PLATFORMS)('%s：不读不写 build.target，跟随 Taro 或用户自己的设置', platform => {
    const userConfig = Object.freeze({ build: Object.freeze({ target: 'es2020' }) });
    const configHooks = miniProgramVitePlugins(platform, APP_ROOT)
      .map((plugin: Plugin) => plugin.config)
      .filter((hook): hook is ConfigHook => typeof hook === 'function');

    for (const hook of configHooks) {
      expect(hook(userConfig, { command: 'build', mode: 'production' })).not.toHaveProperty('build');
    }
  });

  it('支付宝随机数 Worker 在代码包里的路径', () => {
    expect(ALIPAY_WORKER_PATH).toBe('workers/index.js');
  });
});
