import { defineConfig, type UserConfigExport } from '@tarojs/cli';

import devConfig from './dev';
import prodConfig from './prod';
import {
  rxdbBuildTargetVitePlugin,
  rxdbPackagesVitePlugin,
  sloppyAppEntryVitePlugin,
  subframeSqliteWasmVitePlugin
} from './rxdb-packages-vite-plugin';

/**
 * 各平台产物分开放：微信开发者工具打开本目录（`project.config.json` 指向 `dist/`），
 * 抖音开发者工具直接打开 `dist-tt/`（Taro 把 `project.tt.json` 拷进去当 `project.config.json`）。
 */
const outputRoot = process.env.TARO_ENV === 'tt' ? 'dist-tt' : 'dist';

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<'vite'>(async merge => {
  const baseConfig: UserConfigExport<'vite'> = {
    projectName: 'todo',
    date: '2026-8-9',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2
    },
    sourceRoot: 'src',
    outputRoot,
    plugins: ['@tarojs/plugin-generator'],
    defineConstants: {},
    copy: {
      patterns: [
        {
          // wasm 与 glue 是一对，必须同出 `@subframe7536/sqlite-wasm`，混用会 LinkError。
          // `to` 必须带上 outputRoot：Taro 只剥掉 `to` 开头的 outputRoot，写死 `dist/` 会让 tt 产物落进 `dist-tt/dist/`
          from: 'node_modules/@subframe7536/sqlite-wasm/dist/wa-sqlite.wasm',
          to: `${outputRoot}/wa-sqlite/wa-sqlite.wasm`
        }
      ],
      options: {}
    },
    framework: 'react',
    compiler: {
      type: 'vite',
      vitePlugins: [
        rxdbPackagesVitePlugin(),
        subframeSqliteWasmVitePlugin(),
        rxdbBuildTargetVitePlugin(),
        ...(process.env.TARO_ENV === 'tt' ? [sloppyAppEntryVitePlugin()] : [])
      ]
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {}
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: 'module', // 转换模式，取值为 global/module
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      }
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',

      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css'
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {}
        },
        cssModules: {
          enable: false, // 默认为 false，如需使用 css modules 功能，则设为 true
          config: {
            namingPattern: 'module', // 转换模式，取值为 global/module
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      }
    },
    rn: {
      appName: 'taroDemo',
      postcss: {
        cssModules: {
          enable: false // 默认为 false，如需使用 css modules 功能，则设为 true
        }
      }
    }
  };

  if (process.env.NODE_ENV === 'development') {
    // 本地开发构建配置（不混淆压缩）
    return merge({}, baseConfig, devConfig);
  }
  // 生产构建配置（默认开启压缩混淆等）
  return merge({}, baseConfig, prodConfig);
});
