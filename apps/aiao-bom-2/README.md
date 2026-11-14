# aiao-bom-2

以结构表为核心的 BOM 与 3D 工作台。主表使用 VTable Canvas，模型使用 Three.js，默认加载 Windrose 公开资料的固定快照。新应用独立于 `aiao-bom`，没有替换旧站或共用旧库。

独立公开预览：<https://aiao-bom-2.aiao.workers.dev>。2026-11-14 已完成公网 3D、SQLite、备份恢复、移动导航与发布文件校验；原站保留。完整证据见 [最终验收](requirements/completion-verification-2026-11-14.md#独立公开预览验收)。

```bash
pnpm nx serve aiao-bom-2
pnpm nx run aiao-bom-2:serve-static
```

开发和生产静态预览端口为 `4313`，构建产物为 `dist/apps/aiao-bom-2/browser`。E2E 独占 `4314`，Wrangler 本地预览使用 `4315`。同一时刻选择一种 4313 服务。

| 工作区     | 已实现能力                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 结构表     | 系统分类、采购层级、CAD 场景；树、逐位置平铺、物料汇总；系统范围、面包屑、搜索、筛选、排序、20 列配置、紧凑密度、复选、多位置身份 |
| 大规模数据 | Worker 生成和建立压力样本索引；平铺 500 行窗口，最多 8 页；宽分支每批 500 条；树深度预算 128 层，可进入边界继续查看，平铺保留全量 |
| 三维视图   | 本地整车 GLB、远程独立零件 GLB；Draco / Meshopt；表格与模型选择联动；聚焦、隔离、透明、视角、重试、取消及资源释放                 |
| 工作草稿   | 建立草稿、批量数量与成本、增删移动、30 步撤销重做、关系和数量校验、需求展开、已知行成本、基线差异                                 |
| 版本快照   | 完整结构留档、评估日期、基准 / 目标比较、发生位置差异、搜索与分页、快照及完整差异 JSON 导出、预览导入、原子追加与跨标签页覆盖保护 |
| 领域工作区 | `/domain` 进入原有领域流程；展开、成本、两时点改版核对、ECN、生效域、双图映射、实例换件与追溯；原有领域内核与共享 UI 惰性加载     |
| 迁移       | `/transfer` 下载完整领域归档、校验后恢复到新库、刷新恢复库身份、保留原库并回退；结构草稿核对后可转入领域草稿并发布                |
| 数据       | 严格 JSON 导入预览与重入、当前结果 CSV、完整草稿 JSON、来源及哈希记录；草稿和视图保存到独立 IndexedDB                             |

数量使用公共 BOM 包的 Decimal 运算。缺量、歧义量、未经确认的参考量会阻断对应分支计算，界面显示问题。汇总列是直接用量合计；成本是独立行成本合计，各层报价不能重复包含子件价格。

系统分类、采购关系与 CAD 场景分别保存。1,424 是主清单 Group 数；813 是采购出现位置；8,791 是场景节点数。1,170 个主清单 Group 有模型候选，并不代表所有市场变体或位置已确认。来源的 `2026-12` 是来源声明标签，采集日为 **2026-11-13**。

原始输入位于 `fixtures/windrose-2026-11-13/`；规范化数据和追溯信息位于 `public/data/`；整车文件及解码器位于 `public/models/`、`public/draco/`。固定快照可以离线重建：

```bash
pnpm nx run aiao-bom-2:refresh-data
```

设置 `BOM_SOURCE_DIR` 可指定同格式输入目录。重建脚本不会因数量缺失而填 1，也不会从参考层级生成制造数量。

```bash
pnpm nx run-many --projects=aiao-bom-2,aiao-bom-2-e2e --targets=lint,typecheck,spec-typecheck,test,build,e2e --parallel=1 --skipRemoteCache
pnpm nx run aiao-bom-2:test --coverage
pnpm nx run aiao-bom-2:deploy-check
pnpm nx run aiao-bom-2:preview
```

覆盖率对应用运行源码的 statements / branches / functions / lines 四项执行 80% 门槛；Worker 入口由浏览器压力测试验收。`deploy-check` 只打包和校验，Cloudflare 配置使用独立名称 `aiao-bom-2`，Wrangler `4.158.0`，兼容日期固定为运行时支持的 `2026-11-11`。公开预览与最终门禁状态以最新验收记录为准。

结构草稿、版本快照和视图保存在 IndexedDB `aiao-bom-2-workspace-v1`；领域库使用 `aiao-bom-2-domain-v1`，旧版使用 `dev-rxdb-bom`。共享领域实现位于 `modules/bom-workspace`，通过路由参数隔离库身份。恢复归档使用全新短名称库，成功后才切换活动库指针；不会覆盖旧库。已加载会话可以继续浏览和编辑；没有 Service Worker，不承诺离线冷启动。独立零件模型需要来源服务器允许 CORS；失败不影响表格。

[交付及验收记录](requirements/implementation-report-2026-11-13.md)列出了实测、限制和替换前必须完成的工作。原改善方案位于 [aiao-bom 的计划目录](../aiao-bom/requirements/plans/aiao-bom-2-improvement-plan-2026-11-13.md)。

[版本快照说明与验收](requirements/version-snapshots-2026-11-14.md)说明了评估日期、比较身份、数量边界与存储约定；用户标记的快照日期不替代领域 ECN 生效解析。

[领域迁移与回退运行说明](requirements/domain-migration-2026-11-14.md)说明归档范围、真实库迁移顺序、来源对应关系与演练边界。

[2026-11-14 最终验收](requirements/completion-verification-2026-11-14.md)与[任务核对表](requirements/completion-tasks-2026-11-14.md)记录领域迁移、性能、跨浏览器和独立部署结果。
