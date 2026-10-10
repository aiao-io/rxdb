# 实体模型组件（rxdb-model）

`@aiao/rxdb-model` 是 RxDB 的实体模型组件族：框架无关核心从实体元数据（`EntityMetadata`）派生实体管理界面所需的全部纯逻辑——entity-form 元数据→表单、entity-detail 详情页、entity-table 可编辑表格、query-builder 可视化查询构建器引擎；Angular / React / Vue 三套 UI 组件集在其上提供现成的列表、详情、表单、对话框、表格与查询构建器组件。

查询构建器引擎以 `createQueryBuilderService` 创建，支持 AND/OR 分组、拖拽重排，并可通过 `toRxDBQuery()` 输出 RxDB 查询。三套组件集命名与核心包对称：`@aiao/rxdb-model` / `@aiao/rxdb-model-angular` / `@aiao/rxdb-model-react` / `@aiao/rxdb-model-vue`。

## 包结构

| 包                         | 说明                                                        |
| -------------------------- | ----------------------------------------------------------- |
| `@aiao/rxdb-model`         | 框架无关核心：元数据驱动的表单 / 详情 / 表格 / 查询构建器引擎 |
| `@aiao/rxdb-model-angular` | Angular 组件集（`rxdb-entity-*` 选择器）                    |
| `@aiao/rxdb-model-react`   | React 组件集                                                |
| `@aiao/rxdb-model-vue`     | Vue 3 组件集                                                |

:::note 唯一输入源

核心包只认 `@aiao/rxdb` 实体装饰器体系产出的 `EntityMetadata`，不含任何框架依赖；三框架组件包只承载组件壳与平台集成，领域逻辑全部来自核心包。
:::

核心模块职责：

| 模块                                                          | 职责                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `entity-field.utils` / `entity-value.utils` / `structural-equal` | 字段配置提取、字段值解析/格式化/校验、键序无关的结构化深比较                                            |
| `entity-form/`                                                | 元数据 → 表单字段配置（create/edit/view 三模式）、实体与表单数据双向转换（仅变化字段）、表单校验        |
| `entity-detail/`                                              | 元数据 → 详情页 Tab 结构（基础表单 + 每关系一个表格 Tab）                                               |
| `entity-table/`                                               | 可编辑表格列构建、15 个 VTable 单元格编辑器、剪贴板 / 键盘 / 主题 / tooltip / 拖拽重排等运行时基础设施 |
| `query-builder/`                                              | 可视化查询构建器引擎：状态服务、操作符注册表、查询转换、schema 解析、即时校验、字段树等工具             |

:::warning 与核心包同名模块的边界

`@aiao/rxdb` 核心包的 `entity-field.utils` 与 `entity-value.utils` 服务于核心内部与插件契约；`@aiao/rxdb-model` 的同名模块面向「实体管理界面」场景（表单字段提取、字段值解析/格式化/校验、表格列构建），语义不同，请勿混用。
:::

表格引擎 `@visactor/vtable` 与 `@visactor/vtable-editors` 是核心包的 peer 依赖（`~1.26.x`），由消费方提供。

## 安装

```bash npm2yarn
# 框架无关核心 + 撤销重做插件（EntityList 依赖）
npm install @aiao/rxdb @aiao/rxdb-model @aiao/rxdb-plugin-history

# 按框架选其一
npm install @aiao/rxdb-model-angular
npm install @aiao/rxdb-react @aiao/rxdb-model-react react rxjs @visactor/vtable lucide-react
npm install @aiao/rxdb-vue @aiao/rxdb-model-vue vue rxjs @visactor/vtable @lucide/vue
```

主要 peer 依赖（npm 7+ 会自动安装，完整清单以各包 `package.json` 为准）：

