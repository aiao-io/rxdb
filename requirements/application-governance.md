# 应用级需求与项目治理办法

本文规定仓库中被定义为“应用级别”的产品、demo 和多应用产品组如何管理需求、代码、Nx 项目和私有包。它适用于所有应用，不属于任何单一产品。

根 `requirements/` 维护平台与可复用领域能力；应用级需求维护具体产品的用户可见行为、应用接线、部署、账号、本机能力和端到端验收。底层能力完成，不代表应用已经接线或验收完成。

## 应用级别的判定

满足下列条件之一的项目，应建立应用级需求边界：

- 有独立的用户目标和用户可见行为；
- 有独立的启动、构建、部署或运行时；
- 有独立的账号、数据、配置或迁移边界；
- 需要独立的浏览器、设备、真实服务或产品验收；
- 作为 demo、模板或产品，需要单独说明支持范围和不支持范围。

纯库、适配器、插件和框架能力继续使用根 `requirements/stories/` 的平台/领域编号，不能因为被某个应用使用就复制成应用故事。

## 需求目录位置

单应用使用以下结构：

```text
apps/<app>/
├── AGENTS.md
├── src/
├── project.json
└── requirements/
    ├── README.md
    ├── CONVENTIONS.md
    ├── stories/
    ├── epics/
    ├── status-overview.md
    ├── roadmap.md
    ├── decisions.md
    ├── capability-matrix.md
    ├── verification-report.md
    ├── future-requirements.md
    ├── plans/
    ├── reviews/
    └── code-scanning/
```

多个 Nx 应用共同组成一个产品时，使用产品根目录统一管理产品需求：

```text
<product>/
├── AGENTS.md
├── requirements/                 # 产品级需求唯一真相源
├── apps/
│   ├── web/
│   ├── admin/
│   ├── api/
│   └── e2e/
└── packages/                     # 产品私有包
```

产品组内的 `web`、`admin`、`api` 如果服务于同一产品目标，共用一个需求前缀和一个 `requirements/`。跨应用的登录、权限、数据契约、部署和业务流程写在产品级 story 中；只有一个子应用独有且需要单独验收的行为，才在 story 的范围或实现文件中标明归属。

如果两个应用有不同的产品目标、负责人、用户群或发布周期，应建立两个独立的应用需求目录，不能为了目录靠近而共用状态。

## 根需求与应用需求的关系

| 内容                                        | 归属                        | 编号示例             |
| ------------------------------------------- | --------------------------- | -------------------- |
| RxDB 核心行为、适配器、插件、跨框架公共能力 | 根 `requirements/`          | `US-203`             |
| 某个应用如何接入平台能力                    | 应用/产品 `requirements/`   | `MEDIA-US-203`       |
| 应用界面、账号、部署、本机数据和端到端行为  | 应用/产品 `requirements/`   | `MEDIA-US-201`       |
| 可发布 npm 包的公开 API、版本和兼容性       | 根需求与包自身门禁          | `US-601` 等          |
| 应用私有模块或包的内部结构                  | 应用/产品目录与 `AGENTS.md` | `@aiao-media/domain` |

应用故事引用根能力时，在 frontmatter 的 `capabilities` 中使用带作用域的引用，例如：

```yaml
capabilities:
  - rxdb:US-203
  - rxdb:US-218
```

应用故事自己的 `dependsOn` 只表示应用内部前置，不复制根 story 的正文、状态或验收表。

## 编号和状态

应用或产品先选择一个稳定短前缀，例如 `MEDIA`、`POOL` 或 `ADMIN`：

```text
story: <APP>-US-XXX
epic:  <APP>-EPIC-XXX
```

编号前缀表示需求归属，不表示 Nx project name。一个产品组中的 `web`、`admin` 和 `api` 使用同一个产品前缀；只有它们是不同产品时才拆分前缀。

应用需求完全沿用根 `requirements/CONVENTIONS.md` 的状态、真相源、证据、分阶段和派生视图规则：

- story YAML 的 `status` 是唯一状态真相源；
- `status-overview.md`、`roadmap.md`、`capability-matrix.md` 是派生视图；
- 大故事在同一文件使用“交付阶段”，不创建 `US-XXXa`、`US-XXXb`；
- `Done` 必须同时有实现、应用接线和与承诺层级相符的验收证据；
- 本地替身、源码测试或包构建不能代替真实环境证据；
- 只写当前结论，过程记录放入 plans、reviews 或 Git 历史。

## 新应用落地流程

