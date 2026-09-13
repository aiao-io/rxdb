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

## 已迁出：Taro 微信小程序示例

原 `examples/taro-react-todo/` 已迁入 [apps/dev-rxdb-miniprogram](../apps/dev-rxdb-miniprogram/)，
成为纳入 Nx 图的常规应用：依赖走 `workspace:*` 直连仓库源码，`lint` / `typecheck` / `build`
三个 target 都进 CI。也就是说它**不再**属于本目录「手工验证、不受门禁保护」的范畴。

`@aiao/rxdb-adapter-miniprogram` 仍标记为实验性且**仅支持微信小程序逻辑层**，
`build:weapp` 之外的多端命令未经验证；能力边界见
[兼容性矩阵](../website/docs/compatibility.md#aiaorxdb-adapter-miniprogram-的能力边界)。
CI 覆盖到构建产物为止，**真机行为仍需用微信开发者工具打开 `dist/` 手工确认**。
