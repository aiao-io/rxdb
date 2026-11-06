# Admin 应用能力矩阵

本表区分源码可见的现有接线和应用故事的验收状态。当前执行证据见 [verification-report](verification-report.md)。

| 能力                             | 当前入口与边界                                                                                                           | 应用验收                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 本地实体 CRUD、关联与筛选        | [ENTITIES](../src/app/entities/asset-entities.ts)、[EntityListPage](../src/app/pages/entity-list-page.tsx)；默认资产样例 | 原场景见平台 [US-526](../../../requirements/stories/domain/US-526-admin-workbench.md)，跨业务替换由 ADMIN-US-101 验收 |
| 全文搜索与记录跳转               | [SearchPage](../src/app/pages/search-page.tsx)、[createRecordSearchSource](../src/app/shell/record-search.ts)            | 现有样例接线可读；新实体显示名与跳转待 ADMIN-US-101                                                                   |
| 刷新重开与备份恢复               | [setup_rxdb](../src/app/rxdb/setup_rxdb.ts)、[backup-ops](../src/app/backup/backup-ops.ts)                               | 固定后端组合；原闭环见平台 [US-527](../../../requirements/stories/domain/US-527-admin-backup-restore.md)              |
| 主题、布局、页签、命令面板与锁屏 | [workbenchShell](../src/app/shell/workbench-shell.ts)                                                                    | 已接线，不推断认证或服务端权限；平台 US-530～533 状态独立维护                                                         |
| 应用级需求与门禁                 | [ADMIN-US-001](stories/platform/ADMIN-US-001-application-requirements.md)                                                | 当前批次，本地证据见验收台账                                                                                          |
| 统一应用标识与存储配置           | [ADMIN-US-002](stories/platform/ADMIN-US-002-application-configuration.md)                                               | 当前批次，保留默认数据标识                                                                                            |
| 新业务实体替换                   | [ADMIN-US-101](stories/domain/ADMIN-US-101-replace-sample-domain.md)                                                     | 待新业务闭环，不能用默认资产用例代替                                                                                  |
| 自定义业务页面扩展               | [ADMIN-US-102](stories/domain/ADMIN-US-102-custom-pages-navigation.md)                                                   | 待实际页面及导航回归                                                                                                  |
| 独立仓库启动模板                 | [长期目标](future-requirements.md)                                                                                       | 当前不实施、不声明已支持                                                                                              |

不支持声明：本轮不包含账号认证、多用户授权隔离、云端数据协作或桌面宿主验收。
