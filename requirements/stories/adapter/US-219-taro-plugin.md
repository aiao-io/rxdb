---
id: US-219
title: Taro 插件一行接入小程序 adapter 的构建配置
status: In Review
priority: Medium
epic: epic-004-future-features
created: 2026-10-04
updated: 2026-10-07
tags: [adapter, miniprogram, taro, build, vite, wechat, douyin, alipay, experimental]
---

<!--
INVEST 检查清单:
- [x] Independent: 只依赖已 Done 的 US-209 与 US-211 已登记的 `douyin` / `alipay`；不改 adapter 运行时行为
- [x] Negotiable: 运行时入口要不要做可谈；webpack5 不支持；支付宝进 Taro 插件白名单另议
- [x] Valuable: 今天 npm 用户只能照抄 monorepo 里未发布的 demo 配置，抄错全在开发者工具 / 真机上才炸
- [x] Estimable: 阶段 A 是把 demo 里已验证的 glue 改写、realm、wasm 资产三个 vite 插件搬进可发布包
- [x] Small: 阶段 A 一个迭代；B 独立
- [x] Testable: 构建产物可断言（wasm 位置、无 base64 内联、无 `import.meta`、realm 绑定），另有 local-registry 真实安装路径
-->

# 用户故事：Taro 插件一行接入小程序 adapter 的构建配置

> 本故事**不扩大支持面**。平台口径继承 [US-209](./US-209-miniprogram-adapter.md) 与
> [US-211](./US-211-multi-miniprogram-platforms.md)：adapter 现登记微信、抖音与支付宝（抖音、支付宝实验性，Android 未验证），单连接、无崩溃恢复。
> Taro 插件（一行接入）只开微信与抖音；支付宝的构建前提只有一部分进包（`@aiao/rxdb-taro/vite` 的 realm 与资产，实验性），
> 懒加载分包、标签 `var` 提升与 `es2018` 构建目标仍留在 demo（见 Out of Scope）。

## 交付阶段

| 阶段 | 状态 | 交付                                                                                                                               | AC 区段   | 门禁                               |
| ---- | ---- | ---------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------- |
| A    | ⚠️   | `@aiao/rxdb-taro` 构建插件（vite 编译器、`weapp` / `tt`）与 `./vite` 子路径（按平台组装的 vite 插件）；demo 改用；npm 安装路径实测 | AC#1～13  | 无（US-209 Done，`douyin` 已登记） |
| B    | ⚠️   | `@aiao/rxdb-taro/runtime`：按 `TARO_ENV` 取 host 与 WASM 运行时，另一平台分支构建期摇掉                                            | AC#14～17 | 阶段 A                             |

## 作为/我想要/以便

**作为** 用 Taro 4（vite 编译器）同时打微信与抖音小程序、从 npm 安装 `@aiao/rxdb-adapter-miniprogram` 的开发者
**我想要** 在 `config/index.ts` 的 `plugins` 里加一行 `'@aiao/rxdb-taro'` 就完成 wasm 拷贝、glue 改写与抖音全局对象绑定
**以便** 不必从 monorepo 的 demo 里照抄一百多行构建插件，并且平台或编译器不对时**构建期就失败**，而不是在开发者工具或真机上才报错

## 今天就能踩到的症状

1. **README 指向一个不发布的目录。** adapter README「抖音」「支付宝」「打包器注意事项」三节都指向 `apps/dev-rxdb-miniprogram` 的
   `config/` 下的构建插件（`realm-vite-plugin.ts`、`assets-vite-plugin.ts`、`rxdb-packages-vite-plugin.ts`）；而
   [adapter 的 package.json](../../../packages/rxdb-adapter-miniprogram/package.json) `files` 只有 `dist` / `src`。
   npm 用户能拿到的只有文字说明。（复验：读 README 三节与 `files` 字段。）
