# aiao-model-design 产品约定

遵循仓库根 [AGENTS.md](../AGENTS.md) 的角色、代码哲学与铁律；本文件只补充本产品的目录边界与依赖规则。治理依据是[应用级需求与项目治理办法](../requirements/application-governance.md)。

## 产品组成

本目录是产品根：三个 Nx 应用与一个产品私有包服务同一个产品目标，共用需求前缀 `MODEL` 与 [requirements/](requirements/README.md)（产品级需求唯一真相源）。

| 目录                 | Nx 项目                       | tags                                           | 说明                                  |
| -------------------- | ----------------------------- | ---------------------------------------------- | ------------------------------------- |
| `.`                  | `aiao-model-design`           | `scope:model-design`                           | 需求门禁、安全门禁、聚合验证 `verify` |
| `apps/web`           | `aiao-model-design-web`       | `scope:model-design` `type:app` `layer:ui`     | Angular 设计器（浏览器）              |
| `apps/api`           | `aiao-model-design-api`       | `scope:model-design` `type:app` `layer:server` | Cloudflare Worker：登录与会话签发     |
| `apps/agent`         | `aiao-model-design-agent`     | `scope:model-design` `type:app` `layer:server` | Trigger.dev 建模智能体                |
| `packages/model-ops` | `aiao-model-design-model-ops` | `scope:model-design` `type:lib` `layer:domain` | `@aiao-model-design/model-ops` 纯函数 |

## 依赖方向

```text
apps/web ───┐
            ├──> packages/model-ops（@aiao-model-design/model-ops）
apps/agent ─┘
apps/* ──────> 根平台公共包（@aiao/*）
```

- 应用之间不互相 import 源码。web 与 agent 共用的类型、操作与校验放进 `packages/model-ops`；api 部署时只读取 web 的构建产物（wrangler 的 `assets.directory`），不 import web 的代码。
- `packages/model-ops` 只放纯函数，不依赖浏览器、Angular / React / Vue、Trigger.dev、AI SDK 或 Worker 入口。根 `eslint.config.mjs` 对 `layer:domain` 的约束会拦下这些导入。
- 私有包按源码消费：`tsconfig.base.json` 的 paths 映射到 `src/`，`private: true`，不进公开 API 基线与发布流程。测试夹具从 `@aiao-model-design/model-ops/testing` 导入，产品代码只用包入口。
- 服务端密钥只在 api（`.dev.vars` / Cloudflare secret）与 agent（`.env.agent` / 实例环境变量）。web 不读任何服务端密钥，`security-check` 会扫描 web 的构建产物。
- 改 `packages/model-ops` 时，同时验证 web 与 agent（`pnpm nx affected` 会列出两者）。

## 需求

- 故事编号 `MODEL-US-XXX`、史诗 `MODEL-EPIC-XXX`，约定见 [requirements/CONVENTIONS.md](requirements/CONVENTIONS.md)。
- 跨应用的登录、会话、数据契约与部署写在产品级故事里；只属于一个子应用的行为在故事的范围或实现文件里标明归属。
- 平台能力用 `capabilities: [rxdb:US-XXX]` 引用，不复制根故事。

## 常用命令

在仓库根执行，先切 Node 26：

```bash
pnpm nx run aiao-model-design:verify            # 全部门禁：需求、lint、typecheck、test、build、test-worker、security-check
pnpm nx run aiao-model-design-web:dev           # web 开发服务器 + 本地 Worker
pnpm nx run aiao-model-design-agent:dev         # 智能体开发会话（需要自建实例，见 README）
pnpm nx run aiao-model-design-web:generate-models  # 改实体后重新生成模型
```