1. **定义边界**：写清用户、产品目标、运行时、数据来源、部署对象和明确不做的内容。
2. **选择归属**：判断是独立应用需求，还是已有产品组内的子应用。
3. **初始化目录**：复制 `requirements/app-template/` 的模板和增量约定，确定短前缀和领域编号段。
4. **建立能力引用**：列出依赖的根平台 story，不复制根需求。
5. **先写验收**：为用户可见行为、权限边界、迁移、部署和真实环境验证写 AC。
6. **再做计划**：按依赖拆交付阶段，区分当前承诺、候选阶段和不在本轮关闭范围的内容。
7. **绑定代码边界**：在 `AGENTS.md`、Nx tags 和项目依赖中声明应用可以依赖什么，禁止反向依赖什么。
8. **实现和接线**：平台能力 Done 后，仍需完成应用代码接线、配置、路由、数据迁移和验收。
9. **维护派生视图**：每次需求状态或范围变化，同步状态总览、路线图、能力矩阵和验证报告。
10. **通过应用门禁**：结构检查、lint、typecheck、test、build、相关 e2e 和真实服务验收全部按 story 记录证据。

## Nx 项目和目录治理

一个产品组可以在当前仓库唯一的 Nx workspace 内拥有多个应用。不要在产品目录内嵌套第二个 Nx workspace。

推荐的 Nx project tags：

```text
scope:<product>
layer:ui
layer:server
layer:domain
layer:contracts
type:app
type:lib
type:e2e
```

依赖方向必须满足：

```text
应用 UI ──────> 产品 domain / contracts
服务端 API ───> 产品 domain / contracts
产品包 ───────> 根平台公共包
```

必须禁止：

```text
一个 app 直接 import 另一个 app 的 src/*
产品包依赖应用页面
领域包依赖浏览器、Angular、React、Vue 或服务端入口
前端代码携带服务端 secret
```

跨应用复用的产品能力使用产品私有包作用域：

```text
@<product-scope>/domain
@<product-scope>/api-contracts
@<product-scope>/testkit
```

例如 Aiao Media 使用：

```text
@aiao-media/domain
@aiao-media/api-contracts
```

`@aiao/*` 保留给 RxDB 平台公共包。应用私有包默认 `private: true`，不进入公开 API baseline 和发布流程；需要仓外消费时必须单独评审发布范围、版本和兼容性。

不要为了“复用”提前抽包。跨应用依赖、独立构建、独立测试或独立发布至少有一个真实理由时，才创建产品私有包；单个应用内部的页面、状态和 API facade 留在应用目录。

## 需求与代码的合并治理

应用功能与其产品私有包必须在同一 PR 中统一评审和验证：

- story、实现、应用接线和私有包契约保持同一范围；
- 私有包变更必须检查所有受影响应用；
- 应用需求不能只完成底层包而把应用接线留作口头承诺；
- 共享能力和应用功能不能拆成两个相互缺少验收证据的 PR；
- 候选领域需求仍遵守 `requirements/domain-research/` 的立项和范围评审规则。

应用级需求不能绕过根需求的质量门禁，也不能因为是私有应用就跳过测试、类型检查、构建或真实环境验证。

## 应用门禁的最低要求

每个应用或产品组至少提供：

- 需求结构检查：YAML、编号、文件名、AC、依赖、链接和派生视图；
- Nx project discovery：项目名称、root、sourceRoot、tags 和 targets 可被 `pnpm nx show project` 读取；
- 代码门禁：lint、typecheck、unit test、build；
- 运行时门禁：按应用类型执行浏览器、桌面、服务端或真实供应商验收；
- 影响范围门禁：产品私有包变化能够通过 `nx affected` 找到依赖应用；
- 安全边界门禁：前端不包含 server secret，服务端授权不依赖前端隐藏入口；
- 需求证据：每条 Done AC 指向对应测试、构建产物、部署验证或真实环境记录。

结构门禁通过只证明文档和项目组织正确，不证明产品功能完成。应用故事必须继续记录实际行为和验证证据。

## 现有模板与示例

应用初始化模板位于 [`requirements/app-template/`](app-template/)。它提供应用级目录、增量约定和模板文件，不重复根规则。

具体产品的应用需求应位于对应产品根目录的 `requirements/`，由产品自己的需求前缀管理。

当前 Aiao Media 的应用需求位于 [`aiao-media/requirements/`](../aiao-media/requirements/)，是本办法的一个应用级实践示例；它的业务状态和验收仍由 `MEDIA-US-*` story 管理。