2. **三个构建前提，漏任何一个都是运行期才暴露**，全部只活在 demo 的
   [`config/`](../../../apps/dev-rxdb-miniprogram/config/)（`assets-vite-plugin.ts`、`rxdb-packages-vite-plugin.ts`、`realm-vite-plugin.ts`）与 `index.ts` 里：

   | 前提                           | demo 里的实现                    | 漏掉的后果（出处）                                                                                                                   |
   | ------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
   | wasm 拷进代码包根              | `miniProgramAssetsVitePlugin()`  | `copy.patterns` 的 `to` 不带 outputRoot 时 tt 产物会落进 `dist-tt/dist/`，所以 demo 用 `emitFile`；完全漏掉则建库时找不到 wasm       |
   | 抹掉 glue 的 `import.meta.url` | `subframeSqliteWasmVitePlugin()` | 小程序没有 `import.meta`；vite 还会把约 0.7 MB 的 wasm 以 base64 内联，代码包多约 1 MB（adapter README「打包器注意事项」）           |
   | 抖音产物绑定真实全局对象       | `realmVitePlugin('tt')`          | 抖音模块里 `globalThis` 为 `undefined`，comlink 模块顶层 `'FinalizationRegistry' in globalThis` 一加载就 TypeError（README「抖音」） |

   `build.target` **也是前提（2026-10-07 AC#10 推翻原判断）**：`@tarojs/vite-runner` 的 `taro:vite-mini-config` 写死 `target: 'es6'`，
   Taro 配置不暴露该项。原判断是「es6 下 esbuild 把 BigInt 字面量改写成 `BigInt("…")` 并告警」，这只在 demo 的 vite 6 上成立；
   Taro 4.3 官方模板带的是 vite 4（esbuild 0.18），es6 下直接报 `Big integer literals are not available in the configured target
environment`，构建失败（React、Vue 模板实测）。所以插件只把 Taro 写死的 `es6` 抬到实测过的目标（微信、抖音 es2020，支付宝
   es2018，即 demo 原 `rxdbBuildTargetVitePlugin()` 的取值），用户自己设的值不动。

3. **「从 npm 安装 + Taro 构建」这条路没有验证过。** demo 里原有的私有成员 babel 转换已经删除：`config/no-babel-vite-plugin.ts` 去掉 Taro 链路里的两处 babel，
   语法降级（含 RxDB 包的私有成员）全由 esbuild 按构建目标做，与包是 workspace 链接还是 npm 安装无关。
   **推断**：npm 安装路径下这样是否足够，今天没有任何人验证过（AC#10）。
4. 每个 Taro 用户都要再写一遍 `currentDemoRuntime()`（[`src/runtime-preflight.ts`](../../../apps/dev-rxdb-miniprogram/src/runtime-preflight.ts)）
   那段按 `TARO_ENV` 选 host 的分支，并且要知道「必须用 `process.env.TARO_ENV` 常量判断，另一平台的全局才会被摇掉」（阶段 B 处理）。

病灶 4 个（症状 1～3 的构建前提与验证缺口 + 症状 4），新增抽象 1 个包（三个入口），满足「病灶数 ≥ 抽象数」。

## 可行性结论（源码实证，Taro 4.2.1 / 4.3.0）

✅ 可行，且 Taro 自身的插件机制足够，不需要再 patch Taro。下面的结论在 Taro 4.2.1 与 4.3.0 的源码上都核实过。

- **挂点存在**：`@tarojs/service` 的 `IPluginContext` 提供 `modifyRunnerOpts`、`modifyViteConfig`、`modifyWebpackChain`、
  `onBuildFinish` 等钩子（读 `node_modules/@tarojs/service/dist/utils/types.d.ts`）。
- **必须用 `modifyRunnerOpts`，不能用 `modifyViteConfig`**：
  - `@tarojs/vite-runner` 的 `dist/index.mini.js` 是先调 `taroConfig.modifyViteConfig?.call(...)`、**不 await**，紧接着
    `yield (0, vite_1.build)(commonConfig)`；而 `@tarojs/cli` 的 `presets/commands/build.js` 把它包成 `ctx.applyPlugins(...)` 的异步调用。
    `Kernel.applyPlugins` 用 tapable `AsyncSeriesWaterfallHook`，只有排第一的钩子会同步执行，排在任何异步钩子之后的修改会和
    `vite.build` 读配置赛跑。
  - `Kernel.run` 里 `modifyRunnerOpts` 是 `yield this.applyPlugins({ name: 'modifyRunnerOpts', opts: { opts: opts.config } })`，
    **被 await**，且拿到的是整份项目配置（`compiler`、`copy`、`outputRoot`），在 runner 启动前完成。
