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

团队模式使用共享编辑器和 PR 四页签；既有匿名 RxDB 资产工作台及数据标识保持独立。现有 `rxdb-plugin-working-tree` 没有直接用于团队任务持久化，不以平台插件状态替代产品验收。工作区版本通知通过 Supabase Realtime 触发受授权的 API 读取，通知负载不包含业务内容。完整实现与测试范围见 [协作记录](plans/collaboration-implementation.md)。