| 包                         | 关键 peer 依赖                                                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `@aiao/rxdb-model`         | `@visactor/vtable` / `@visactor/vtable-editors`（`~1.26.x`，表格引擎）                                                                        |
| `@aiao/rxdb-model-angular` | `@aiao/rxdb`、`@aiao/rxdb-angular`、`@aiao/rxdb-model`、`@aiao/rxdb-plugin-history`、`@angular/cdk`、`@angular/core` 等 `@angular/*`、`@lucide/angular`、`@visactor/vtable`、`rxjs` |
| `@aiao/rxdb-model-react`   | `@aiao/rxdb`、`@aiao/rxdb-react`、`@aiao/rxdb-model`、`@aiao/rxdb-plugin-history`、`react`（`^19.3.0`）、`lucide-react`（`^1.47.0`）、`@visactor/vtable`、`rxjs` |
| `@aiao/rxdb-model-vue`     | `@aiao/rxdb`、`@aiao/rxdb-vue`、`@aiao/rxdb-model`、`@aiao/rxdb-plugin-history`、`vue`（`^3.5.43`）、`@lucide/vue`（`^1.47.0`）、`@visactor/vtable`、`rxjs` |

## 核心用法

三个主入口覆盖实体管理界面的三大块：

```ts
import { buildFormFields, buildEditableColumns, buildDetailTabs } from '@aiao/rxdb-model';

const fields = buildFormFields(metadata, 'create'); // 表单字段
const columns = buildEditableColumns(metadata);     // 可编辑表格列
const tabs = buildDetailTabs(metadata);             // 详情页 Tab
```

| 入口                                      | 职责                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `buildFormFields(metadata, mode)`         | 元数据 → 表单字段配置；`mode` 取 `'create'` / `'edit'` / `'view'`             |
| `buildEditableColumns(metadata, options?)` | 元数据 → 可编辑表格列定义（含操作列与删除能力判定）                           |
| `buildDetailTabs(metadata)`               | 元数据 → 详情页 Tab 结构：一个基础表单 Tab + 每个关系一个表格 Tab             |
| `deriveEntityCapabilities(metadata)`      | 由实体 `permissions` 声明派生 `canCreate` / `canEdit` / `canDelete`           |

配套工具：

- **表单**：`sortFormFields` / `filterVisibleFields` 整理字段；`entityToFormData` / `formDataToEntityChanges`（只取变化字段）/ `createDefaultFormData` 做实体与表单数据的双向转换。
- **表格**：`buildEditableColumns` 自动跳过 `id` / `createdAt` / `updatedAt` 等系统列；操作列的删除按钮按 `deriveEntityCapabilities(metadata).canDelete` 判定；选项可定制操作列文案（`actionsTitle` / `deleteLabel` / `viewLabel`）与关系下拉数据源（`relatedItemsProviderFactory`）。
- **权限**：`deriveEntityCapabilities` 只读 `permissions` 声明，未声明的操作按 `'both'` 计（即可用）；是不是系统表、在哪个命名空间都不参与判定。

### 查询构建器引擎

框架无关的服务层 `createQueryBuilderService`：

```ts
import { createQueryBuilderService } from '@aiao/rxdb-model';

const qb = createQueryBuilderService<MyEntity>();
qb.state$.subscribe(state => console.log(state));
qb.addRule({ field: 'title', operator: 'contains', value: 'a' });
const rxdbQuery = qb.toRxDBQuery();
```

| 成员                                                  | 职责                                                     |
| ----------------------------------------------------- | -------------------------------------------------------- |
| `state$` / `rootGroup$` / `validation$` / `query$`    | 响应式状态流（状态 / 根规则组 / 校验结果 / RxDB 查询）   |
| `addRule(parentGroupId?, rule?)`                      | 新增规则                                                 |
| `addGroup(parentGroupId?, combinator?)`               | 新增 AND/OR 分组                                         |
| `updateGroupCombinator(groupId, combinator)`          | 切换分组的 AND/OR 组合器                                 |
| `moveItem(itemId, targetGroupId, targetIndex)`        | 移动规则 / 分组（拖拽重排）                              |
| `toRxDBQuery()`                                       | 输出 `RuleGroup`，直接用于 RxDB 查询                     |
| `fromRxDBQuery(query)`                                | 从 RxDB 查询还原可视化状态                               |
| `validate()`                                          | 即时校验                                                 |

