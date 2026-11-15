# Admin 应用路线图

当前在本仓库孵化 Angular / React / Vue 三端模板，未来独立导出暂不进入实施批次。状态见 [status-overview](status-overview.md)，不在本页维护第二份状态。

## 当前评审批次

| 故事                                                                              | 本地验收与合入条件                                                                                                                               |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [ADMIN-US-003](stories/platform/ADMIN-US-003-client-i18n.md) 完整客户端国际化     | 三端六项 AC 本地通过；见 [国际化证据](plans/client-i18n-verification.md)，待统一评审与合并                                                       |
| [ADMIN-US-102](stories/domain/ADMIN-US-102-custom-pages-navigation.md) 自定义页面 | Dashboard、桌面／移动导航、深链刷新、页签、面包屑、命令面板与偏好扩展本地通过；见 [扩展指南](plans/custom-pages-navigation.md)，待统一评审与合并 |

公共元数据呈现能力与应用接线在同一变更内评审、验证。Done 仍以合并并补齐同层验收证据为准。

## 后续前置

[ADMIN-US-101](stories/domain/ADMIN-US-101-replace-sample-domain.md) 等待一组真实的新业务关联实体、字段、关系与非 assets 命名空间；确定后验证新业务 CRUD、关联筛选、搜索、Dashboard、刷新重开和备份恢复，同时保留默认资产回归。Dashboard 已验证非 CRUD 页面路径，自定义页面不再依赖另找实例。

大日志量活动查询和构建体积治理继续按 [优化清单 T04 / T05](plans/nexus-template-optimization-tasks.md) 单独确认范围与预算，不并入已完成的国际化或页面扩展验收。

## 不排期目标

独立仓库启动模板、认证授权、云端协作与桌面宿主见 [future-requirements](future-requirements.md)，需在具体使用场景出现后明确新故事和验收条件。
