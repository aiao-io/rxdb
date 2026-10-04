---
id: US-219
title: Taro 插件一行接入小程序 adapter 的构建配置
status: Backlog
priority: Medium
epic: epic-004-future-features
created: 2026-10-04
updated: 2026-10-04
tags: [adapter, miniprogram, taro, build, vite, wechat, douyin, experimental]
---

<!--
INVEST 检查清单:
- [x] Independent: 只依赖已 Done 的 US-209 与 US-211 阶段 B 已登记的 `douyin`；不改 adapter 运行时行为
- [x] Negotiable: 运行时入口要不要做可谈；阶段 C 价值待证
- [x] Valuable: 今天 npm 用户只能照抄 monorepo 里未发布的 demo 配置，抄错全在开发者工具 / 真机上才炸
- [x] Estimable: 阶段 A 是把 demo 里两个已验证的 vite 插件 + 一条 copy 规则搬进可发布包
- [x] Small: 阶段 A 一个迭代；B / C 各自独立
- [x] Testable: 构建产物可断言（wasm 位置、无 base64 内联、无 `import.meta`、realm 绑定），另有 local-registry 真实安装路径
-->

# 用户故事：Taro 插件一行接入小程序 adapter 的构建配置

> 本故事**不扩大支持面**。平台口径继承 [US-209](./US-209-miniprogram-adapter.md) 与
> [US-211](./US-211-multi-miniprogram-platforms.md)：只有微信与抖音（抖音实验性、Android 未验证），实验性、单连接、无崩溃恢复。
> 插件只把「adapter 已经能跑的平台」的构建前提从 demo 搬进可发布包。

## 交付阶段

| 阶段 | 状态 | 交付                                                                                     | AC 区段   | 门禁                                    |
| ---- | ---- | ---------------------------------------------------------------------------------------- | --------- | --------------------------------------- |
| A    | ⬜   | `@aiao/rxdb-taro` 构建插件：vite 编译器、`weapp` / `tt`；demo 改用插件；npm 安装路径实测 | AC#1～11  | 无（US-209 Done，`douyin` 已登记）      |
| B    | ⬜   | `@aiao/rxdb-taro/runtime`：按 `TARO_ENV` 取 host 与 WASM 运行时，另一平台分支构建期摇掉  | AC#12～15 | 阶段 A                                  |
| C    | ⬜   | webpack5 编译器支持                                                                      | AC#16～17 | 阶段 A + **价值待证**：有用户报告才开工 |

## 作为/我想要/以便

**作为** 用 Taro 4（vite 编译器）同时打微信与抖音小程序、从 npm 安装 `@aiao/rxdb-adapter-miniprogram` 的开发者
**我想要** 在 `config/index.ts` 的 `plugins` 里加一行 `'@aiao/rxdb-taro'` 就完成 wasm 拷贝、glue 改写与抖音全局对象绑定
**以便** 不必从 monorepo 的 demo 里照抄一百多行构建插件，并且平台或编译器不对时**构建期就失败**，而不是在开发者工具或真机上才报错

## 今天就能踩到的症状

1. **README 指向一个不发布的文件。** adapter README「抖音」一节写「Taro（Vite）的做法见 `apps/dev-rxdb-miniprogram` 的
   `config/rxdb-packages-vite-plugin.ts`」，「打包器注意事项」一节也指向它；而
   [adapter 的 package.json](../../../packages/rxdb-adapter-miniprogram/package.json) `files` 只有 `dist` / `src`。
   npm 用户能拿到的只有文字说明。（复验：读 README 两节与 `files` 字段。）