- **平台与编译器在插件里可读**：`process.env.TARO_ENV`（`@tarojs/cli` 的 `cli.js` 在加载插件前按 `--type` 设置，demo 的
  `config/index.ts` 已在用）；`compiler` 可能是字符串或 `{ type, vitePlugins }`，`platform-plugin-base/mini.js` 的 `getRunner()`
  按 `this.compiler === 'vite'` 选 runner；`vitePlugins` 在 `@tarojs/taro` 的类型里是 `any`。
- **插件怎么被加载（Taro 4.3.0 `@tarojs/service` 的 `utils/index.js`）**：`resolve.sync(name, { basedir: appPath })` 定位——只读
  `main`、**不看 `exports`**；随后裸 `require(fPath)`，经 `getModuleDefaultExport` 按 `__esModule` 取默认导出。`createSwcRegister`
  的 `only` 是插件名，匹配不到 node_modules 里的绝对路径，不会转译本包。所以纯 ESM 产物靠 Node 的 `require(esm)` 加载即可：
  Node 20.19+ / 22.12+ 无旗标可用，返回的命名空间在有默认导出时带 `__esModule: true`（Node 24 实测）。前提是 `main` 指向
  dist、入口无顶层 await、`engines.node` 声明 `>=20.19`（Taro 自身声明 `>=18`）。
- **要搬的 glue 改写、realm 两个 vite 插件与 wasm 资产插件已在微信开发者工具、抖音开发者工具、支付宝开发者工具与 iOS 真机走查过**（US-211 阶段 B / C、examples/README.md；
  走查所用构建见 US-211 技术笔记「走查证据对应的构建」），搬迁不改逻辑。
- **仓库已有 npm 安装路径的验证手段**：根 `package.json` 的 `local-registry` target（`@nx/js:verdaccio`）。
- **不需要随插件分发的 Taro patch**：`patches/@tarojs__vite-runner@4.3.0.patch` 的改动一是 copy 静默、二是支付宝平台插件
  新增产物走 `emitFile`，都不在 `weapp` / `tt` 路径上。

## 范围边界

### In Scope

**阶段 A — 构建插件**

- 新包 `packages/rxdb-taro`（`@aiao/rxdb-taro`），纯 ESM，两个 Node 入口：
  - `.`：默认导出 Taro 插件函数 `(ctx) => void`；只经 `ctx.modifyRunnerOpts` 改配置，把 `./vite` 组装的插件追加进
    `compiler.vitePlugins`（`compiler` 为字符串 `'vite'` 时换成对象）
  - `./vite`（实验性）：`miniProgramVitePlugins(platform, appRoot)`，按 `weapp` / `tt` / `alipay` 返回 glue 改写、realm（`tt` /
    `alipay`）、构建目标与资产（`alipay` 另含 wasm 的 base64 副本与随机数 Worker）四类 vite 插件。给支付宝与不走 Taro 插件机制的项目用
- `peerDependencies`：`@tarojs/cli` `4.3.x`（只承诺实测过的版本线）与 `@aiao/rxdb-adapter-miniprogram`。不声明 `@tarojs/service`：
  它是 `@tarojs/cli` 的传递依赖，用户不直接装；插件上下文的类型按结构自定义，不引它的类型
- 构建目标：只在仍是 Taro 写死的 `es6` 时抬到实测过的值（微信、抖音 es2020，支付宝 es2018）；用户经 `compiler.vitePlugins` 设的值不动
- wasm 落点：产物根的 `wa-sqlite/wa-sqlite.wasm`，与 `DEFAULT_WASM_PATH` 和抖音 host 的 `defaultWasmPath` 一致；用 vite `emitFile`，
  与 `outputRoot` 解耦
- Taro 插件的平台 / 编译器白名单：`TARO_ENV ∈ { weapp, tt }` 且编译器为 vite，其余**构建期报错**
- 构建期常量（wasm 源子路径、代码包内路径、支付宝 base64 副本后缀）由本包持有副本，spec 对拍 adapter 的
  `SUBFRAME_WASM_SUBPATH` / `DEFAULT_WASM_PATH` / 抖音 host 的 `defaultWasmPath` / `ALIPAY_WASM_TEXT_COPY_SUFFIX`；adapter 不改
