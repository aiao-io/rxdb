# 三框架 API 对称检查：RxDB Model 与 Working Tree

**日期**：2026-11-15

**范围**：`@aiao/rxdb-model-{angular,react,vue}`、`@aiao/rxdb-plugin-working-tree-{angular,react,vue}`。

**检查方式**：逐一读取六个适配包的 `src/index.ts`，比较运行时入口、类型入口和核心包透传；Aiao Media Admin 的 Angular 私有页面不作为公共包对称性缺口。

## 结果

| 公共能力 | Angular | React | Vue | 结论 |
| --- | --- | --- | --- | --- |
| `cn` | ✅ | ✅ | ✅ | 三端从 `@aiao/rxdb-model` 透传 |
| Headless bindings | ✅ | ✅ | ✅ | 三端均提供模型控制器绑定 |
| Entity Detail | ✅ `EntityDetailComponent` | ✅ `EntityDetail` | ✅ `EntityDetail` | 框架组件命名按平台约定变化 |
| Entity Dialog | ✅ | ✅ | ✅ | 三端均导出 |
| Entity Form | ✅ `EntityFormComponent` | ✅ `EntityForm` | ✅ `EntityForm` | 框架组件命名按平台约定变化 |
| Entity List | ✅ `EntityListComponent` | ✅ `EntityList` | ✅ `EntityList` | Angular 页面使用 `rxdb-entity-list` |
| Entity Table | ✅ | ✅ | ✅ | 三端均导出 |
| Query Builder | ✅ | ✅ | ✅ | 三端均导出 |
| `useWorkingTree` | ✅ | ✅ | ✅ | 三端统一入口名，返回平台资源 |
| `WorkingTreeResource` | ✅ | ✅ | ✅ | 三端统一类型名 |
| `useWorktrees` | ✅ | ✅ | ✅ | 三端统一入口名 |
| `WorktreesResource` | ✅ | ✅ | ✅ | 三端统一类型名 |

## 判定

🟢 **通过**。公共包的共享类型和能力均有三端入口；Angular 的 `Component` 后缀属于 Angular 组件约定，React/Vue 使用组件名或组合式入口，未发现单端缺失。

Aiao Media 的 `apps/admin` 是独立 Angular 产品，因此 `AdminConfigModelComponent`、Admin 配置状态文案和 Supabase client 接线属于应用私有实现，不要求在 React/Vue 产品中复制。公共领域实体仍从 `@aiao-media/domain` 注册，公共 `rxdb-model` 和 working-tree 适配层保持三端对称。

## 仍需验证

本报告只证明公开 API 的导出对称，不替代行为验证。后续仍需补充：

- Admin Entity List 内部的详情、表单、表格编辑和字段校验的浏览器验证；
- working-tree branch/merge/commit 的真实集成验证；
- 后台 RxDB 与本地 Supabase 的 Realtime、游标恢复、tombstone 和 revision 冲突验证。