2. **三个构建前提，漏任何一个都是运行期才暴露**，全部只活在
   [`config/rxdb-packages-vite-plugin.ts`](../../../apps/dev-rxdb-miniprogram/config/rxdb-packages-vite-plugin.ts) 与
   [`config/index.ts`](../../../apps/dev-rxdb-miniprogram/config/index.ts)：

   | 前提                           | demo 里的实现                    | 漏掉的后果（出处）                                                                                                                   |
   | ------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
   | wasm 拷进代码包根              | `copy.patterns` 一条             | `to` 不带 outputRoot 时 tt 产物落进 `dist-tt/dist/`（`config/index.ts` 注释）；完全漏掉则建库时找不到 wasm                           |
   | 抹掉 glue 的 `import.meta.url` | `subframeSqliteWasmVitePlugin()` | 小程序没有 `import.meta`；vite 还会把 727 KB wasm 以 base64 内联，代码包多约 1 MB（adapter README「打包器注意事项」）                |
   | 抖音产物绑定真实全局对象       | `douyinRealmVitePlugin()`        | 抖音模块里 `globalThis` 为 `undefined`，comlink 模块顶层 `'FinalizationRegistry' in globalThis` 一加载就 TypeError（README「抖音」） |

   `build.target` **不算前提，插件跟随 Taro**：`@tarojs/vite-runner` 的 `taro:vite-mini-config` 插件写死 `target: 'es6'`，
   Taro 配置不暴露该项。es6 下 esbuild 把 RxDB 栈的 BigInt 字面量改写成 `BigInt("…")` 并告警，运行行为不变（adapter 本就要求原生
   BigInt）。demo 的 `rxdbBuildTargetVitePlugin()` 只为消告警，是 app 自己的选择。

3. **demo 的私有成员转换对 npm 用户是空操作。** `rxdbPackagesVitePlugin()` 只匹配路径同时含 `/packages/` 与 `/dist/` 的文件
   （`isLinkedPackageDist`），pnpm 装进 `node_modules/.pnpm/@aiao+rxdb@…/` 的产物不命中。它在 npm 安装路径下**是否需要**没有任何记录
   ——引入它的提交（`afdcfc96`）也没写原因。**推断**：今天没有任何人验证过「从 npm 安装 + Taro 构建」这条路。
4. 每个 Taro 用户都要再写一遍 `currentDemoRuntime()`（[`src/runtime-preflight.ts`](../../../apps/dev-rxdb-miniprogram/src/runtime-preflight.ts)）
   那段按 `TARO_ENV` 选 host 的分支，并且要知道「必须用 `process.env.TARO_ENV` 常量判断，另一平台的全局才会被摇掉」（阶段 B 处理）。

病灶 4 个（症状 1～3 的构建前提与验证缺口 + 症状 4），新增抽象 1 个包（两个入口），满足「病灶数 ≥ 抽象数」。

## 可行性结论（源码实证，Taro 4.2.1）

✅ 可行，且 Taro 自身的插件机制足够，不需要再 patch Taro。

- **挂点存在**：`@tarojs/service` 的 `IPluginContext` 提供 `modifyRunnerOpts`、`modifyViteConfig`、`modifyWebpackChain`、
  `onBuildFinish` 等钩子（读 `node_modules/@tarojs/service/dist/utils/types.d.ts`）。
- **必须用 `modifyRunnerOpts`，不能用 `modifyViteConfig`**：
  - `@tarojs/vite-runner` 的 `dist/index.mini.js` 是先调 `taroConfig.modifyViteConfig?.call(...)`、**不 await**，紧接着
    `yield (0, vite_1.build)(commonConfig)`；而 `@tarojs/cli` 的 `presets/commands/build.js` 把它包成 `ctx.applyPlugins(...)` 的异步调用。
    `Kernel.applyPlugins` 用 tapable `AsyncSeriesWaterfallHook`，只有排第一的钩子会同步执行，排在任何异步钩子之后的修改会和
    `vite.build` 读配置赛跑。
  - `Kernel.run` 里 `modifyRunnerOpts` 是 `yield this.applyPlugins({ name: 'modifyRunnerOpts', opts: { opts: opts.config } })`，
    **被 await**，且拿到的是整份项目配置（`compiler`、`copy`、`outputRoot`），在 runner 启动前完成。
- **平台与编译器在插件里可读**：`process.env.TARO_ENV`（demo 的 `config/index.ts` 已在用）；`compiler` 可能是字符串或
  `{ type, vitePlugins }`，`platform-plugin-base/mini.js` 的 `getRunner()` 按 `this.compiler === 'vite'` 选 runner。
- **要搬的两个 vite 插件与 wasm copy 规则已在微信开发者工具、抖音开发者工具与 iOS 真机走查过**（US-211 阶段 B、examples/README.md 抖音一行），
  搬迁不改逻辑。