- `apps/dev-rxdb-miniprogram`：weapp / tt 经 `plugins` 用 Taro 插件，alipay 经 `@aiao/rxdb-taro/vite`；删掉
  `config/assets-vite-plugin.ts`、`config/realm-vite-plugin.ts` 与 `config/rxdb-packages-vite-plugin.ts`（glue 改写与构建目标）
- demo 新增 `verify-dist` target：依赖 `build-weapp` / `build-tt`，对产物跑 AC#1～3、AC#5 的断言，由 demo 的 `build` 带起（进 `pnpm test-all`）。
  不叫 `e2e`：CI 按 `--withTarget=e2e` 自动给每个项目开 e2e job，产物断言不需要一个单独的 job
- adapter README「抖音」「打包器注意事项」改成插件用法，「支付宝」一节的 realm 与资产改指向 `./vite`；新包 README 与 TSDoc

**阶段 B — 运行时入口**

- `@aiao/rxdb-taro/runtime` 导出按 `process.env.TARO_ENV` 返回 `{ host, wasmRuntime }` 的函数，取代 demo 的
  `wechatDemoRuntime()` / `douyinDemoRuntime()` 两个分支
- 只认 `weapp` / `tt`，各自直接调 adapter 的宿主工厂；其余 `TARO_ENV` 抛错（`alipay` 指向 adapter README「支付宝」自行组装）。
  `TARO_ENV` 是 Taro 平台名、不是 adapter 平台 id（`weapp` ≠ `wechat`），不能直接交给 `assertMiniProgramPlatformId`

### Out of Scope

- webpack5 编译器：不支持（2026-10-07 决定，原阶段 C 删除）。AC#7 的构建期报错是长期行为，不是过渡状态
- 支付宝进 Taro 插件白名单：还差懒加载分包（`lazyChunkVitePlugin()`）、标签 `var` 提升（`labeledVarHoistVitePlugin()`），以及插件管不到的 `app.config.ts` 的 `workers` 与 `project.alipay.json`
  的 `compileOptions.transpile`。另立故事
- 百度 / QQ / 京东：未登记，插件不为它们开任何构建路径
- Taro H5 / RN / 鸿蒙：H5 应走 `rxdb-adapter-wa-sqlite` 等浏览器 adapter，不在本故事
- Taro 3.x 与 4.3 以外的版本：不声明，等有人实测再放宽 peer 范围
- `@aiao/rxdb-react` / `@aiao/rxdb-vue` 在 Taro 运行时里的 hook 兼容性：另立故事
- wasm 放分包、代码包体积优化：不在本故事
- 任何 adapter 运行时行为、平台口径、能力上限的变化

### 三框架对称说明

本包是构建工具插件，框架无关；Taro 只支持 React / Vue / Preact / Solid，**不支持 Angular**，所以没有 Angular 半边可做。
阶段 B 的运行时入口不依赖任何 UI 框架。React 与 Vue 两种 Taro 模板都要能用（AC#10）。

## 验收标准

### 阶段 A — 构建插件

AC#1～3、AC#5 在 demo 产物上由 `dev-rxdb-miniprogram:verify-dist` 断言（demo 其余插件不碰 wasm、`import.meta` 与 realm）；
「无其他 rxdb 相关配置」的干净项目由 AC#10 覆盖。

