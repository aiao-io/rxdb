# Admin 产品决策

## D-01：在当前仓库孵化

`rxdb-admin-template` 是三端 Admin 模板的产品边界，使用 `rxdb-admin-template/requirements/` 统一管理产品需求，同时保留后台框架的领域贯穿测试职责。当前沿用仓库内唯一 Nx 工作区、workspace 包和三个明确框架的应用名；用户明确当前不考虑复制。未来可成为独立 Admin 启动项目模板，但本批次不实施独立工程、导出或发包。

当前工作覆盖应用需求管理、配置基线、三端完整客户端国际化与 Dashboard 页面扩展验收；实体替换仍按 [roadmap](roadmap.md) 的新业务前置推进。

移除额外的消费示例应用及其 E2E，由本模板承接公开包消费与接入成本验证。对应平台 [US-528](../../requirements/stories/domain/US-528-admin-consumer-example.md) 保留 Backlog，仓内回归不替代发布产物的独立消费验收。

## D-02：应用与公共能力分开验收

应用使用 `ADMIN-US-*` / `ADMIN-EPIC-*`。平台故事保留在根 requirements，使用 `capabilities` 引用，应用内依赖使用 `dependsOn`。平台完成不代表本应用已接线或验收。

产品根目录统一管理需求；仓库提供 `rxdb-admin-template-angular` / `rxdb-admin-template-react` / `rxdb-admin-template-vue` 三个 Web 模板，使用同一套浏览器验收契约。公共 `rxdb-admin` / `rxdb-model` 等包与应用功能继续遵守 Angular / React / Vue 对称与同 PR 合并治理。三端均在仓库内孵化，独立导出尚未进入范围。

## D-03：数据兼容与宿主边界

保留默认数据库名 `admin-workbench`、偏好前缀 `aiao.workbench` 和旧偏好迁移。新业务改名意味着使用另一份本机数据，不自动迁移原库。更换既有数据标识须另设迁移故事。

当前数据库组合固定为 sqlite-wasm 主线程 + IndexedDB，见 [setup_rxdb](../apps/react/src/app/rxdb/setup_rxdb.ts)。搜索依赖 FTS5，备份恢复有后端组合限制；适配器选择不是本批次模板配置选项。

## D-04：模板扩展先验证实际路径

资产分类 → 资产 → 维护记录是默认可操作样例。统一标识配置不会自动消除全部领域耦合；实体替换和自定义页面必须分别通过 [ADMIN-US-101](stories/domain/ADMIN-US-101-replace-sample-domain.md) / [ADMIN-US-102](stories/domain/ADMIN-US-102-custom-pages-navigation.md) 验收。先复用现有元数据、路由和菜单接口，真实重复出现后再抽象。

## D-05：国际化与恢复边界

完整客户端国际化由 [ADMIN-US-003](stories/platform/ADMIN-US-003-client-i18n.md) 验收。外壳、应用页面和模型组件共用静态 `I18n` 运行时；语言由外壳现有 `app.locale` 持久化和跨 Tab 通知维护，不新增偏好实体或同步通道。

首页与恢复页切换语言不能连接业务数据库，恢复归档仍须先于连接。实体及字段显示名属于呈现层，存储字段、数据值、默认状态和已有归档保持原样；业务记录的多语言翻译另按平台 US-910 定义。

## D-06：数据协作的产品模型

认证、团队、草稿、同步和合并按不同边界建模，不能把它们压缩成一个“发布”按钮：

1. 保存只持久化任务工作树；同步先把已保存整单变更形成不可变提交，再上传任务分支；只有原子合并能改变共享业务数据。
2. 一个任务对应一份草稿和一个来源分支；双设备同步使用预期远端头，分叉拒绝覆盖并允许另存新任务，保留提交身份和祖先。
3. 数据 PR 可以持续追加提交；检查、批准和最终写入绑定同一个服务端候选，覆盖来源/目标头、冲突结果及规则版本。任何相关变化都使旧检查和批准过期。
4. 未解除的要求修改和必须处理线程独立阻塞；默认至少一名非作者审核者批准，免审批只跳过人数，审核权与合并权独立。
5. 共享表直写一律拒绝，包括管理员和合并者；服务端将权限、版本、审核和线程与业务数据、PR、共享头、变更日志及审计统一原子裁决。
6. 旧版本恢复产生新任务未提交变更，随后同步再形成提交；不移动共享头、不删除历史。
7. 团队由可信服务端幂等初始化；邀请绑定已验证邮箱并原子消费。离线热续作、过期冷启动和显式退出采用不同解锁规则，草稿始终保留原归属。
8. Angular、React、Vue 共用 [协作首版共享契约](collaboration-contract.md) 及对应故事 AC；现有平台插件不替代产品协议。

