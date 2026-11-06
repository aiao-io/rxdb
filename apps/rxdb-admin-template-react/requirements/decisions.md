# Admin 应用决策

## D-01：在当前仓库孵化

`rxdb-admin-template-react` 定位为 Admin 应用模板的孵化源，同时保留后台框架的领域贯穿测试职责。当前使用 Nx 工作区、workspace 包和明确框架的应用名 `rxdb-admin-template-react`；用户明确当前不考虑复制。未来可成为独立 Admin 启动项目模板，但本批次不实施独立工程、导出或发包。

当前授权工作为应用需求管理、配置基线及完整客户端国际化；后续实体替换、自定义页面按 [roadmap](roadmap.md) 的前置和实际业务推进。

移除额外的消费示例应用及其 E2E，由本模板承接公开包消费与接入成本验证。对应平台 [US-528](../../../requirements/stories/domain/US-528-admin-consumer-example.md) 保留 Backlog，仓内回归不替代发布产物的独立消费验收。

## D-02：应用与公共能力分开验收

应用使用 `ADMIN-US-*` / `ADMIN-EPIC-*`。平台故事保留在根 requirements，使用 `capabilities` 引用，应用内依赖使用 `dependsOn`。平台完成不代表本应用已接线或验收。

当前孵化应用使用 React。公共 `rxdb-admin` / `rxdb-model` 等包继续遵守 Angular / React / Vue 对称与同 PR 合并治理；不为应用孵化额外创建两份应用模板。

## D-03：数据兼容与宿主边界

保留默认数据库名 `admin-workbench`、偏好前缀 `aiao.workbench` 和旧偏好迁移。新业务改名意味着使用另一份本机数据，不自动迁移原库。更换既有数据标识须另设迁移故事。

当前数据库组合固定为 sqlite-wasm 主线程 + IndexedDB，见 [setup_rxdb](../src/app/rxdb/setup_rxdb.ts)。搜索依赖 FTS5，备份恢复有后端组合限制；适配器选择不是本批次模板配置选项。

## D-04：模板扩展先验证实际路径

资产分类 → 资产 → 维护记录是默认可操作样例。统一标识配置不会自动消除全部领域耦合；实体替换和自定义页面必须分别通过 [ADMIN-US-101](stories/domain/ADMIN-US-101-replace-sample-domain.md) / [ADMIN-US-102](stories/domain/ADMIN-US-102-custom-pages-navigation.md) 验收。先复用现有元数据、路由和菜单接口，真实重复出现后再抽象。

## D-05：国际化与恢复边界

完整客户端国际化由 [ADMIN-US-003](stories/platform/ADMIN-US-003-client-i18n.md) 验收。外壳、应用页面和模型组件共用静态 `I18n` 运行时；语言由外壳现有 `app.locale` 持久化和跨 Tab 通知维护，不新增偏好实体或同步通道。

首页与恢复页切换语言不能连接业务数据库，恢复归档仍须先于连接。实体及字段显示名属于呈现层，存储字段、数据值、默认状态和已有归档保持原样；业务记录的多语言翻译另按平台 US-910 定义。
