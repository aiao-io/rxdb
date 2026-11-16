# Admin 应用决策

## D-01：在当前仓库孵化

`rxdb-admin-template-react` 定位为 Admin 应用模板的孵化源，同时保留后台框架的领域贯穿测试职责。当前使用 Nx 工作区、workspace 包和明确框架的应用名 `rxdb-admin-template-react`；用户明确当前不考虑复制。未来可成为独立 Admin 启动项目模板，但本批次不实施独立工程、导出或发包。

当前工作覆盖应用需求管理、配置基线、三端完整客户端国际化与 Dashboard 页面扩展验收；实体替换仍按 [roadmap](roadmap.md) 的新业务前置推进。

移除额外的消费示例应用及其 E2E，由本模板承接公开包消费与接入成本验证。对应平台 [US-528](../../../requirements/stories/domain/US-528-admin-consumer-example.md) 保留 Backlog，仓内回归不替代发布产物的独立消费验收。

## D-02：应用与公共能力分开验收

应用使用 `ADMIN-US-*` / `ADMIN-EPIC-*`。平台故事保留在根 requirements，使用 `capabilities` 引用，应用内依赖使用 `dependsOn`。平台完成不代表本应用已接线或验收。

React 是需求孵化源；仓库已提供 `rxdb-admin-template-angular` / `rxdb-admin-template-react` / `rxdb-admin-template-vue` 三个 Web 模板，使用同一套浏览器验收契约。公共 `rxdb-admin` / `rxdb-model` 等包与应用功能继续遵守 Angular / React / Vue 对称与同 PR 合并治理。三端均在仓库内孵化，独立导出尚未进入范围。

## D-03：数据兼容与宿主边界

保留默认数据库名 `admin-workbench`、偏好前缀 `aiao.workbench` 和旧偏好迁移。新业务改名意味着使用另一份本机数据，不自动迁移原库。更换既有数据标识须另设迁移故事。

当前数据库组合固定为 sqlite-wasm 主线程 + IndexedDB，见 [setup_rxdb](../src/app/rxdb/setup_rxdb.ts)。搜索依赖 FTS5，备份恢复有后端组合限制；适配器选择不是本批次模板配置选项。

## D-04：模板扩展先验证实际路径

资产分类 → 资产 → 维护记录是默认可操作样例。统一标识配置不会自动消除全部领域耦合；实体替换和自定义页面必须分别通过 [ADMIN-US-101](stories/domain/ADMIN-US-101-replace-sample-domain.md) / [ADMIN-US-102](stories/domain/ADMIN-US-102-custom-pages-navigation.md) 验收。先复用现有元数据、路由和菜单接口，真实重复出现后再抽象。

## D-05：国际化与恢复边界

完整客户端国际化由 [ADMIN-US-003](stories/platform/ADMIN-US-003-client-i18n.md) 验收。外壳、应用页面和模型组件共用静态 `I18n` 运行时；语言由外壳现有 `app.locale` 持久化和跨 Tab 通知维护，不新增偏好实体或同步通道。

首页与恢复页切换语言不能连接业务数据库，恢复归档仍须先于连接。实体及字段显示名属于呈现层，存储字段、数据值、默认状态和已有归档保持原样；业务记录的多语言翻译另按平台 US-910 定义。


## D-06：数据协作的产品模型

认证、团队、草稿、同步和合并按不同边界建模，不能把它们压缩成一个“发布”按钮：

1. 保存只表示当前设备持久化；同步只把任务草稿上传到云端；合并才把服务端确认的变更写入团队共享数据。
2. 一个任务对应一份草稿和一个来源分支；数据 PR 可以持续追加提交，审核和检查绑定当前来源版本。
3. 合并条件由目标分支权限、当前版本检查、冲突、必须处理的讨论和团队审批策略共同决定；审核权与合并权独立。
4. 合并使用服务端再校验和原子事务，业务数据、PR 状态和审计记录一起成功或一起回滚。
5. 旧版本恢复产生新的任务草稿，不移动共享头、不删除历史；Angular、React、Vue 共用上述状态和权限规则。

对应需求入口为 [ADMIN-EPIC-002](epics/ADMIN-EPIC-002.md) 和 [ADMIN-EPIC-003](epics/ADMIN-EPIC-003.md)。
