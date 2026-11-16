# RxDB Admin Template 产品

`rxdb-admin-template` 是由 React、Angular、Vue 三个 Nx 应用共同组成的 Admin 产品模板。三个应用提供等价的用户能力和浏览器验收入口，产品需求、状态、路线图和验收记录集中在本目录的 [requirements](requirements/README.md)。

| 产品组成           | Nx 项目                                                 |
| ------------------ | ------------------------------------------------------- |
| React 应用         | [`rxdb-admin-template-react`](apps/react/README.md)     |
| Angular 应用       | [`rxdb-admin-template-angular`](apps/angular/README.md) |
| Vue 应用           | [`rxdb-admin-template-vue`](apps/vue/README.md)         |
| React 浏览器验收   | `rxdb-admin-template-react-e2e`                         |
| Angular 浏览器验收 | `rxdb-admin-template-angular-e2e`                       |
| Vue 浏览器验收     | `rxdb-admin-template-vue-e2e`                           |

## 产品目录

```text
rxdb-admin-template/
├── AGENTS.md
├── README.md
├── project.json
├── requirements/          # 产品级需求唯一真相源，统一 ADMIN-* 编号
├── scripts/               # 产品需求校验
├── packages/collaboration/ # 三端共享任务与协作实现
├── supabase/migrations/    # 服务端数据边界与 RLS
└── apps/
    ├── angular/
    ├── react/
    ├── vue/
    ├── angular-e2e/
    ├── react-e2e/
    └── vue-e2e/
```

本产品目录位于仓库根，与根 `apps/`、`packages/`、`requirements/` 同级。本产品使用仓库现有的唯一 Nx workspace；产品内不另建 `nx.json` 或包管理器锁文件。三端协作功能共用私有包 `@rxdb-admin-template/collaboration`，位于产品 `packages/` 并设为 `private: true`；仓库根 `packages/` 继续承载 `@aiao/*` 平台公共能力。

## 启动与验证

在仓库根目录使用现有 Nx 名称启动三端；端口、存储标识和框架配置见各应用 README：

```bash
pnpm nx serve rxdb-admin-template-react
pnpm nx serve rxdb-admin-template-angular
pnpm nx serve rxdb-admin-template-vue
```

产品需求门禁：

```bash
pnpm nx run rxdb-admin-template:requirements-check
pnpm nx run rxdb-admin-template:requirements-test
```

三个应用也保留兼容入口；它们调用同一份产品级脚本：

```bash
pnpm nx run rxdb-admin-template-react:requirements-check
pnpm nx run rxdb-admin-template-angular:requirements-check
pnpm nx run rxdb-admin-template-vue:requirements-check
```

产品需求不把底层公共包的完成状态当作三端产品能力已经完成。产品级故事在 [requirements/stories](requirements/stories/) 中描述用户行为、三端验收和实现归属；公共能力仍由仓库根 [requirements](../requirements/README.md) 管理。

## 产品需求边界

`requirements/` 集中维护所有 `ADMIN-*` 故事、Epic、状态总览、路线图、决策、计划和验收记录。三个应用及其 E2E 的源码统一放在本产品 `apps/` 下，保留现有 Nx 项目名，通过 `scope:admin-template` 标记和项目依赖声明产品边界。

子应用的需求门禁目标依赖产品级任务；一次执行三端门禁时，实际文档校验和回归测试各执行一次。三端 `test` 都先运行这些共享门禁。子应用显式依赖 `rxdb-admin-template`，因此产品需求变更能进入三端及其 E2E 的 affected 范围。

禁止在子应用重新建立 `requirements/` 副本；产品门禁会拒绝这种分散结构。代码评审仍按实际 Nx 项目名归档到仓库根 `requirements/reviews/<projectKey>/`，共用产品故事编号关联问题。

## 团队协作

三个应用的 `/collaboration` 页面使用同一个产品私有包，支持邮箱验证码登录、团队邀请、任务草稿、离线排队、双设备分叉恢复、PR、字段讨论、候选审批和原子合并。既有匿名资产工作台及连接前恢复入口继续独立运行。

协作 API 需要 Supabase Auth 与 PostgreSQL。服务配置、迁移、可信初始化、测试入口和当前容量边界见 [协作包运行说明](packages/collaboration/README.md)，实现与验收边界见 [协作记录](requirements/plans/collaboration-implementation.md)。
