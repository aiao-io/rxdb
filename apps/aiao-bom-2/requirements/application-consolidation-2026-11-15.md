# BOM 开发应用整合

日期：2026-11-15。应用仍处于开发阶段。本次将唯一开发入口统一为 `aiao-bom-2`，删除旧 `aiao-bom` 与 `aiao-bom-e2e` 项目。

## 代码与需求归属

- 结构表和 3D 工作台：`apps/aiao-bom-2`。
- 领域页面、业务服务与状态：`modules/bom-workspace`，通过领域路由显式提供配置。
- 领域内核及 Angular / React / Vue 绑定：保留现有 `packages/rxdb-plugin-bom*`。
- BOM 应用故事、计划和验收资料：本目录；历史日期记录保留原有上下文，当前运行命令以应用 README 为准。
- 需求结构检查及其回归：`../scripts/check-requirements.mjs` 与 `check-requirements.spec.mjs`，CI 统一调用新版任务。

## 回归范围

旧版 40 项领域业务回归移入 `apps/aiao-bom-2-e2e/src/domain/`，从 `/domain` 进入。备份恢复回归改为在新版准备包含草稿、长 Decimal、ECN 与换件历史的领域数据，再验证完整恢复、schema 与数据逐项一致、损坏归档拒绝、刷新保留活动库、回退及原库不变。测试只启动新版服务。

五项 Cloudflare 响应头、WASM、深链接、重开和移动端回归保留为新版独立目标；默认使用本地 Wrangler。

## 验证

验证完成后登记本次源码检查、需求门禁、浏览器回归与受影响门禁结果。