对应需求入口为 [ADMIN-EPIC-002](epics/ADMIN-EPIC-002.md) 和 [ADMIN-EPIC-003](epics/ADMIN-EPIC-003.md)。

## D-07：三端共用产品根需求

2026-11-16 起，原 React 应用下的完整需求树及两份需求门禁脚本迁入 `rxdb-admin-template/`。`ADMIN-*` 编号、原故事状态、历史证据和平台能力引用保持原归属；三端需求不再以 React 应用作为管理入口。

产品根目录登记一个仅承担治理任务的 Nx 项目 `rxdb-admin-template`。三个应用使用同一 `product:admin-template` 标签，显式依赖产品项目，保留同名需求门禁目标作为产品任务的入口。三端 `test` 均带入统一门禁；产品文档变化应影响三个应用及其 E2E。禁止子应用重新建立需求副本，门禁通过负例约束这一点。

成员应用和 E2E 的源码统一迁入产品 `apps/{angular,react,vue,angular-e2e,react-e2e,vue-e2e}/`，保留现有 Nx 项目名、端口和数据标识。产品 `requirements/` 统一需求，成员不保留需求副本；`scope:admin-template` 标签和项目依赖共同定义产品边界。只使用仓库现有唯一 Nx workspace；产品私有包按实际复用需要放入产品 `packages/`。迁移验收见 [ADMIN-US-004](stories/platform/ADMIN-US-004-product-requirements.md)。

## D-08：协作首版的产品私有边界

2026-11-16 的实现使用三端共享的产品私有包 `@rxdb-admin-template/collaboration`。团队数据通过产品快照与提交图协议进入 IndexedDB 任务，云端命令由 Supabase 验证身份、Node 服务执行 PostgreSQL 事务；普通客户端只有 RLS 读取权限，不能直写共享业务投影。