| #   | 前置条件                                                                                       | 操作                                                                                     | 预期结果                                                                                                                                                                            | 状态 |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Taro 4.3.0 vite 项目，`plugins` 含 `'@aiao/rxdb-taro'`                                         | `taro build --type weapp`                                                                | 产物根有 `wa-sqlite/wa-sqlite.wasm`，字节与 adapter 依赖的 `@subframe7536/sqlite-wasm/wasm` 相同                                                                                    | ✅   |
| 2   | 同上，`outputRoot: 'dist-tt'`                                                                  | `taro build --type tt`                                                                   | wasm 落在 `dist-tt/wa-sqlite/wa-sqlite.wasm`，不出现 `dist-tt/dist/`                                                                                                                | ✅   |
| 3   | 同 #1、#2                                                                                      | 扫描产物所有 `.js`                                                                       | 不含 `import.meta`；不含 wasm 的 base64 内联（无 `AGFzbQ` 开头的长串）                                                                                                              | ✅   |
| 4   | 构建目标仍是 Taro 写死的 `es6` / 用户经 `compiler.vitePlugins` 设了别的值                      | 单测检查插件返回的 vite 插件；Taro 官方模板（vite 4）真实构建                            | `es6` 时抬到 es2020（weapp / tt）/ es2018（alipay），其余值不动；官方模板只加本插件即可构建（AC#10）                                                                                | ✅   |
| 5   | 同 #2                                                                                          | 构建 tt                                                                                  | 与改前 `realmVitePlugin('tt')` 产物等价：产物有 `rxdb-realm.js`，`app.js` 开头登记 realm，其余用到的 chunk 开头取 realm，产物里没有自由的 `globalThis`                              | ✅   |
| 6   | `TARO_ENV` 为 `alipay` / `swan` / `qq` / `jd` / `h5` / `rn` / `harmony-hybrid`                 | 构建                                                                                     | 构建期报错，列出支持的 `weapp` / `tt` 并指向可行性矩阵；`alipay` 另指向 `@aiao/rxdb-taro/vite`；不存在「什么都不做继续构建」的分支                                                  | ✅   |
| 7   | `compiler: 'webpack5'`（或缺省即 webpack5）                                                    | 构建                                                                                     | 构建期报错，说明只支持 vite 编译器                                                                                                                                                  | ✅   |
| 8   | `plugins` 里本插件排在一个带异步 `modifyViteConfig` 的插件之后                                 | 构建 weapp                                                                               | #1～#3 结果不变（证明走的是被 await 的 `modifyRunnerOpts`）。单测钉住「只注册 `modifyRunnerOpts`」，真实构建做一次并记进技术笔记                                                    | ✅   |
| 9   | demo 改用插件                                                                                  | `pnpm nx run dev-rxdb-miniprogram:build`（带起 `verify-dist`）                           | 三个平台构建与产物断言绿；`config/` 里被搬走的插件已删除；微信、抖音、支付宝开发者工具走查结果与改前一致（CRUD、重连、启动持久化自检全部 passed）                                   | ⚠️   |
| 10  | `local-registry` 起 verdaccio 并发布本仓库包；`taro init` 新建 React 与 Vue 两个 vite 模板项目 | 只经 npm 安装 `@aiao/rxdb`、adapter、`@aiao/rxdb-taro`，按 README 接入，构建 weapp 与 tt | 两个项目在微信与抖音开发者工具里建库、读写、重开通过。若因类私有成员失败，插件补上对 `@aiao/*` 产物的转换并在技术笔记写明原因；若不需要，在技术笔记写明「npm 路径不需要」及复验方式 | ⬜   |
| 11  | —                                                                                              | `pnpm nx run-many -t lint test build --projects=rxdb-taro`                               | 零警告；单测用伪 `ctx` 覆盖 #4、#6、#7、#8 与钩子注册，覆盖率 ≥ 80%；公开导出全部有 TSDoc                                                                                           | ✅   |
| 12  | `./vite` 子路径                                                                                | 单测 `miniProgramVitePlugins` 三个平台                                                   | weapp：glue + 构建目标 + 资产；tt / alipay：再加 realm；alipay 资产（另发 base64 副本与 Worker）；本包常量与 adapter 对拍一致                                                       | ✅   |
| 13  | 发布产物                                                                                       | `node -e "require('@aiao/rxdb-taro')"` 于 Node 20.19+；读 README                         | 拿到的命名空间 `__esModule` 为真、`default` 是函数；adapter README「抖音」「打包器注意事项」不再指向 `apps/`，「支付宝」的 realm 与资产指向 `./vite`                                | ✅   |

### 阶段 B — 运行时入口

