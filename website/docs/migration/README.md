# 迁移指南

本节汇总跨版本、跨框架、跨适配器与跨插件的迁移操作。按你的场景选择：

- [v0 → 1.0 升级](./v1.md)：破坏性变更清单与升级步骤
- [框架绑定迁移](./frameworks.md)：Angular / React / Vue 之间或版本升级
- [适配器切换与数据迁移](./adapters.md)：更换存储后端
- [Supabase 传输失败错误类型迁移](./supabase-network-errors.md)：连不上远端时改抛 core 的 `NetworkOfflineError`，请用 `isNetworkError` 判离线
- [HTTP 适配器翻页键改名](./http-page-token.md)：`ctx.cursor` → `ctx.pageToken`、`nextCursor` → `nextPageToken`，与 core 的 keyset 游标区分开
- [桌面适配器拆包](./desktop-split.md)：`rxdb-adapter-desktop` 拆成 `-electron` / `-tauri` 两个包
- [插件升级与启用](./plugins.md)：启用/升级插件（如全文搜索）
- [插件作用域契约迁移](./plugin-scope.md)：`install(scope)` 新契约、`destroy()` 废弃与随之而来的行为变化
- [生成器 `default` 语义迁移](./generator-default.md)：函数 `default` 从静默丢弃改为生成期报错，bigint / `Uint8Array` / `Date` 不再被改写
- [Schema 迁移](./schema.md)：实体结构变更时的数据迁移

> 版本策略与兼容承诺见[版本与 API 稳定性策略](../versioning.md)，各包版本对应关系见[兼容矩阵](../compatibility.md)。