默认组合器为 `and`、最大嵌套 5 层；操作符注册表、校验服务与查询转换器均可通过 `operatorRegistry` / `validationService` / `queryConverter` 选项自定义。

## Angular

| 组件                     | selector             | 职责                                                                                                                                         |
| ------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `EntityListComponent`    | `rxdb-entity-list`   | 无限滚动实体列表：行内编辑（微任务批量合并写入）、撤销/重做（依赖 `@aiao/rxdb-plugin-history`）、筛选弹层（内嵌查询构建器）、级联新增、多对多选择模式 |
| `EntityDetailComponent`  | `rxdb-entity-detail` | Tab 式实体详情：基础表单 + 关系表格；create 模式先建内存草稿实体，保存才落库；可选 CDK Dialog 语境                                          |
| `EntityFormComponent`    | `rxdb-entity-form`   | 元数据驱动表单：按字段类型渲染 12 类输入控件，create/edit/view 三模式                                                                        |
| `EntityDialogComponent`  | `rxdb-entity-dialog` | CDK Dialog 外壳：拖拽、8 向缩放、全屏切换                                                                                                    |
| `EntityTableComponent`   | `rxdb-entity-table`  | VTable 宿主：事件绑定、暗色主题、剪贴板/键盘/tooltip 桥接                                                                                    |
| `QueryTableComponent`    | `rxdb-query-table`   | 带筛选状态栏与 `filterBar` / `emptyState` 插槽的查询表格                                                                                     |
| `QueryBuilderComponent`  | `rxdb-query-builder` | 可视化查询构建器根组件（AND/OR 分组、拖拽重排、子查询、主题注入），`entity` 输入 + `queryChange` 输出                                       |

另有 `ENTITY_TABLE_CONFIG`、`QUERY_BUILDER_THEME` 注入 token 与 `provideQueryBuilderTheme()`。

```ts
import { EntityListComponent } from '@aiao/rxdb-model-angular';

@Component({
  imports: [EntityListComponent],
  template: `<rxdb-entity-list name="Todo" namespace="public" />`
})
export class TodoPage {}
```

:::tip 撤销 / 重做

宿主装配 `@aiao/rxdb-plugin-history` 后，`EntityListComponent` 自动获得 undo/redo 能力；未装插件时按钮保持禁用，不报错。
:::

## React

```tsx
import { EntityList } from '@aiao/rxdb-model-react';

<EntityList namespace="public" name="Todo" />;
```

| 组件                                | 职责                                                             |
| ----------------------------------- | ---------------------------------------------------------------- |
| `EntityList`                        | 以 `namespace` + `name` 定位元数据的无限滚动表格，语义与 Angular 侧一致 |
| `EntityDetail`                      | Tab 式实体详情                                                   |
| `EntityDialog`                      | 对话框外壳                                                       |
| `EntityForm`                        | 元数据驱动表单                                                   |
| `EntityTable` / `QueryTable`        | VTable 表格宿主与查询表格；另导出 `ENTITY_TABLE_CONFIG` 与 `EntityTableConfigProvider` |
| `QueryBuilder`                      | 可视化查询构建器（AND/OR 分组、拖拽重排、最大 5 层嵌套、实时验证）；子组件 `FieldSelector` / `OperatorSelector` / `PopoverSelect` / `QueryGroup` / `QueryRule` / `SubqueryBuilder` / `TreeSelect` / `ValueInput` 可单独使用 |

组件均带 props 类型（`EntityListProps` / `EntityDetailProps` / `EntityDialogProps` / `EntityFormProps` / `EntityTableProps` / `QueryTableProps` / `QueryBuilderProps`）与 `RxDBQueryOutput` 查询输出类型。

## Vue

```vue
<script lang="ts" setup>
import { EntityList } from '@aiao/rxdb-model-vue';
</script>

<template>
  <EntityList name="Todo" namespace="public" />
</template>
```

