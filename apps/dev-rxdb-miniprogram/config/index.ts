import { defineConfig, type UserConfigExport } from '@tarojs/cli';

import { miniProgramAssetsVitePlugin, type AssetsPlatform } from './assets-vite-plugin';
import devConfig from './dev';
import { labeledVarHoistVitePlugin } from './labeled-var-hoist-vite-plugin';
import { lazyChunkVitePlugin } from './lazy-chunk-vite-plugin';
import prodConfig from './prod';
import { realmVitePlugin } from './realm-vite-plugin';
import {
  rxdbBuildTargetVitePlugin,
  rxdbPackagesVitePlugin,
  subframeSqliteWasmVitePlugin
} from './rxdb-packages-vite-plugin';

/**
 * 各平台产物分开放（Taro 每次构建先清空 outputRoot，共用目录会互相抹掉）：
 * 微信开发者工具打开本目录（`project.config.json` 指向 `dist/`），
 * 抖音开发者工具直接打开 `dist-tt/`（Taro 把 `project.tt.json` 拷进去当 `project.config.json`），
 * 支付宝小程序开发者工具直接打开 `dist-alipay/`（Taro 把 `project.alipay.json` 拷进去当 `mini.project.json`）。
 */
const outputRoot =
  process.env.TARO_ENV === 'tt' || process.env.TARO_ENV === 'alipay' ? `dist-${process.env.TARO_ENV}` : 'dist';

/** demo 接了的三个平台；其余平台名直接失败，不按某个平台的产物凑合。 */
function demoPlatform(): AssetsPlatform {
  const platform = process.env.TARO_ENV;
  if (platform === 'weapp' || platform === 'tt' || platform === 'alipay') return platform;
  throw new Error(`demo 只接了 weapp / tt / alipay，当前构建平台 ${platform}`);
}

/**
 * 各平台的构建插件。
 *
 * - 全部平台：私有成员降级、glue 去 `import.meta.url`、构建目标、代码包资源（wasm，支付宝另有副本与 Worker）。
 * - 抖音、支付宝：模块里没有 `globalThis`，构建期绑到入口登记的真实全局对象。
 * - 支付宝：RxDB 栈留在懒加载 chunk，等 host 的 `prepareRuntime` 补完 `BigInt` 才求值；标签语句里的 `var` 提升到函数开头，
 *   「真机调试」的 Boatman 解释器才不会把它写穿到外层闭包。
 */
function vitePlugins(platform: AssetsPlatform) {
  return [
    rxdbPackagesVitePlugin(),
    subframeSqliteWasmVitePlugin(),
    rxdbBuildTargetVitePlugin(platform === 'alipay' ? 'es2018' : 'es2020'),
    // Taro 以启动目录为 appPath（nx target 的 cwd 是本 app 根）
    miniProgramAssetsVitePlugin(platform, process.cwd()),
    ...(platform === 'weapp' ? [] : [realmVitePlugin(platform)]),
    ...(platform === 'alipay' ? [lazyChunkVitePlugin(), labeledVarHoistVitePlugin()] : [])
  ];
}

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
    // 代码包资源由 `miniProgramAssetsVitePlugin` 发出，不走 copy 规则
    copy: {
      patterns: [],
      options: {}
    },
    framework: 'react',
    compiler: {
      type: 'vite',
      vitePlugins: vitePlugins(demoPlatform())
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
