# 示例工程

本目录收录**独立的**端到端示例，用来在真实工具链里验证 `@aiao/*` 的接入方式。

## ⚠️ 不在 CI 覆盖范围

**本目录下的所有示例都不受任何自动化门禁保护，改动后必须手工验证。**

原因是它们被**有意**排除在 monorepo 之外：

- 根 [pnpm-workspace.yaml](../pnpm-workspace.yaml) 用 `- '!examples/*'` 排除本目录，
  每个示例自带 `pnpm-workspace.yaml`（`packages: ['.']`）与独立 `pnpm-lock.yaml`，声明自身为 workspace 根；
- 因此 `pnpm nx show projects` 里**没有**这些项目，`nx affected` / `pnpm test-all` 都扫不到它们；
- 它们依赖**已发布到 npm** 的 `@aiao/*` 版本，而不是仓库源码，所以仓库内的改动不会自动反映到示例里。

这样做是为了让 Taro 4 / 独立 Angular CLI 这类与 Nx 图不共存的工具链保持可用。
代价是：示例可能滞后于仓库源码，验证责任在改动者。

## 示例清单

| 目录                                  | 技术栈                      | 验证内容                                                    | 手工验证命令                                         |
| :------------------------------------ | :-------------------------- | :---------------------------------------------------------- | :--------------------------------------------------- |
| [angular-todo](./angular-todo/)       | Angular 21 + wa-sqlite      | 本地 SQLite、响应式查询、批量写入、撤销/重做、OPFS/IDB 切换 | `pnpm install && pnpm build && pnpm test`            |
| [taro-react-todo](./taro-react-todo/) | Taro 4 + React + 微信小程序 | `@aiao/rxdb-adapter-miniprogram` 在微信逻辑层的持久化链路   | `pnpm install && pnpm typecheck && pnpm build:weapp` |

每个示例都是独立 pnpm workspace，**不要在仓库根安装它们**：

```bash
cd examples/<示例目录>
pnpm install
```

### taro-react-todo 的额外说明

`taro-react-todo` 是 [US-209](../requirements/stories/adapter/US-209-miniprogram-adapter.md) 的**手工验证入口**，
不是受支持的产品级示例。`@aiao/rxdb-adapter-miniprogram` 本身标记为实验性且**仅支持微信小程序逻辑层**，
因此虽然 Taro 脚手架保留了 `build:alipay` / `build:tt` / `build:qq` 等多端命令，
**只有 `build:weapp` 这条路径经过验证**。能力边界见
[兼容性矩阵](../website/docs/compatibility.md#aiaorxdb-adapter-miniprogram-的能力边界)。

完整验证需要用微信开发者工具打开 `dist/`，Node 侧的 `pnpm typecheck` 只能覆盖类型层。