| #   | 前置条件                  | 操作                                                               | 预期结果                                                                                                                        | 状态 |
| --- | ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 14  | weapp 生产构建            | 调用运行时入口；扫描产物                                           | 返回微信 host 与 `WXWebAssembly`；产物里没有对抖音全局的自由引用（`typeof tt`、标识符 `TTWebAssembly`；字符串不算，见技术笔记） | ✅   |
| 15  | tt 生产构建               | 调用运行时入口；扫描产物                                           | 返回抖音 host 与 `TTWebAssembly`；产物里没有对微信全局的自由引用（`typeof wx`、标识符 `WXWebAssembly`）                         | ✅   |
| 16  | 运行时缺 `wx` / `tt` 全局 | 调用运行时入口                                                     | 抛错点名缺失的全局，不回退到另一平台                                                                                            | ✅   |
| 17  | demo                      | 删除 `wechatDemoRuntime()` / `douyinDemoRuntime()`，改用运行时入口 | AC#9 的走查结果不变                                                                                                             | ⚠️   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

### 包名与入口

- 叫 `@aiao/rxdb-taro`，对齐 `rxdb-angular` / `rxdb-react` / `rxdb-vue` 的「rxdb-<宿主框架>」命名；**不叫** `rxdb-plugin-taro`——
  `rxdb-plugin-*` 在本仓库专指实现 `IRxDBPlugin` 的 RxDB 插件，混用会让读者以为它能 `rxdb.use()`。
- 三个入口运行环境不同：`.` 与 `./vite`（Node，加载方式见「可行性结论」）与 `./runtime`（小程序逻辑层，阶段 B）。
  `./runtime` 不得引入 Node 内置模块；`.` / `./vite` 不得引入 adapter 的任何运行时入口（会拖进 sqlite-core / comlink），
  构建产物把 `node:` 内建全部外置。

### 从 demo 搬什么、不搬什么

| demo 里的东西                                          | 去向                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `subframeSqliteWasmVitePlugin()`                       | 搬进 `./vite`，逻辑不改                                                               |
| `realmVitePlugin()`                                    | 搬进 `./vite`，逻辑不改；Taro 插件只在 `tt` 挂，demo 的 alipay 经 `./vite` 挂         |
| `miniProgramAssetsVitePlugin()`                        | 搬进 `./vite`，逻辑不改；app 根由 Taro 插件取 `ctx.paths.appPath`                     |
| `rxdbBuildTargetVitePlugin()`                          | 搬进 `./vite`，只在 Taro 写死的 `es6` 时生效（AC#4，2026-10-07 改判）                 |
| `noBabelVitePlugin()`                                  | 不搬：npm 路径带着 Taro 的 babel 也能构建、运行（AC#10），去 babel 是 demo 自己的选择 |
| `lazyChunkVitePlugin()`、`labeledVarHoistVitePlugin()` | 不搬，留在 demo：支付宝进 Taro 插件白名单时另议（Out of Scope）                       |

### 阶段 A 的验证证据

- **产物与改前逐字节一致。** 改前（demo 本地插件）与改后（weapp / tt 经 Taro 插件、alipay 经 `./vite`）各构建一次三个平台，
  `diff -rq` 无差异、文件数相同（weapp 18 / tt 16 / alipay 18）。所以 AC#9 的走查结论沿用 US-211 的走查（CRUD、重连、启动持久化
  自检），本次没有重新打开开发者工具；AC#9 记 ⚠️ 直到有人重走一遍。
- **AC#8 真实构建**：在 `plugins` 里本插件之前插一个 `modifyViteConfig` 里 `await` 500 ms 的本地插件，weapp / tt 构建日志里该钩子
  执行了，产物仍与基线逐字节一致。单测钉住「只注册 `modifyRunnerOpts`」防回退。
- **`verify-dist` 能抓回退**：从 `plugins` 拿掉本插件后构建，7 条断言全红（wasm 缺失、`import.meta` 残留、realm 未绑定）。
- **加载实测（AC#13）**：按 Taro 的方式（`resolve.sync` + 裸 `require` + `getModuleDefaultExport`）在 Node 20.20 / 22.22 / 24.18 /
  26.7 上拿到默认导出函数；Node 18.20 报 `ERR_REQUIRE_ESM`，与 `engines.node >=20.19` 一致。
- **单测**：48 条，覆盖率四项 100%。「app 根解析不到 adapter」在 pnpm 环境里构造不出来（bin shim 注入的 `NODE_PATH`
  兜底能解析到），改为在临时目录造假 app（假 adapter 自带假 wasm）正向断言解析链。

