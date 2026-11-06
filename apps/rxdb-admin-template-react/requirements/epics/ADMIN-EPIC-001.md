---
id: ADMIN-EPIC-001
status: In Progress
startDate: 2026-11-06
targetDate: TBD
owner: jimmy
---

# Admin 应用模板孵化

## 愿景

在现有数据工作台上沉淀可定制的 Admin 应用基线，让新业务复用外壳和模型驱动页面，在当前仓库完成真实场景验证，再评估独立启动项目模板。

## 目标

- [ ] 应用需求独立管理，门禁约束状态、引用与派生视图（[ADMIN-US-001](../stories/platform/ADMIN-US-001-application-requirements.md)）。
- [ ] 应用标识与本机存储配置集中，默认数据兼容且首屏主题一致（[ADMIN-US-002](../stories/platform/ADMIN-US-002-application-configuration.md)）。
- [ ] 新业务实体贯通列表、表单、导航和搜索（[ADMIN-US-101](../stories/domain/ADMIN-US-101-replace-sample-domain.md)）。
- [ ] 自定义页面与导航可按明确路径扩展，并复用外壳行为（[ADMIN-US-102](../stories/domain/ADMIN-US-102-custom-pages-navigation.md)）。

## 故事

本清单只列范围，状态见 [status-overview](../status-overview.md)。

- [ADMIN-US-001 应用需求管理与结构门禁](../stories/platform/ADMIN-US-001-application-requirements.md) (High)
- [ADMIN-US-002 应用标识与存储配置](../stories/platform/ADMIN-US-002-application-configuration.md) (High)
- [ADMIN-US-101 示例实体替换与元数据贯通](../stories/domain/ADMIN-US-101-replace-sample-domain.md) (Medium)
- [ADMIN-US-102 自定义页面与导航扩展路径](../stories/domain/ADMIN-US-102-custom-pages-navigation.md) (Medium)

## 非目标

- 当前批次不实施独立复制、导出、生成器、发包或仓外安装。
- 不随模板孵化加入账号认证、多用户授权、云端同步或桌面宿主。
- 不重写公共后台框架；公共包能力继续由平台故事管理。
