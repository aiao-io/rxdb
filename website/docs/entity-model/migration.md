# 迁移说明

## 从企业版包迁移

开源版 `@aiao/rxdb-model` / `@aiao/rxdb-model-angular` 移植自企业版同名包，React / Vue 绑定（`@aiao/rxdb-model-react` / `@aiao/rxdb-model-vue`）为同一批组件集的三端对称交付。迁移注意点：

- **图标库**：使用仓库标准图标包（lucide 图标数据），替换企业版的旧包名依赖；图标数据格式不变。
- **表格引擎**：沿用企业版技术选型 VTable，版本锁定 1.26.x 系列，以对等依赖形式由消费方提供。
- **样式策略**：消费方样式管线约定为 Tailwind + daisyUI 类名；组件包不发布编译 CSS（见[样式接入](styling.md)）。企业版依赖的旧样式产物不再有效。
- **文案**：界面与错误文案沿用中文；如未来需要国际化另行立项。

`rxdb-model` 是实体元数据的投影层（表单 / 详情 / 表格 / 查询构建器），不引入新的集合或 schema，无数据迁移需求。

## 操作列删除判定

`actionsColumn` 的第三位新增**必填**参数 `canDelete`（破坏性变更），原来第三位的查看文案顺延到第四位：

```typescript
// 之前
actionsColumn(title: string, deleteLabel: string, viewLabel?: string): ColumnDefine;

// 之后
actionsColumn(title: string, deleteLabel: string, canDelete: RecordDeletePredicate, viewLabel?: string): ColumnDefine;
```

两参、三参的旧调用在编译期报 TS2554 / TS2345；只通过 `EntityList` 或 `buildEditableColumns` 使用操作列的应用不受影响。完整背景、按实体权限的改法与按行判定的示例见[迁移指南：操作列删除判定](../migration/actions-column-can-delete.md)。

## 实体操作权限模型（US-027）

实体的写操作权限拆成 create / update / delete 三种独立能力（各为 `both` 或 `system`），界面行为随权限派生：

- `create: 'system'`：列表不提供「+ 新增」；
- `update: 'system'`：行降级为只读，「查看」以 view 模式打开详情，仍可删除（若 `delete` 允许）；
- `delete: 'system'`：操作列不出「删除」，行仍可编辑。

跨版本维护 `actionsColumn` 调用或自定义操作列的消费方，请按 `deriveEntityCapabilities(metadata)` 派生 `canDelete`，与 `EntityList` 内部的判定保持一致。
