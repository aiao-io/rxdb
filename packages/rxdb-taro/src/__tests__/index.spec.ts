import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import rxdbTaroPlugin, { type TaroPluginContext, type TaroRunnerOptions } from '../index.js';
import { FAKE_WASM, createFakeApp } from './fake-app.js';

const APP_ROOT = fileURLToPath(new URL('../..', import.meta.url));

type RunnerOptsHook = (args: { opts: TaroRunnerOptions }) => void;

/** 伪 Taro 插件上下文：记下注册的钩子；时序上不保险的钩子一旦被注册就算失败。 */
function fakeContext(appPath = APP_ROOT) {
  const runnerOptsHooks: RunnerOptsHook[] = [];
  const unsafeHooks = { modifyViteConfig: vi.fn(), modifyWebpackChain: vi.fn(), onBuildFinish: vi.fn() };
  const ctx: TaroPluginContext & typeof unsafeHooks = {
    paths: { appPath },
    modifyRunnerOpts: hook => runnerOptsHooks.push(hook),
    ...unsafeHooks
  };
  return { ctx, runnerOptsHooks, unsafeHooks };
}

/** 按 `TARO_ENV` 装上插件并跑一遍 `modifyRunnerOpts`，返回改过的配置。 */
function build(platform: string | undefined, opts: TaroRunnerOptions, appPath?: string): TaroRunnerOptions {
  vi.stubEnv('TARO_ENV', platform);
  const { ctx, runnerOptsHooks } = fakeContext(appPath);
  rxdbTaroPlugin(ctx);
  for (const hook of runnerOptsHooks) hook({ opts });
  return opts;
}

function pluginNames(opts: TaroRunnerOptions): unknown[] {
  const compiler = opts.compiler;
  if (typeof compiler !== 'object') throw new Error(`compiler 不是对象：${String(compiler)}`);
  return (compiler.vitePlugins ?? []).map(plugin => (plugin as { name?: unknown }).name);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('rxdbTaroPlugin 的钩子注册', () => {
  it('只注册被 await 的 modifyRunnerOpts，装上时不读平台、不改配置', () => {
    vi.stubEnv('TARO_ENV', 'h5');
    const { ctx, runnerOptsHooks, unsafeHooks } = fakeContext();

    rxdbTaroPlugin(ctx);

    expect(runnerOptsHooks).toHaveLength(1);
    expect(unsafeHooks.modifyViteConfig).not.toHaveBeenCalled();
    expect(unsafeHooks.modifyWebpackChain).not.toHaveBeenCalled();
    expect(unsafeHooks.onBuildFinish).not.toHaveBeenCalled();
  });
});

describe('rxdbTaroPlugin：weapp / tt + vite', () => {
  it('compiler 为字符串 vite 时换成对象并挂上插件', () => {
    const opts = build('weapp', { compiler: 'vite' });

    expect(opts.compiler).toEqual({ type: 'vite', vitePlugins: expect.any(Array) });
    expect(pluginNames(opts)).toEqual([
      'aiao-rxdb-taro:subframe-glue',
      'aiao-rxdb-taro:build-target',
      'aiao-rxdb-taro:assets'
    ]);
  });

  it('抖音另挂 realm；用户已有的插件与其余编译器选项原样保留、排在前面', () => {
    const userPlugin = { name: 'user:plugin' };
    const opts = build('tt', { compiler: { type: 'vite', vitePlugins: [userPlugin], extra: true } });

    expect(opts.compiler).toMatchObject({ type: 'vite', extra: true });
    expect(pluginNames(opts)).toEqual([
      'user:plugin',
      'aiao-rxdb-taro:subframe-glue',
      'aiao-rxdb-taro:build-target',
      'aiao-rxdb-taro:realm',
      'aiao-rxdb-taro:assets'
    ]);
  });

  it('不改 compiler 之外的配置', () => {
    const opts = build('weapp', { compiler: 'vite', outputRoot: 'dist', copy: { patterns: [] } });

    expect(opts).toMatchObject({ outputRoot: 'dist', copy: { patterns: [] } });
  });

  it('vitePlugins 不是数组时失败：Taro 会把它当没配，插件也就悄悄没挂上', () => {
    expect(() => build('weapp', { compiler: { type: 'vite', vitePlugins: {} as never } })).toThrow(/vitePlugins/);
  });

  it('wasm 从 ctx.paths.appPath 解析 adapter', () => {
    const opts = build('weapp', { compiler: 'vite' }, createFakeApp());
    const compiler = opts.compiler as unknown as { vitePlugins: { name: string; generateBundle?: unknown }[] };
    const assets = compiler.vitePlugins.find(plugin => plugin.name === 'aiao-rxdb-taro:assets');
    const emitted: { source: unknown }[] = [];

    (assets?.generateBundle as (this: unknown) => void).call({
      emitFile: (file: { source: unknown }) => emitted.push(file)
    });

    expect(emitted.map(file => Buffer.from(file.source as Buffer).equals(FAKE_WASM))).toEqual([true]);
  });
});

describe('rxdbTaroPlugin：构建期拒绝', () => {
  it.each([undefined, 'webpack5', { type: 'webpack5' }, 'webpack4'])('编译器 %o 不是 vite 时失败', compiler => {
    expect(() => build('weapp', { compiler })).toThrow(/只支持 vite 编译器/);
  });

  it.each(['swan', 'qq', 'jd', 'h5', 'rn', 'harmony-hybrid', undefined])('平台 %s 失败，列出支持的平台', platform => {
    expect(() => build(platform, { compiler: 'vite' })).toThrow(/weapp、tt.*miniprogram-platform-feasibility\.md/s);
  });

  it('支付宝失败，并指向 @aiao/rxdb-taro/vite', () => {
    expect(() => build('alipay', { compiler: 'vite' })).toThrow(/@aiao\/rxdb-taro\/vite/);
  });

  it('平台不对时先报平台，不看编译器', () => {
    expect(() => build('h5', { compiler: 'webpack5' })).toThrow(/h5/);
  });
});
