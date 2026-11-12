# aiao-desktop 产品约定

遵循仓库根 [AGENTS.md](../AGENTS.md) 的角色、代码哲学与铁律；本文件只补充本产品的目录边界与依赖规则。治理依据是[应用级需求与项目治理办法](../requirements/application-governance.md)。

## 产品组成

本目录是产品根：两个 Nx 应用服务同一个产品目标，共用需求前缀 `ADESK` 与 [requirements/](requirements/README.md)（产品级需求唯一真相源）。

| 目录       | Nx 项目            | tags                                                     | 说明                                                                 |
| ---------- | ------------------ | -------------------------------------------------------- | -------------------------------------------------------------------- |
| `.`        | `aiao-desktop`     | `scope:aiao-desktop`                                     | 本地开发入口 `dev` 与开发导航、需求门禁、密钥扫描、聚合验证 `verify` |
| `apps/web` | `aiao-desktop-web` | `scope:aiao-desktop` `type:app` `layer:ui` `angular-app` | Angular 桌面（浏览器）                                               |
| `apps/e2e` | `aiao-desktop-e2e` | `scope:aiao-desktop` `type:e2e`                          | 对 web 正式构建跑的 Chromium 冒烟                                    |

## 依赖方向

```text
apps/e2e ──（只读构建产物 dist/aiao-desktop/apps/web）──> apps/web
apps/web ──> 平台包（@aiao/rxdb、@aiao/rxdb-angular、@aiao/rxdb-adapter-sqlite-wasm、@aiao/rxdb-plugin-tree、@aiao/rxdb-plugin-storage、@aiao/utils）
apps/web ──> 第三方库（@angular/*、rxjs、comlink、@xterm/*、@vivari/core）
产品根 ──（implicitDependencies）──> apps/web、apps/e2e
```

- e2e 不 import web 的源码，只对 web 的正式构建跑冒烟：`e2e` 目标依赖 `aiao-desktop-web:build`。改 web 时 `nx affected` 会带上 e2e 与产品根（需求文档链接到 web 的源码，产品根的需求门禁也要跑）。
- 系统数据存在本地 SQLite（[D-07](requirements/decisions.md#d-07系统数据存在本地-sqlite)）：web 经 `tsconfig.base.json` 的 paths 直接用根平台包的源码，`nx sync` 维护 tsconfig 的项目引用。实体只能经 RxDB 写入；新增实体登记在 `src/app/data/entities.ts`，初始数据登记在 `src/app/data/seeds.ts`。
- 目前没有产品私有包。出现跨应用共用的代码时，建 `packages/<name>`（`@aiao-desktop/<name>`，`private: true`），同时把 `aiao-desktop/packages/*` 加进 `pnpm-workspace.yaml`、在 `tsconfig.base.json` 加 paths，并按治理办法给 `layer:domain` 补依赖约束。
- 产品只有前端，不带任何密钥（[D-03](requirements/decisions.md#d-03只有前端不带任何密钥)）。`aiao-desktop:audit-secrets` 扫描 web 的构建产物，CI 的 extras job 会跑它。
- 终端依赖跨源隔离：托管 web 产物时必须返回 COOP `same-origin` 与 COEP `require-corp`（[D-05](requirements/decisions.md#d-05终端依赖跨源隔离)）。
- 本地开发的端口固定，统一登记在 [scripts/dev/services.mjs](scripts/dev/services.mjs)（[D-06](requirements/decisions.md#d-06本地开发用固定端口与开发导航)）。改端口时同步改 web 的 `serve`、`serve-static` 与产品根的 `dev`、`dev-dashboard`，`dev-test` 会校验它们一致。web 的 `serve` 先跑产品根的 `dev-ports`，这是唯一一条从子项目指向产品根的任务依赖，只用于开发时的端口检查。
- 开发导航（`scripts/dev/dashboard.mjs`）只在本地开发时运行、只监听 `127.0.0.1`，不进入 web 的构建产物，页面里不放任何密钥。

## 需求

- 故事编号 `ADESK-US-XXX`、史诗 `ADESK-EPIC-XXX`，约定见 [requirements/CONVENTIONS.md](requirements/CONVENTIONS.md)。
- 改动可见行为时同步改冒烟（[apps/e2e/src/smoke.mjs](apps/e2e/src/smoke.mjs)），并在故事的验收证据里指向对应检查项。
- 平台能力用 `capabilities: [rxdb:US-XXX]` 引用，不复制根故事。

## 常用命令

在仓库根执行，先切 Node 26：

```bash
pnpm nx dev aiao-desktop                    # 本地开发：开发服务器 http://localhost:4410 + 开发导航 http://127.0.0.1:4412/
pnpm nx run aiao-desktop:verify             # 全部门禁：需求、门禁与开发脚本测试、lint、typecheck、build、冒烟、密钥扫描
pnpm nx serve aiao-desktop-web              # 只起开发服务器 http://localhost:4410（带跨源隔离响应头）
pnpm nx run aiao-desktop-web:serve-static   # 正式构建后在 http://127.0.0.1:4411 预览
pnpm nx run aiao-desktop-e2e:e2e            # 正式构建上的 Chromium 冒烟
```
