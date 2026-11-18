# 当前分支剩余工作盘点

2026-11-17，分支 `012-web-desktop-product`，基线 `2a3e46183` 加当前未提交工作区。此页是本轮盘点快照；后续完成情况以[总计划](2026-11-17-autonomous-completion.md)、各产品故事与原始验证结果为准。Angular Aiao Desktop 和 React Web Desktop 分开统计。

## 确认仍需开发

| 范围                   | 当前缺口                                                                                                                        | 代码依据                                                                                                                                     | 执行项 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 天气的真实失败与旧读数 | 请求失败仍返回固定温度、小时和七日预报；界面将其标成上次读数。缺少完整响应校验、刷新/重试、读数时间与陈旧状态、城市切换防串数据 | `apps/web/src/app/services/weather-store.ts`、`apps/web/src/app/apps/weather/weather.html`、`apps/web/src/app/components/widgets/widgets.ts` | A05    |
| 壁纸离线               | 六张壁纸及缩略图仍请求 Unsplash，未随构建分发，也没有断网后首次逐张切换的验收                                                   | `apps/web/src/app/services/wallpaper.ts`、`apps/web/ngsw-config.json`                                                                        | A05    |
| 地图失败恢复           | 瓦片失败提示把资源不可用说成无网络；搜索没有完整响应校验与显式重试                                                              | `apps/web/src/app/apps/maps/maps.ts`、`maps.html`                                                                                            | A05    |
| Aiao Code 文件协作     | 已有 Orbit 握手与窗口接入，工作台仍维护独立 OPFS 项目；桌面磁盘与工作台之间缺少可见的复制导入/导出闭环                          | 仓库根 `apps/aiao-vscode/src/app/orbit-embedding.ts`、`src/workbench/mount.ts`；`packages/orbit/src/desktop.ts`                              | A05    |
| Aiao Code 必要宿主能力 | 目录选择和 OAuth 直接使用浏览器 API，嵌入权限与存储分区下的成功/失败语义尚未闭环；真实账户授权不能靠自动测试虚构                | 仓库根 `apps/aiao-vscode/src/workbench/git/github/github-login.ts`、`packages/orbit/src/frame.ts`                                            | A05    |
| 帮助、数据与能力说明   | 仍需把本站数据、远程应用数据、备份/清理范围、权限失败和快捷键替代路径整合成用户可达的说明入口                                   | [候选方向](../future-requirements.md)、[总计划 A06](2026-11-17-autonomous-completion.md)                                                     | A06    |

A06 还需逐应用检查主要任务和失败路径；未经核对的界面不能直接判成未开发，也不能仅凭能打开应用认定完整可用。

## 已实现但尚未收尾

- **ADESK-US-112 运行状态与隐藏资源管理**：已移除活动监视器的虚构资源数字，已实现真实窗口列表、显示与协商关闭，以及游戏最小化、锁屏、睡眠、页面隐藏时停止绘制和音频。常规浏览器与单测已有通过记录，正在完成关联回归和证据归档。专用本机 Chrome 测试的生命周期检查通过，鼠标锁定仍失败；最近原始报告显示 Chrome `active=false`、前台为 macOS `loginwindow`，不把整组 GPU 验收写成通过。
- **React Web Desktop**：42 条故事全部 In Progress；97 项任务勾选 9 项；256 条 AC 中 159 条尚未登记匹配用例。文件管理、编辑保存、窗口、安装/更新、离线、备份和多标签页已有实现与自动化片段，**这些统计表示完整验收未关闭，不表示 42 项功能均未开发**。需按逐 AC 登记表补齐测试、核查真实实现差距、三框架与既有消费者回归、标准性能样本和堆回收测量。
- **整体交付**：A08 的两个产品需求派生视图、当前工作区完整受影响门禁、生产产物和自动发布验证尚未完成；改动尚未提交或部署。

## 不再列为未开发

A01 文档保存与未保存保护、A02 Finder 文件管理/本机导入导出/恢复、A03 完整备份恢复与存储健康、A04 批准目录安装/更新/回退/卸载，均已在工作区实现并归档自动证据。正式批准目录当前为空属于运营内容缺失，不能虚构真实应用版本填充。

盘点时 Angular 正式故事为 28 条：26 Done、1 In Progress（US-112）、1 In Review（US-108）；排除 `story.template.md`。

## 需要人工或外部输入的验收

- Angular US-108 的 VoiceOver 实际播报，按已有指示延期。
- React 的真实支持环境、物理键盘、中文 IME、读屏及 10 名首次用户研究。
- 实际 GitHub 账户授权、运营批准应用的不可变版本、需要外部凭据的正式发布。
- 本机登录窗口在前台时，无法用 Chrome 合成点击完成鼠标锁定实测；保留失败与环境信息，不代替用户解锁会话。

参考：[Angular 状态](../status-overview.md)、[React 状态](../../../apps/web-desktop/requirements/status-overview.md)、[React 逐 AC 台账](../../../apps/web-desktop/requirements/acceptance-evidence.md)、[任务清单](../../../specs/001-web-desktop-product/tasks.md)。

## 同日完成后注记

本页上方保留盘点时的快照。随后 US-112、US-113 已完成本地正式构建验收：真实运行状态与游戏隐藏暂停、天气真实状态与重试、六张本地离线壁纸、地图失败恢复不再属于未开发功能。当前 29 条 Angular 故事为 28 Done、1 In Review；Aiao Code 文件协作及必要宿主能力、A06～A09 仍未完成。所有本轮改动尚未提交或发布。

US-208 后续注记：Aiao Code 单文件/项目 ZIP 复制、嵌入本机文件夹输入及登录限制已完成本地正式构建自动验收，A05 已完成。Angular 30 条故事为 29 Done、1 In Review；应用侧 US-412 按合并要求保持 In Review。A06～A09 继续，所有本轮改动尚未提交或发布。

A06 后续注记：US-114 的实际内容复制与打印、分享菜单键盘路径已完成并归档。仍未实现或有缺陷的内置应用主要流程已列入[逐应用台账](2026-11-17-builtin-workflows.md)，其中 Notes/Reminders/Messages 草稿失败保护是下一优先项。