团队模式使用共享编辑器和 PR 四页签；既有匿名 RxDB 资产工作台及数据标识保持独立。现有 `rxdb-plugin-working-tree` 没有直接用于团队任务持久化，不以平台插件状态替代产品验收。工作区版本通知通过 Supabase Realtime 触发受授权的 API 读取，通知负载不包含业务内容。完整实现与测试范围见 [协作记录](plans/collaboration-implementation.md)。存储、传输与部署形态的后续调整见 [D-09](#d-09协作后端收敛方向)。

## D-09：协作后端收敛方向

2026-11-17 评审结论：首版的 Git 式语义（任务分支、不可变提交、绑定候选的审批、原子合并）成立，但「每个提交存全量记录、整个工作区一行 JSONB、读与心跳都锁整行、每次变化全量下发快照」使单次操作成本随历史线性增长，也使命令入口无法放进 Edge Function。协作后端按以下方向收敛：

1. 服务端权威与 D-06 的裁决规则不变：纯 TypeScript 领域引擎、字段级三方合并和全部用例保留；不改写为 PL/pgSQL；客户端不直写任何业务表。
2. 提交改为字段级 ChangeSet，形状对齐平台 working-tree 的 `CommitChangeSet`，提交 ID 用 UUIDv7，服务端重算内容指纹；工作区拆表，引用以比较交换推进，按固定顺序加细粒度锁；合并只加载改动过的记录（[ADMIN-US-218](stories/collaboration/ADMIN-US-218-delta-commits-bounded-cost.md)）。
3. Supabase 承担它擅长的部分：RLS 分页读取、Realtime Broadcast 通知、Realtime Presence、本地 JWT 校验（[ADMIN-US-219](stories/collaboration/ADMIN-US-219-supabase-native-read-realtime.md)）；命令入口可只部署为 Edge Function，Node 入口保留为等价运行时（[ADMIN-US-220](stories/collaboration/ADMIN-US-220-supabase-only-deployment.md)）。
4. 校验由 RxDB 实体元数据生成的 schema 清单驱动，协作包不再写死资产实体。
5. 客户端团队任务在平台补齐「导入远端提交并保留身份」「多父提交」「回写业务表的 discard / restore」之后改用 working-tree，编辑复用各应用的 `EntityList`（[ADMIN-US-221](stories/collaboration/ADMIN-US-221-task-drafts-on-working-tree.md)）。这些平台能力目前是 epic-006 的非目标，需要在根 requirements 另行立项。
6. 上线验收（[ADMIN-US-217](stories/collaboration/ADMIN-US-217-production-deployment-operations.md)）排在 218～220 之后；产品尚未部署，存储重构不涉及线上数据迁移。

实施切片、平台缺口与预算见 [协作后端收敛实施计划](plans/collaboration-convergence-tasks.md)。

## D-10：全站登录与全局会话

2026-11-19 用户拍板（AskUserQuestion）：用户认证是全局能力，不属于团队协作。

1. **全站必须先登录**：三端都有路由守卫，未登录访问任何页面都进入外壳之外的全局登录页 `/login`，登录后回到 `redirect` 指向的本站地址（只接受站内路径）；退出账号或会话失效时带着当前地址回到登录页。首次进入时三端都等门禁结算再渲染（React 根路由的 loader、Angular 阻塞式首次导航、Vue 首次导航结束后才挂载），未登录的人不会先看到后台外壳。原「匿名本机模式独立可用、只有团队模式才要求真实身份」的约定（[ADMIN-US-201](stories/collaboration/ADMIN-US-201-supabase-email-otp-session.md) AC#1、[ADMIN-US-204](stories/collaboration/ADMIN-US-204-local-context-explicit-import.md) AC#1）随之改写。
2. **全局会话单例**：邮箱验证码登录、会话恢复、离线缓存授权、跨页签退出由协作包的 `AuthSession`（`@rxdb-admin-template/collaboration/auth`）统一持有，一个页面只有一个 Supabase 认证客户端；团队协作只跟随它的身份。外壳顶栏右侧是全局账号菜单（账号、团队协作入口、退出账号），团队协作页不再自带登录与退出。supabase-js 动态加载，不进首屏入口。
3. **撤权只锁团队**：被移出团队（撤权、越权）只锁定该团队的上下文——关闭任务与团队库、离开频道、锁定本机草稿、回到团队列表并说明，账号保持登录；只有会话失效（`unauthenticated`）或主动退出才退出账号。
4. **本机库这一轮不按账号隔离**：本机工作台仍按设备共用一个库（库名与审计身份不变，见 D-03），同一浏览器换账号仍看得到本机数据；按账号隔离另起一轮单独评审（2026-11-28 起由 [ADMIN-US-222](stories/collaboration/ADMIN-US-222-identity-bound-local-databases.md) 承接，见 [D-11](#d-11supabase-接入走平台标准层)）。
5. 三端 app e2e 没有协作后端：用只在 e2e 里运行的模拟认证服务（`apps/react-e2e/auth/e2e-auth-server.mjs`）先登录并保存浏览器状态；生产代码里没有任何跳过登录的开关。只起前端、不起后端时无法登录，本地开发用 `pnpm nx dev rxdb-admin-template`。

## D-11：Supabase 接入走平台标准层

2026-11-28 owner 定方向：应用连 Supabase 要有一套标准逻辑；`rxdb-adapter-supabase` 能解决的由它解决，尽量标准化；Admin 里有而平台没有的场景，列故事补齐，做成可复用能力。据此：

1. **连接层走平台。** 会话（登录、恢复、离线身份、跨标签页、换号）、身份与按身份分库、授权快照与三端按权限显隐，一律用平台能力：适配器复用会话层的同一个客户端（`SupabaseAdapterOptions.client`），身份核对用 `callerIdentity()`（平台 US-035），授权走 `rxdb_caller_grants()` → `rxdb.grants`（平台 US-029）。平台已有的直接改用；平台缺的三块已在根 requirements 立项——会话层 [US-237](../../requirements/stories/adapter/US-237-supabase-session-layer.md)、整库一个作用域 [US-039](../../requirements/stories/core/US-039-instance-access-scope.md)、只接身份与授权 [US-238](../../requirements/stories/adapter/US-238-supabase-adapter-identity-grants-only.md)，交付后改用。改用之后协作包不保留平行实现与回退分支。Admin 是这些能力的第一个三端业务验收，故事归 [ADMIN-EPIC-005](epics/ADMIN-EPIC-005.md)。
2. **数据层不变。** 团队共享数据仍仅经 PR 合并（D-06、协作契约 C06），不改用适配器的日志同步与直写，也不对同一份团队数据开日志同步双写，与平台 [epic-015](../../requirements/epics/epic-015-identity-scoped-sync.md) 的非目标一致：日志同步不保留提交身份，直写模式下有 `edit` 就能改共享数据，与「任何客户端都不能直写共享数据」冲突。
3. **独有场景登记为平台候选。** 提交图的服务端交换、仅经 PR 写入、成员邀请与协作实时登记为平台 [epic-017](../../requirements/epics/epic-017-pr-only-team-data.md)（价值待证，等第二个使用方）。平台交付之前，协作包的服务端、命令入口、读取投影与实时频道保持现状；迁移另立 Admin 故事。
4. **D-10 第 4 条由 ADMIN-US-222 承接。** 本机工作台库与团队库都按身份命名并绑定；交付后 D-03 的默认数据库名 `admin-workbench` 改作按身份派生库名的基础名。2026-11-28 owner 定：旧的设备共用库直接弃用（不打开、不迁移、不删除），工作台审计身份仍写 `'userId'`。

评估、对照、本次合并的影响与实施顺序见 [Supabase 接入标准化计划](plans/supabase-standardization-tasks.md)。