- **仓库已有 npm 安装路径的验证手段**：根 `package.json` 的 `local-registry` target（`@nx/js:verdaccio`）。
- **不需要随插件分发的 Taro patch**：`patches/@tarojs__vite-runner@4.2.1.patch` 两处改动一是 copy 静默、二是支付宝平台插件
  新增产物走 `emitFile`，都不在 `weapp` / `tt` 路径上。

## 范围边界

### In Scope

**阶段 A — 构建插件**

- 新包 `packages/rxdb-taro`（`@aiao/rxdb-taro`），默认导出 Taro 插件函数 `(ctx, options) => void`；`peerDependencies` 声明
  `@tarojs/service` / `@tarojs/cli` `4.2.x`（只承诺实测过的版本线）与 `@aiao/rxdb-adapter-miniprogram`
- 只经 `ctx.modifyRunnerOpts` 改配置；插入 subframe glue 改写、抖音 realm 两个 vite 插件，以及 wasm 资产
- 不读不写 `build.target`：跟随 Taro 默认（4.2.1 为 `es6`）或用户自己经 `compiler.vitePlugins` 的覆盖
- wasm 落点：产物根的 `wa-sqlite/wa-sqlite.wasm`，与 `DEFAULT_WASM_PATH` 和抖音 host 的 `defaultWasmPath` 一致；不依赖 `copy.patterns` 的 `to`
  前缀语义（用 vite `emitFile` 或等价方式，与 `outputRoot` 解耦）
- 平台 / 编译器白名单：`TARO_ENV ∈ { weapp, tt }` 且编译器为 vite，其余**构建期报错**
- 构建期常量（wasm 源子路径、代码包内路径）与 adapter 单一真相源：adapter 新增 Node 可安全导入的子路径，
  或插件持有副本并由 spec 对拍 `SUBFRAME_WASM_SUBPATH` / `DEFAULT_WASM_PATH`（实现时二选一）
- `apps/dev-rxdb-miniprogram` 的 weapp / tt 构建改用插件，删掉被搬走的插件与 copy 规则
- adapter README 两处「见 apps/…」改成插件用法；新包 README 与 TSDoc

**阶段 B — 运行时入口**

- `@aiao/rxdb-taro/runtime` 导出按 `process.env.TARO_ENV` 返回 `{ host, wasmRuntime }` 的函数，取代 demo 的 `currentDemoRuntime()`
- 未登记平台直接交给 adapter 的 `assertMiniProgramPlatformId` 判定，不自建平台表

**阶段 C — webpack5（价值待证）**

- `compiler: 'webpack5'` 下用 `modifyWebpackChain` 等价实现阶段 A 的三件事（wasm 资产、glue 改写、抖音 realm）

### Out of Scope

- 支付宝 / 百度 / QQ / 京东：可行性矩阵判 `unsupported` 或未登记，插件不为它们开任何构建路径（demo 的 `build-alipay` 拒绝路径仍由 app 自己配置）
- Taro H5 / RN / 鸿蒙：H5 应走 `rxdb-adapter-wa-sqlite` 等浏览器 adapter，不在本故事
- Taro 3.x 与 4.2 以外的 4.x：不声明，等有人实测再放宽 peer 范围
- `@aiao/rxdb-react` / `@aiao/rxdb-vue` 在 Taro 运行时里的 hook 兼容性：另立故事
- wasm 放分包、代码包体积优化：不在本故事
- 任何 adapter 运行时行为、平台口径、能力上限的变化

### 三框架对称说明

本包是构建工具插件，框架无关；Taro 只支持 React / Vue / Preact / Solid，**不支持 Angular**，所以没有 Angular 半边可做。
阶段 B 的运行时入口不依赖任何 UI 框架。React 与 Vue 两种 Taro 模板都要能用（AC#10）。

## 验收标准

### 阶段 A — 构建插件

