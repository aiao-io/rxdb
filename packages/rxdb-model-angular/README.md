# @aiao/rxdb-model-angular

RxDB Model 的 Angular 组件集：以实体元数据驱动的列表、详情、表单、对话框、可编辑表格与可视化查询构建器。所有领域逻辑来自框架无关核心包 [`@aiao/rxdb-model`](https://github.com/aiao-io/rxdb/tree/main/packages/rxdb-model)，本包只承载 Angular 组件壳与 CDK/浏览器集成。

## 组件一览

| 组件                    | selector             | 职责                                                                                                                                                  |
| ----------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EntityListComponent`   | `rxdb-entity-list`   | 无限滚动实体列表：行内编辑（微任务批量合并写入）、撤销/重做（依赖 `@aiao/rxdb-plugin-history`）、筛选弹层（内嵌查询构建器）、级联新增、多对多选择模式 |
| `EntityDetailComponent` | `rxdb-entity-detail` | Tab 式实体详情：基础表单 + 关系表格；create 模式先建内存草稿实体，保存才落库；可选 CDK Dialog 语境                                                    |
| `EntityFormComponent`   | `rxdb-entity-form`   | 元数据驱动表单：按字段类型渲染 12 类输入控件，create/edit/view 三模式                                                                                 |
| `EntityDialogComponent` | `rxdb-entity-dialog` | CDK Dialog 外壳：拖拽、8 向缩放、全屏切换                                                                                                             |
| `EntityTableComponent`  | `rxdb-entity-table`  | VTable 宿主：事件绑定、暗色主题、剪贴板/键盘/tooltip 桥接                                                                                             |
| `QueryTableComponent`   | `rxdb-query-table`   | 带筛选状态栏与 `filterBar`/`emptyState` 插槽的查询表格                                                                                                |
| `QueryBuilderComponent` | `rxdb-query-builder` | 可视化查询构建器根组件（AND/OR 分组、拖拽重排、子查询、主题注入）                                                                                     |

另有 `ENTITY_TABLE_CONFIG`、`QUERY_BUILDER_THEME` 注入 token 与 `provideQueryBuilderTheme()`。

## 样式约定（重要）

组件模板使用 **Tailwind CSS v4 + daisyUI v5** 类名；本包**不发布编译 CSS**（无 reset、无主题、无 daisyUI 打包），只注册自身模板为 Tailwind 扫描源，由消费方应用的样式管线生成工具类，app 主题保持权威。

消费方接入（需自备 Tailwind 管线）：

```css
@import 'tailwindcss';
@plugin 'daisyui';
@import '@aiao/rxdb-model-angular/tailwind.css';
```

没有 Tailwind 管线的工程渲染出的组件无样式——这是文档化行为。

## 使用

```ts
import { EntityListComponent } from '@aiao/rxdb-model-angular';

@Component({
  imports: [EntityListComponent],
  template: `<rxdb-entity-list name="Todo" namespace="public" />`
})
export class TodoPage {}
```

撤销/重做依赖 `@aiao/rxdb-plugin-history`：宿主装配该插件后 `EntityListComponent` 自动获得 undo/redo 能力（未装插件时按钮保持禁用，不报错）。

## 开发

```bash
pnpm nx test rxdb-model-angular        # Vitest + @analogjs（真实组件渲染）
pnpm nx build rxdb-model-angular       # ng-packagr partial 编译
```
