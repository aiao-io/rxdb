# 示例工程

本目录收录**独立的**端到端示例，用来在真实工具链里验证 `@aiao/*` 的接入方式。

## ⚠️ 不在 CI 覆盖范围

**本目录下的所有示例都不受任何自动化门禁保护，改动后必须手工验证。**

原因是它们被**有意**排除在 monorepo 之外：

- 根 [pnpm-workspace.yaml](../pnpm-workspace.yaml) 用 `- '!examples/*'` 排除本目录，
  每个示例自带 `pnpm-workspace.yaml`（`packages: ['.']`）与独立 `pnpm-lock.yaml`，声明自身为 workspace 根；
- 本目录下**没有任何 `project.json`**，因此 `nx affected` / `pnpm test-all` 都扫不到它们。
  注意别被重名误导：`pnpm nx show projects` 里的 `angular-todo` 指的是 [modules/angular-todo](../modules/angular-todo/)，
  与 [examples/angular-todo](./angular-todo/) 无关；
- 它们依赖**已发布到 npm** 的 `@aiao/*` 版本，而不是仓库源码，所以仓库内的改动不会自动反映到示例里。

这样做是为了让独立 Angular CLI 这类与 Nx 图不共存的工具链保持可用。
代价是：示例可能滞后于仓库源码，验证责任在改动者。

## 示例清单

| 目录                            | 技术栈                 | 验证内容                                                    | 手工验证命令                              |
| :------------------------------ | :--------------------- | :---------------------------------------------------------- | :---------------------------------------- |
| [angular-todo](./angular-todo/) | Angular 21 + wa-sqlite | 本地 SQLite、响应式查询、批量写入、撤销/重做、OPFS/IDB 切换 | `pnpm install && pnpm build && pnpm test` |

每个示例都是独立 pnpm workspace，**不要在仓库根安装它们**：

```bash
cd examples/<示例目录>
pnpm install
```

## 插件拆分（US-025）与示例的滞后

仓库源码已把历史 / 同步 / 查询缓存等能力从核心 `@aiao/rxdb` 拆进
`@aiao/rxdb-plugin-*`；`modules/angular-todo` 那份同源代码已经按新形态写成
`import type {} from '@aiao/rxdb-plugin-history';` + `rxdb.use(rxDBPluginHistory)`。

示例**暂时不能**跟：拆出来的插件包一个都没发到 npm（截至 2026-09-23，`@aiao/*` 里只有
`rxdb` 与 `rxdb-plugin-search` 发布到 0.0.25），而示例按约定只装已发布版本。
`examples/angular-todo` 因此仍直接用 `rxdb.versionManager.history()`。

这不是一条会自己引爆的雷：`package.json` 里写的是 `"@aiao/rxdb": "^0.0.24"`，
在 0.x 下 caret 只放行 patch 的同段——`^0.0.24` 就是 `>=0.0.24 <0.0.25`，
装到的永远是 0.0.24；而且已发布的 0.0.25 产物里 `RxDB.versionManager` 仍然在。
真正的触发点是**插件包首次发布、示例随之升到那个版本**，届时这里要一起改：

1. `examples/angular-todo/package.json` 加 `@aiao/rxdb-plugin-history`；
2. `src/app/setup_rxdb.ts` 补 `rxdb.use(rxDBPluginHistory)`；
3. `src/app/todo/todo.page.ts` 顶部补 `import type {} from '@aiao/rxdb-plugin-history';`
   （`versionManager` 的三处调用本身不用动），照 `modules/angular-todo/todo-page/todo.page.ts` 抄。

## 已迁出：Taro 微信小程序示例

原 `examples/taro-react-todo/` 已迁入 [apps/dev-rxdb-miniprogram](../apps/dev-rxdb-miniprogram/)，
成为纳入 Nx 图的常规应用：依赖走 `workspace:*` 直连仓库源码，`lint` / `typecheck` / `build`
三个 target 都进 CI。也就是说它**不再**属于本目录「手工验证、不受门禁保护」的范畴。

`@aiao/rxdb-adapter-miniprogram` 仍标记为实验性，各端的验证状态：

| 端                 | 入口                                                     | 状态                                                                                                                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 微信（weapp）      | `pnpm nx build dev-rxdb-miniprogram` → `dist/`           | 已验证：微信开发者工具走查由 `dev-rxdb-miniprogram-e2e:e2e-devtools` 手跑                                                                                                                                                                                                                            |
| 抖音（tt）         | `pnpm nx run dev-rxdb-miniprogram:build-tt` → `dist-tt/` | adapter 已在抖音开发者工具（基础库 4.27.0）与 iOS 真机（抖音 40.6.0 / 基础库 4.33.0）验证（spike v9）；**Android 未验证**；Taro tt 产物已在开发者工具 4.5.6 走查通过；iOS 真机上一版实测加载即失败（模块顶层 `TextEncoder`，见包 README「抖音」），已修，2026-10-02 iOS 真机走查通过；target 不进 CI |
| 支付宝 / 百度 / QQ | —                                                        | 不支持，理由见[可行性矩阵](../requirements/stories/adapter/miniprogram-platform-feasibility.md)                                                                                                                                                                                                      |

`dist-tt/` 直接用抖音开发者工具打开。`project.tt.json` 的 appid 是占位的 `testAppId`，真实 AppID
只在工具里改，**不要提交**。能力边界见
[兼容性矩阵](../website/docs/compatibility.md#aiaorxdb-adapter-miniprogram-的能力边界)。
CI 覆盖到微信构建产物为止，**真机行为仍需用对应平台的开发者工具手工确认**。