| #   | 前置条件                                                                                       | 操作                                                                               | 预期结果                                                                                                                                                                      | 状态 |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | Taro 4.2.1 vite 项目，`plugins: ['@aiao/rxdb-taro']`，无其他 rxdb 相关配置                     | `taro build --type weapp`                                                          | 产物根有 `wa-sqlite/wa-sqlite.wasm`，字节与 `@subframe7536/sqlite-wasm/dist/wa-sqlite.wasm` 相同                                                                              | ⬜   |
| 2   | 同上，`outputRoot: 'dist-tt'`                                                                  | `taro build --type tt`                                                             | wasm 落在 `dist-tt/wa-sqlite/wa-sqlite.wasm`，不出现 `dist-tt/dist/`                                                                                                          | ⬜   |
| 3   | 同 #1                                                                                          | 扫描产物所有 `.js`                                                                 | 不含 `import.meta`；不含 wasm 的 base64 内联（无 `AGFzbQ` 开头的长串）                                                                                                        | ⬜   |
| 4   | 用户未设 target / 经 `compiler.vitePlugins` 自行覆盖 target                                    | 构建 weapp，与不装插件的同配置构建对比                                             | 两种情况下产物 target 都与不装插件时相同（插件不读不写 `build.target`）；未设时 BigInt 改写告警属预期，构建成功                                                               | ⬜   |
| 5   | 同 #2                                                                                          | 构建 tt                                                                            | 与 demo 现行 `douyinRealmVitePlugin()` 产物等价：产物有 `rxdb-realm.js`，`app.js` 开头登记 realm，其余用到的 chunk 开头取 realm；`app.js` 带 `use strict` 时构建失败          | ⬜   |
| 6   | `TARO_ENV` 为 `alipay` / `swan` / `qq` / `jd` / `h5` / `rn` / `harmony-hybrid`                 | 构建                                                                               | 构建期报错，列出支持的 `weapp` / `tt` 并指向 [可行性矩阵](./miniprogram-platform-feasibility.md)；不存在「什么都不做继续构建」的分支                                          | ⬜   |
| 7   | `compiler: 'webpack5'`（或缺省即 webpack5）                                                    | 构建                                                                               | 构建期报错，说明只支持 vite 编译器                                                                                                                                            | ⬜   |
| 8   | `plugins` 里本插件排在一个带异步 `modifyViteConfig` 的插件之后                                 | 构建 weapp                                                                         | #1～#3、#5 结果不变（证明走的是被 await 的 `modifyRunnerOpts`）                                                                                                               | ⬜   |
| 9   | demo 改用插件                                                                                  | `pnpm nx run dev-rxdb-miniprogram:build` 与 `:build-tt`                            | 两个 target 绿；`config/rxdb-packages-vite-plugin.ts` 里被搬走的插件已删除；微信开发者工具与抖音开发者工具走查结果与改前一致（CRUD、重连、启动持久化自检全部 passed）         | ⬜   |
| 10  | `local-registry` 起 verdaccio 并发布本仓库包；`taro init` 新建 React 与 Vue 两个 vite 模板项目 | 只经 npm 安装 `@aiao/rxdb`、adapter、`@aiao/rxdb-taro`，按 README 接入，构建 weapp | 两个项目在微信开发者工具里建库、读写、重开通过。若因类私有成员失败，插件补上对 `@aiao/*` 产物的转换并在技术笔记写明原因；若不需要，在技术笔记写明「npm 路径不需要」及复验方式 | ⬜   |
| 11  | —                                                                                              | `pnpm nx run-many -t lint test build --projects=rxdb-taro`                         | 零警告；单测用伪 `ctx` 覆盖 #4、#6、#7 与钩子注册，覆盖率 ≥ 80%；公开导出全部有 TSDoc；adapter README 不再出现指向 `apps/` 的构建说明                                         | ⬜   |

### 阶段 B — 运行时入口

| #   | 前置条件                  | 操作                                                           | 预期结果                                                                                    | 状态 |
| --- | ------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---- |
| 12  | weapp 构建                | 调用运行时入口                                                 | 返回微信 host 与 `WXWebAssembly`；产物里不含 `TTWebAssembly`、`createDouyinMiniProgramHost` | ⬜   |
| 13  | tt 构建                   | 调用运行时入口                                                 | 返回抖音 host 与 `TTWebAssembly`；产物里不含 `WXWebAssembly`、`createWechatMiniProgramHost` | ⬜   |
| 14  | 运行时缺 `wx` / `tt` 全局 | 调用运行时入口                                                 | 抛错点名缺失的全局，不回退到另一平台                                                        | ⬜   |
| 15  | demo                      | 删除 `currentDemoRuntime()` 及两个平台分支函数，改用运行时入口 | AC#9 的走查结果不变                                                                         | ⬜   |

### 阶段 C — webpack5（价值待证）

