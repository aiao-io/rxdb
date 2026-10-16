# 示例工程

本目录收录**独立的**端到端示例，用来在真实工具链里验证 `@aiao/*` 的接入方式。

## ⚠️ 不在 CI 覆盖范围

**本目录下的所有示例都不受任何自动化门禁保护，改动后必须手工验证。**

原因是它们被**有意**排除在 monorepo 之外：

- 根 [pnpm-workspace.yaml](../pnpm-workspace.yaml) 用 `- '!examples/*'` 排除本目录，
  每个示例都是普通 npm 工程（无 lockfile）；
- 本目录下**没有任何 `project.json`**，因此 `nx affected` / `pnpm test-all` 都扫不到它们。
  注意 `pnpm nx show projects` 里的 `angular-todo` 是 [modules/angular-todo](../modules/angular-todo/)（Nx 项目），与本目录无关；
- 它们依赖**已发布到 npm** 的 `@aiao/*` 版本，而不是仓库源码，所以仓库内的改动不会自动反映到示例里。

这样做是为了让独立 Angular CLI 这类与 Nx 图不共存的工具链保持可用。
代价是：示例可能滞后于仓库源码，验证责任在改动者。

## 示例清单

| 目录                            | 技术栈                 | 验证内容                                                        | 手工验证命令                   |
| :------------------------------ | :--------------------- | :-------------------------------------------------------------- | :----------------------------- |
| [todo-react](./todo-react/)     | React 19 + PGlite      | 装饰器实体、响应式查询、增删改、批量写、过滤、IndexedDB 持久化  | `npm install && npm run build` |
| [todo-vue](./todo-vue/)         | Vue 3.5 + PGlite       | 同上（Vue 版）                                                  | `npm install && npm run build` |
| [todo-angular](./todo-angular/) | Angular 22 + PGlite    | 同上（Angular 版）                                              | `npm install && npm run build` |

`todo-react` / `todo-vue` / `todo-angular` 是最小 PGlite 示例，对应仓库 README「5 分钟跑通」，
用 npm 管理依赖，可直接在 StackBlitz 一键打开。

每个示例都是**独立的 npm 工程**，**不要在仓库根安装它们**：

```bash
cd examples/<示例目录>
npm install
npm run dev    # todo-react / todo-vue；todo-angular 是 ng serve
```

## StackBlitz 一键跑通

用 GitHub 路径直接打开某个子目录：

```
https://stackblitz.com/github/aiao-io/rxdb/tree/main/examples/<目录>
```

三个 PGlite 示例依赖 `SharedArrayBuffer`（浏览器内 PostgreSQL 是 pthreads WASM），
各自构建配置已加 COOP/COEP 响应头，请在 Chrome / Edge 打开预览。示例统一用 npm 而非 pnpm：
StackBlitz WebContainer 里 pnpm 只支持 WASM 版，`packageManager` 字段会拉原生版导致
`ERR_PNPM_UNSUPPORTED_RUNTIME`。

## 已迁出：Taro 微信小程序示例

原 `examples/taro-react-todo/` 已迁入 [apps/dev-rxdb-miniprogram](../apps/dev-rxdb-miniprogram/)，
成为纳入 Nx 图的常规应用：依赖走 `workspace:*` 直连仓库源码，`lint` / `typecheck` / `build`
三个 target 都进 CI（`build` 聚合 `build-weapp` / `build-tt` / `build-alipay`，一次产出三端）。也就是说它**不再**属于本目录「手工验证、不受门禁保护」的范畴。

`@aiao/rxdb-adapter-miniprogram` 仍标记为实验性，各端的验证状态：

| 端               | 入口                                                             | 状态                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 微信（weapp）    | `pnpm nx run dev-rxdb-miniprogram:build-weapp` → `dist/`         | 已验证：微信开发者工具走查由 `dev-rxdb-miniprogram-e2e:e2e-devtools` 手跑                                                                                                                                                                                                                                                                                                                            |
| 抖音（tt）       | `pnpm nx run dev-rxdb-miniprogram:build-tt` → `dist-tt/`         | adapter 已在抖音开发者工具（基础库 4.27.0）与 iOS 真机（抖音 40.6.0 / 基础库 4.33.0）验证（spike v9）；**Android 未验证**；Taro tt 产物已在开发者工具 4.5.6 走查通过；iOS 真机上一版实测加载即失败（模块顶层 `TextEncoder`，见包 README「抖音」），已修，2026-10-02 iOS 真机走查通过；构建随 `build` 进 CI                                                                                           |
| 支付宝（alipay） | `pnpm nx run dev-rxdb-miniprogram:build-alipay` → `dist-alipay/` | adapter 2026-10-04 改判实验性支持（见[可行性矩阵](../requirements/stories/adapter/miniprogram-platform-feasibility.md)）；demo 已接支付宝宿主，2026-10-04 在开发者工具 3.10.15 模拟器走查通过（建库、验证完成，运行时能力 11/11，`BigInt` / `queueMicrotask` 由宿主补）；demo 未上真机，adapter 本身的 iOS 证据见 `apps/dev-rxdb-miniprogram-alipay-probe`，**Android 未验证**；构建随 `build` 进 CI |
| 百度 / QQ        | —                                                                | 不支持，理由见[可行性矩阵](../requirements/stories/adapter/miniprogram-platform-feasibility.md)；demo 的 `build:swan` / `build:qq` 脚本保留但没有宿主                                                                                                                                                                                                                                                |

`dist-tt/` 直接用抖音开发者工具打开。`project.tt.json` 的 appid 是占位的 `testAppId`，真实 AppID
只在工具里改，**不要提交**。`dist-alipay/` 用支付宝小程序开发者工具打开；`project.alipay.json`（产物里是
`mini.project.json`）不带 appid，真机预览 / 调试要关联的真实 AppID 同样只在工具里改，**不要提交**；它的
`compileOptions.transpile`（含跳过 Worker 转译的 `script.ignore`）不能删，原因见 `apps/dev-rxdb-miniprogram/project.json` 的 `// build-alipay`。能力边界见
[兼容性矩阵](../website/docs/compatibility.md#aiaorxdb-adapter-miniprogram-的能力边界)。
CI 覆盖到三端构建产物为止，**真机行为仍需用对应平台的开发者工具手工确认**。