### 阶段 B 的验证证据

- `@aiao/rxdb-taro/runtime` 导出 `taroMiniProgramRuntime()`，10 条单测覆盖两平台、缺全局、缺 WASM 运行时与其余平台；
  构建产物 `dist/runtime.js` 保留字面量 `process.env.TARO_ENV`（vite lib 模式不替换），只依赖 adapter `/runtime`。
- demo 删掉 `wechatDemoRuntime()` / `douyinDemoRuntime()`，`currentDemoRuntime()` 只留支付宝分支，其余交给运行时入口。
- `verify-dist` 新增 4 条 AC#14/15 断言。反向验证：把入口的判断改成经变量中转（`const env = process.env`），Taro 的 define
  替换不到，weapp / tt 各红一条；还原后全绿。
- **adapter `/runtime` 补导出 `MiniProgramWasmRuntime` 类型**（纯类型、增量）。起因：demo 经 project reference 读本包 d.ts 时，
  用的是本包的编译选项（带 `@aiao/source` 条件），本包 d.ts 若引 adapter 主入口，会被解析到 adapter 的 src，而 demo 自己解析到
  dist，两份带 `#private` 的 adapter 类互不兼容（TS2345）。所以本包运行时入口只引 adapter `/runtime`，**不要引 adapter 主入口**。
- AC#17 记 ⚠️：开发者工具走查与 AC#9 一起做。

### AC#10 npm 安装路径的验证证据

- **发布**：临时 verdaccio（`@aiao/*` 不设 uplink，npm 上已有 0.0.26，避免混用线上旧包），`nx release publish` 发到本地；
  `@aiao/rxdb-adapter-pglite` 超过 verdaccio 默认 10 MB 被拒（413），依赖它的包随之跳过，都不在小程序 adapter 的依赖闭包里。
  已发包的 `workspace:*` 都改写成了 `0.0.26`，项目锁文件里的 integrity 与本地源一致。
- **项目**：Taro 4.3.0 CLI 内置默认模板（React、Vue3 各一个；vite + TS + Sass；微信、抖音），等价于 `taro init` 选「CLI 内置默认模板」。
  交互式选择在 expect 下不稳，改为直接调 CLI 的 `Project.write()` 传同样的参数。pnpm 安装，只装 `@aiao/rxdb`、adapter、`@aiao/rxdb-taro`。
  接入只有三处：`plugins` 加 `'@aiao/rxdb-taro'`；tt 产物单独目录；页面里经 `@aiao/rxdb-taro/runtime` 取宿主后建库、写一条、读回。
- **发现一：es6 构建失败** → 构建目标插件（见症状 2）。修复后两个项目只加一行插件即可构建 weapp / tt。
- **发现二（与本包无关）**：React 模板在 pnpm 下找不到 `@babel/plugin-proposal-decorators`。纯模板、不装任何 rxdb 包时同样失败，
  是 Taro 模板 + pnpm 严格隔离的问题；补装 `@babel/plugin-proposal-decorators@^7` 即可（装成 8.x 会报 `version` 选项缺失）。
- **不需要私有成员转换**：带着 Taro 的 babel、es2020 目标构建，产物在微信开发者工具里正常运行，插件不另做转换。
- **产物断言**：`VERIFY_DIST_APP_ROOT` 指向两个项目跑 `verify-dist` 同一套 11 条断言，全绿。
- **微信开发者工具**：`miniprogram-automator` 启动 → 读页面写进 storage 的检查结果 → 关闭 → 再启动。React、Vue 两个项目都是
  建库成功、写入后读回 +1、重开后读到上次的记录数（adapter 回到 `@subframe7536/sqlite-wasm` 1.3.1 后重测，SQLite 3.53.2）。
- **抖音开发者工具**：待手工走查（`dist-tt/`，测试 AppID）。
- **demo 微信走查（AC#9 / AC#17 的微信半边，2026-10-07）**：`pnpm nx e2e-devtools dev-rxdb-miniprogram-e2e` 在阶段 A+B 代码上 16 条通过
  （运行时引导、CRUD、断开重连、跨启动持久化、安全随机池）；抖音、支付宝待手工走查。

### iOS 微信真机初始化失败（随本 PR 修复，不属本故事范围）