| #   | 前置条件                         | 操作            | 预期结果                                         | 状态 |
| --- | -------------------------------- | --------------- | ------------------------------------------------ | ---- |
| 16  | 有用户报告 webpack5 项目需要接入 | —               | 在本节记下报告出处，解除价值待证后才开工         | ⬜   |
| 17  | webpack5 Taro 项目               | 构建 weapp / tt | AC#1～#5 的产物断言全部成立；AC#7 的报错随之删除 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

### 包名与入口

- 叫 `@aiao/rxdb-taro`，对齐 `rxdb-angular` / `rxdb-react` / `rxdb-vue` 的「rxdb-<宿主框架>」命名；**不叫** `rxdb-plugin-taro`——
  `rxdb-plugin-*` 在本仓库专指实现 `IRxDBPlugin` 的 RxDB 插件，混用会让读者以为它能 `rxdb.use()`。
- 两个入口运行环境不同：`.`（Taro 插件，Node，CJS/ESM 都要能被 `@tarojs/service` 加载——实现前先确认 Taro 4.2.1 怎么 `require` 插件）
  与 `./runtime`（小程序逻辑层，阶段 B）。`./runtime` 不得引入 Node 内置模块，`.` 不得在模块顶层引入 adapter 主入口
  （会拖进 sqlite-core / comlink）。

### 从 demo 搬什么、不搬什么

| demo 里的东西                       | 去向                                                            |
| ----------------------------------- | --------------------------------------------------------------- |
| `subframeSqliteWasmVitePlugin()`    | 搬进插件，逻辑不改                                              |
| `rxdbBuildTargetVitePlugin()`       | 不搬，留在 demo：插件跟随 Taro 的 target（AC#4）                |
| `douyinRealmVitePlugin()`           | 搬进插件，逻辑不改，只在 `TARO_ENV === 'tt'` 挂                 |
| `copy.patterns` 的 wasm 规则        | 改成插件内 `emitFile`，消掉 outputRoot 前缀那个坑               |
| `rxdbPackagesVitePlugin()`          | 先不搬：它只对 workspace link 生效。npm 路径要不要由 AC#10 决定 |
| alipay 的 `es2018` target 与空 copy | 留在 demo：支付宝不在插件白名单，拒绝路径是 demo 自己的事       |

### 已知风险

- **钩子时序**：见「可行性结论」。实现里禁止用 `ctx.modifyViteConfig`，AC#8 防回退。
- **Taro 升级**：`modifyRunnerOpts` 拿到的配置形状不是 Taro 的公开文档化契约。peer 范围锁 `4.2.x`，升级 Taro 时 AC#9 / AC#10 重跑。
- **装饰器**：demo 的 `project.json` 记录了 watch 模式下 `@babel/plugin-proposal-decorators` 必须进 app 的 devDependencies。
  这是用户项目的 babel 配置，插件不代管，只在 README 写明。

## 实现文件

| 阶段 | 文件                                                                                                                | 描述                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| A    | `packages/rxdb-taro/`                                                                                               | 新包：Taro 插件入口、两个 vite 插件与 wasm 资产、单测 |
| A    | [`apps/dev-rxdb-miniprogram/config/`](../../../apps/dev-rxdb-miniprogram/config/)                                   | 改用插件，删除被搬走的实现                            |
| A    | [`packages/rxdb-adapter-miniprogram/README.md`](../../../packages/rxdb-adapter-miniprogram/README.md)               | 构建说明改指向插件                                    |
| A    | `packages/rxdb-adapter-miniprogram/`（可选）                                                                        | Node 可安全导入的构建常量子路径                       |
| B    | `packages/rxdb-taro/src/runtime.ts`                                                                                 | 运行时入口                                            |
| B    | [`apps/dev-rxdb-miniprogram/src/runtime-preflight.ts`](../../../apps/dev-rxdb-miniprogram/src/runtime-preflight.ts) | 删平台分支，改用运行时入口                            |

## References

- [US-209 微信小程序 wa-sqlite 适配器](./US-209-miniprogram-adapter.md)
- [US-211 多端小程序宿主](./US-211-multi-miniprogram-platforms.md)
- [小程序平台可行性矩阵](./miniprogram-platform-feasibility.md)
- [Taro 插件功能](https://docs.taro.zone/docs/plugin)
- [Taro 插件 API（编译阶段钩子）](https://docs.taro.zone/docs/plugin-custom)
