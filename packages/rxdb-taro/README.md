# @aiao/rxdb-taro

**实验性。** 给 Taro 4.3（vite 编译器）项目一行接入
[`@aiao/rxdb-adapter-miniprogram`](../rxdb-adapter-miniprogram/README.md) 的构建前提，目前支持微信（`weapp`）与抖音（`tt`）。

平台口径以 adapter 为准：抖音为实验性、Android 未验证，单连接，不保证崩溃恢复。本包不扩大支持面。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-adapter-miniprogram
pnpm add -D @aiao/rxdb-taro
```

- `@tarojs/cli` `~4.3.0`，编译器必须是 vite
- Node.js `>=20.19`：本包只发 ESM，Taro 用 `require()` 加载插件，要靠 Node 的 `require(esm)`

## 用法

```ts
// config/index.ts
import { defineConfig } from '@tarojs/cli';

export default defineConfig<'vite'>({
  compiler: 'vite',
  plugins: ['@aiao/rxdb-taro']
});
```

插件做四件事，漏掉前三件要到开发者工具或真机上才报错，漏掉最后一件构建直接失败：

| 做什么                                                                        | 不做的后果                                                                    |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 把 adapter 依赖的 wasm 发到产物根的 `wa-sqlite/wa-sqlite.wasm`                | 建库时找不到 wasm                                                             |
| 把 `@subframe7536/sqlite-wasm` glue 里的 `import.meta.url` 抹成空串           | 小程序没有 `import.meta`；vite 还会把约 0.7 MB 的 wasm 以 base64 内联进代码包 |
| 抖音：产物里自由的 `globalThis` 改指入口登记的真实全局对象（`rxdb-realm.js`） | 抖音模块里 `globalThis` 是 `undefined`，comlink 模块顶层一加载就 TypeError    |
| 构建目标仍是 Taro 写死的 `es6` 时抬到 `es2020`                                | Taro 4.3 模板带的 vite 4 在 es6 下改写不了 RxDB 的 BigInt 字面量，构建报错    |

wasm 走 vite 的 `emitFile`，落点相对 `outputRoot`，不依赖 `copy.patterns`。抖音入口 `app.js` 必须是非严格模式，
带 `use strict` 时构建失败。

### 构建期失败

- `TARO_ENV` 不是 `weapp` / `tt`：直接报错，列出支持的平台（支付宝见下一节）。
- 编译器不是 vite（包括缺省的 webpack5）：直接报错。
- `compiler.vitePlugins` 不是数组：直接报错（Taro 会把它当没配，插件也就悄悄没挂上）。
- app 根解析不到 `@aiao/rxdb-adapter-miniprogram`：构建一开始就报错。

### 不做的事

- **不覆盖你设的 `build.target`。** 只有构建目标仍是 Taro 写死的 `es6` 时才抬高（`enforce: 'post'`，排在 Taro 之后）；
  你在 `compiler.vitePlugins` 里设了别的值就照你的。adapter 本就要求原生 `BigInt`，抬到 es2020 不收窄支持面。
- **不管 babel。** 用了装饰器的项目，babel 配置归项目自己。
- 只经 Taro 的 `modifyRunnerOpts` 改配置：它在 runner 启动前被 await；`modifyViteConfig` 不被 await，排在异步插件后面会和
  vite 读配置赛跑。

### 已知环境问题

- Taro 4.3 的 React 模板用 pnpm 安装时，构建报找不到 `@babel/plugin-proposal-decorators`（与本包无关，纯模板同样报）。
  补装 `pnpm add -D @babel/plugin-proposal-decorators@^7` 即可；装成 8.x 会报 decorators 插件缺 `version` 选项。

## 运行时入口

小程序逻辑层里按构建平台取 adapter 宿主与平台 WASM 运行时，不用自己写 `wx` / `tt` 的分支：

```ts
import { prepareMiniProgramHostRuntime } from '@aiao/rxdb-adapter-miniprogram/runtime';
import { taroMiniProgramRuntime } from '@aiao/rxdb-taro/runtime';

const { host, wasmRuntime } = taroMiniProgramRuntime();
await prepareMiniProgramHostRuntime(host);
// 之后按 adapter README 建库：new RxDBAdapterWaSqliteMiniProgram(db, { moduleFactory, host, wasmRuntime })
```

- 平台判断是 `process.env.TARO_ENV` 与字面量比较，Taro 构建期把它替换成常量，另一平台的分支连同它读的全局一起摇掉：
  微信产物里没有 `typeof tt` / `TTWebAssembly`，抖音产物里没有 `typeof wx` / `WXWebAssembly`。
- 平台全局缺失时直接报错，不回退到另一平台；`WXWebAssembly` / `TTWebAssembly` 缺失时 `wasmRuntime` 为 `undefined`，交给
  adapter 的运行时预检报缺失项。
- 抖音不传 `runtimeGlobal`：Taro 插件已把产物里自由的 `globalThis` 改指真实全局对象。
- 只支持 `weapp` / `tt`；支付宝要 Worker 随机源与运行时修补，按 adapter README「支付宝」自行组装。

## 支付宝（实验性）

Taro 插件不开支付宝：支付宝还要懒加载分包、标签 `var` 提升，以及插件管不到的 `app.config.ts` 的 `workers`
与 `project.alipay.json` 的 `compileOptions.transpile`，见 adapter README「支付宝」。其中 wasm、base64 副本、随机数 Worker、
真实全局对象登记与构建目标（Taro 的 `es6` 抬到实测过的 `es2018`）由 `@aiao/rxdb-taro/vite` 组装：

```ts
// config/index.ts
import { miniProgramVitePlugins } from '@aiao/rxdb-taro/vite';

export default defineConfig<'vite'>({
  compiler: {
    type: 'vite',
    // Taro 以启动目录为 app 根
    vitePlugins: [...miniProgramVitePlugins('alipay', process.cwd()) /* 懒加载分包等 */]
  }
});
```

Worker 在代码包里的路径导出为 `ALIPAY_WORKER_PATH`（`workers/index.js`）。

`miniProgramVitePlugins(platform, appRoot)` 也接受 `weapp` / `tt`，给不走 Taro 插件机制、自己组装 vite 配置的项目用。

## 版本

只承诺实测过的 Taro 4.3.x：插件依赖的 `modifyRunnerOpts` 配置形状不是 Taro 公开文档化的契约，升级 Taro 后要重新验证。
