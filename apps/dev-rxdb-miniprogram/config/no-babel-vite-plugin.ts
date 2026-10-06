import type { Plugin } from 'vite';

/** `@rollup/plugin-babel` 的插件名。vite-runner（`mini/config.js`）把它硬塞进 `build.rollupOptions.plugins`。 */
const ROLLUP_BABEL = 'babel';

/** `@vitejs/plugin-react` 的 babel 插件名。`@tarojs/plugin-framework-react` 给它塞了装饰器插件，于是每个源文件都过 babel。 */
const REACT_BABEL = 'vite:react-babel';

/**
 * 去掉 Taro vite 链路里的两处 babel 转译，语法降级全交给 Vite 的 esbuild（`build.target` 见 `rxdbBuildTargetVitePlugin`）。
 *
 * - `@rollup/plugin-babel`：vite-runner 写死、配置项关不掉（`compile.filter` 同时管页面处理，不能借用），在 `config` 钩子里
 *   从 Taro 合成的 `rollupOptions.plugins` 原地拿掉。
 * - `vite:react-babel`：删掉它的 `transform`，与 `@vitejs/plugin-react` 自己在没有 babel 插件时的做法一致；它 `config`
 *   钩子里交给 esbuild 的 JSX 设置保留。demo 源码不用装饰器。
 *
 * Taro 页面处理（vite-runner `mini/page.js`）仍用 `@babel/core` 解析页面、摘掉页面配置，那是 Taro 内部实现，不是转译。
 * 两个插件任一找不到就直接失败：Taro 改了注入方式要回来重看，不让 babel 悄悄回来，也不留无用的空转插件。
 */
export function noBabelVitePlugin(): Plugin {
  return {
    name: 'dev-rxdb-miniprogram:no-babel',
    enforce: 'post',
    config(config) {
      const plugins = config.build?.rollupOptions?.plugins;
      if (!Array.isArray(plugins)) {
        throw new Error(
          `Taro 合成的 build.rollupOptions.plugins 不是数组（${typeof plugins}），找不到 ${ROLLUP_BABEL}`
        );
      }
      const index = plugins.findIndex(plugin => (plugin as Plugin | null)?.name === ROLLUP_BABEL);
      if (index === -1) throw new Error(`Taro 合成的 build.rollupOptions.plugins 里没有 ${ROLLUP_BABEL}`);
      plugins.splice(index, 1);
    },
    configResolved(config) {
      const reactBabel = config.plugins.find(plugin => plugin.name === REACT_BABEL);
      if (!reactBabel) throw new Error(`插件列表里没有 ${REACT_BABEL}`);
      delete reactBabel.transform;
    }
  };
}
