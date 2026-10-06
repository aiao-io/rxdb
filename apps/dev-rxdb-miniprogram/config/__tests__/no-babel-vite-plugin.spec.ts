import type { Plugin, UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import { noBabelVitePlugin } from '../no-babel-vite-plugin';

type ConfigHook = (config: UserConfig) => void;
type ConfigResolvedHook = (config: { plugins: readonly Plugin[] }) => void;

function hooks() {
  const plugin = noBabelVitePlugin();
  return {
    plugin,
    config: plugin.config as ConfigHook,
    configResolved: plugin.configResolved as ConfigResolvedHook
  };
}

const inject: Plugin = { name: 'inject' };

describe('noBabelVitePlugin', () => {
  it('排在其他插件之后，config 钩子才看得到 Taro 合成的 rollupOptions.plugins', () => {
    expect(hooks().plugin.enforce).toBe('post');
  });

  it('从 Taro 合成的 rollupOptions.plugins 里原地拿掉 @rollup/plugin-babel，其余插件保留', () => {
    const plugins = [inject, { name: 'babel' }];
    const config: UserConfig = { build: { rollupOptions: { plugins } } };

    hooks().config(config);

    expect(config.build?.rollupOptions?.plugins).toBe(plugins);
    expect(plugins).toEqual([inject]);
  });

  it('rollupOptions.plugins 里没有 babel 时直接失败，Taro 改了注入方式要回来重看', () => {
    const config: UserConfig = { build: { rollupOptions: { plugins: [inject] } } };

    expect(() => hooks().config(config)).toThrow(/babel/);
  });

  it('rollupOptions.plugins 不是数组时直接失败', () => {
    expect(() => hooks().config({})).toThrow(/rollupOptions\.plugins/);
  });

  it('删掉 vite:react-babel 的 transform，保留它的 config 钩子（JSX 交给 esbuild 的设置在那里）', () => {
    const reactConfig = () => ({});
    const reactBabel: Plugin = { name: 'vite:react-babel', config: reactConfig, transform: () => null };

    hooks().configResolved({ plugins: [inject, reactBabel] });

    expect(reactBabel.transform).toBeUndefined();
    expect(reactBabel.config).toBe(reactConfig);
  });

  it('找不到 vite:react-babel 时直接失败', () => {
    expect(() => hooks().configResolved({ plugins: [inject] })).toThrow(/vite:react-babel/);
  });
});