走查时 iOS 微信真机报 `WXWebAssembly 无法实例化 wa-sqlite/wa-sqlite.wasm: undefined is not an object (evaluating 'e.$e.value')`。
根因在 #88 的依赖升级：adapter 的 `@subframe7536/sqlite-wasm` 从 1.3.1 升到 1.4.0，新 glue 把 `_sqlite3_version` 改成读 wasm
导出的 Global（`wasmExports["$e"].value`），而 iOS 的 `WXWebAssembly` 不导出 Global；开发者工具模拟器是标准 WebAssembly，测不出来。
`_sqlite3_version` 在仓库里无人使用。修复：小程序 adapter、demo、`wa-sqlite-integrity` 审计与支付宝 wasm 指纹回到 1.3.1
（US-211 真机证据跑的就是这个版本），浏览器用的 `rxdb-adapter-sqlite-wasm` 不动；adapter 新增
`subframe-glue-exported-globals.spec.ts` 门禁，glue 里出现读导出 Global 的代码就红（在 1.4.0 上实测为红）。
iOS 真机复验待做。

### 阶段 B 的判据为什么按标识符

2026-10-07 实测：改造前的 weapp 产物 `dist/common.js` 就带抖音、支付宝宿主工厂的字符串（`"TTWebAssembly"`、
`"tt.getFileSystemManager"`、`"my.getFileSystemManager"`），而 demo 自己的平台分支已被摇掉（`没有全局 tt` 文案不在产物里）。
这些字符串来自 adapter 入口，与运行时入口无关；它们只占体积，不会在另一平台上触发 ReferenceError。真机风险来自对另一平台全局的
**自由引用**，所以 AC#14/15 只判这个。裸 `tt.` / `wx.` 不作判据：压缩器会把局部变量命名成 `tt`、`wx`（产物里有 `function tt(e)`、`IR(wx,…)`），
正则分不出自由引用与局部变量；平台代码读全局前都要 `typeof` 判，所以 `typeof tt` 与 `TTWebAssembly` 这类长标识符足以兜住。宿主工厂能否被摇掉留给 adapter 另议，不在本故事。

### 已知风险

- **钩子时序**：见「可行性结论」。实现里禁止用 `ctx.modifyViteConfig`，AC#8 防回退。
- **Taro 升级**：`modifyRunnerOpts` 拿到的配置形状不是 Taro 的公开文档化契约。peer 范围锁 `4.3.x`，升级 Taro 时 AC#9 / AC#10 重跑。
- **装饰器**：demo 源码不用装饰器，构建也不经 babel。用户项目若用装饰器，其 babel 配置归用户项目，插件不代管，只在 README 写明。

## 实现文件

| 阶段 | 文件                                                                                                                | 描述                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| A    | `packages/rxdb-taro/`                                                                                               | 新包：Taro 插件入口、`./vite`（glue 改写、realm、资产）、单测   |
| A    | [`apps/dev-rxdb-miniprogram/config/`](../../../apps/dev-rxdb-miniprogram/config/)                                   | 改用插件，删除被搬走的实现；`verify-dist` 产物断言（`verify/`） |
| A    | [`packages/rxdb-adapter-miniprogram/README.md`](../../../packages/rxdb-adapter-miniprogram/README.md)               | 构建说明改指向插件                                              |
| B    | `packages/rxdb-taro/src/runtime.ts`、`packages/rxdb-adapter-miniprogram/src/runtime.ts`（补导出类型）               | 运行时入口                                                      |
| B    | [`apps/dev-rxdb-miniprogram/src/runtime-preflight.ts`](../../../apps/dev-rxdb-miniprogram/src/runtime-preflight.ts) | 删微信、抖音分支，改用运行时入口                                |

## References

- [US-209 微信小程序 wa-sqlite 适配器](./US-209-miniprogram-adapter.md)
- [US-211 多端小程序宿主](./US-211-multi-miniprogram-platforms.md)
- [小程序平台可行性矩阵](./miniprogram-platform-feasibility.md)
- [Taro 插件功能](https://docs.taro.zone/docs/plugin)
- [Taro 插件 API（编译阶段钩子）](https://docs.taro.zone/docs/plugin-custom)