| 组件                                | 职责                                                             |
| ----------------------------------- | ---------------------------------------------------------------- |
| `EntityList`                        | 实体列表（与 Angular / React 侧同语义）                          |
| `EntityDetail`                      | Tab 式实体详情（另导出 `EntityDetailDialogData` 类型）           |
| `EntityDialog`                      | 对话框外壳（浮层宿主与对话框上下文为包内实现，不随包公开）       |
| `EntityForm`                        | 元数据驱动表单                                                   |
| `EntityTable` / `QueryTable`        | VTable 表格宿主与查询表格；另导出 `ENTITY_TABLE_CONFIG`          |
| `QueryBuilder`                      | 可视化查询构建器（从 `EntityMetadata` 自动解析字段、AND/OR 分组、最大 5 层嵌套、实时验证）；子组件 `FieldSelector` / `OperatorSelector` / `PopoverSelect` / `QueryGroup` / `QueryRule` / `SubqueryBuilder` / `TreeSelect` 可单独使用，另导出拖放工具 `QueryDragDropHandler` / `calculateDropMode` |

## 样式接入

组件模板使用 **Tailwind CSS v4 + daisyUI v5** 类名，但**包本身不发布编译 CSS**（无 reset、无主题、无 daisyUI 打包），只注册自身模板为 Tailwind 扫描源，由消费方应用的样式管线生成工具类，app 主题保持权威。

Angular（需自备 Tailwind 管线）：

```css
@import 'tailwindcss';
@plugin 'daisyui';
@import '@aiao/rxdb-model-angular/tailwind.css';
```

React 侧部分组件样式（对话框 / 表格 / 拖拽指示等）打包在 `dist/index.css`，引入一次即可；模板里的 daisyUI 工具类（`btn` / `tabs` / `menu` / `fieldset` 等）同样走 Tailwind 管线：

```ts
import '@aiao/rxdb-model-react/index.css';
```

```css
@import '@aiao/rxdb-model-react/tailwind.css';
```

Vue 包同样发布 `tailwind.css` 扫描注册文件（`@import '@aiao/rxdb-model-vue/tailwind.css';`），接入方式与 Angular 侧一致。

:::warning 无样式是文档化行为

没有 Tailwind 管线的工程渲染出的组件**无样式**——这是文档化行为，不是缺陷。
:::

## 迁移说明

`actionsColumn` 的第三位参数从查看文案改为**必填**的删除判定谓词 `canDelete`（`RecordDeletePredicate`），原查看文案顺延到第四位。按 `deriveEntityCapabilities` 派生即可与 `EntityList` 内部判定一致：

```ts
import { actionsColumn, deriveEntityCapabilities } from '@aiao/rxdb-model';

const { canDelete } = deriveEntityCapabilities(metadata);

// 之前
actionsColumn('操作', '删除', '查看');
// 之后
actionsColumn('操作', '删除', () => canDelete, '查看');
```

只通过 `EntityList`（Angular / React / Vue）或 `buildEditableColumns` 使用操作列、从未直接调用 `actionsColumn` 的应用不受影响。完整迁移步骤见 [操作列删除判定](../migration/actions-column-can-delete.md)。

## 相关文档

- [历史、撤销与重做](../plugins/rxdb-plugin-history/README.md)：`EntityList` 的 undo/redo 依赖 `@aiao/rxdb-plugin-history`
- [实体列表拖拽排序](../model-mutation/reorder.md)：排序域声明与三框架拖放持久化（页面建设中）
- [实体操作权限](../model-definition/permissions.md)：`permissions` 声明、`PermissionDeniedError` 快速失败与三框架 `EntityList` 入口显隐（`deriveEntityCapabilities` 的判定来源）
- [操作列删除判定](../migration/actions-column-can-delete.md)：`actionsColumn` 破坏性变更的迁移步骤
- [代码编辑器](../code-editor/README.md)：另一个三框架 UI 组件族
