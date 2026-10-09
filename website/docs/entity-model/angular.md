# Angular 用法

`@aiao/rxdb-model-angular` 提供实体列表、详情、表单、对话框、表格与查询构建器的 Angular 组件（standalone，signal inputs / outputs）。组件按 `namespace` + `name` 定位实体元数据，查询与写入走实体类的 Repository 路径。

## 安装与集成

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-model @aiao/rxdb-model-angular
```

组件在使用前要求数据库已初始化：注入 `RxDB` 即可触发首次连接（应用侧通过 `provideRxDB` 提供实例，见 [Angular 集成](../frameworks/angular.md)）。

## 实体列表

`EntityListComponent`（selector `rxdb-entity-list`）：无限滚动可编辑表格、行内编辑、撤销/重做、筛选弹层、级联新增、多对多选择模式、列头排序与手动排序实体的行拖放。

```typescript
import { RxDB } from '@aiao/rxdb';
import { EntityListComponent } from '@aiao/rxdb-model-angular';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

@Component({
  selector: 'app-entity-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityListComponent],
  template: `
    <rxdb-entity-list
      class="block h-full"
      [name]="name()"
      [namespace]="namespace()"
      [fixedQuery]="fixedQuery()"
    />`,
  host: { class: 'page-host flex h-full flex-col bg-base-100' }
})
export default class EntityListPage {
  // 注入 RxDB 以初始化本地数据库（首次查询经适配器 ready() 自动 connect）
  rxdb = inject(RxDB);

  /** 路由参数 :namespace / :name（withComponentInputBinding 自动绑定） */
  readonly namespace = input.required<string>();
  readonly name = input.required<string>();
  /** 可选固定查询（列表钉住固定查询后才能对分组排序实体拖拽排序） */
  readonly fixedQuery = input<{ combinator: 'and' | 'or'; rules: unknown[] } | undefined>(undefined);
}
```

主要输入：

| 输入                  | 说明                                             |
| --------------------- | ------------------------------------------------ |
| `namespace` / `name`  | 实体定位（必填）                                 |
| `fixedQuery`          | 列表固定查询（`{ combinator, rules }` 的 JSON 形态） |
| `initialFilter`       | 从既有查询回填筛选条件                           |
| `mode`                | `'default'`（默认）或 `'select'`（多对多选择模式） |
| `creationChain` / `editChain` | 级联新增与关系下钻的防环链路               |

「查看」行 → 组件内置打开 edit 详情对话框（关系 Tab 内同理可无限下钻，`editChain` 防环）。

## 实体详情

`EntityDetailComponent`（selector `rxdb-entity-detail`）：Tab 式详情，基础表单 + 关系表格；create 模式先在内存中生成草稿实体，保存时才落库。

```typescript
import { EntityDetailComponent, type EntityFormData } from '@aiao/rxdb-model-angular';

@Component({
  selector: 'app-entity-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityDetailComponent],
  template: `
    <rxdb-entity-detail
      class="block h-full"
      [entityId]="entityId()"
      [name]="name()"
      [namespace]="namespace()"
      (formCancelled)="onCancelled()"
      (formSubmitted)="onSaved($event)"
    />`
})
export default class EntityDetailPage {
  readonly namespace = input.required<string>();
  readonly name = input.required<string>();
  readonly entityId = input.required<string>();

  onSaved(data: EntityFormData): void {
    // 保存由组件内部完成（edit 模式实例路径），这里只做保存后的导航
  }

  onCancelled(): void {
    // 取消后的导航
  }
}
```

主要输入 / 输出：

| 输入 / 输出             | 说明                                                          |
| ----------------------- | ------------------------------------------------------------- |
| `namespace` / `name` / `entityId` | 路由输入通道（与 `metadata` 二选一）                  |
| `metadata` / `formFields` / `formData` / `formMode` | 直接传入元数据与表单数据（Dialog / metadata 输入通道） |
| `fixedFormData` / `delegateSave` | 级联创建：预填充外键数据、委托父链保存                |
| `(formSubmitted)` / `(formCancelled)` | 保存 / 取消                                           |
| `(fieldChanged)` / `(validationErrors)` | 字段变更与校验失败事件                                 |

## 实体表单

`EntityFormComponent`（selector `rxdb-entity-form`）：按模式渲染全部字段类型的输入控件，create / edit / view 三模式，view 模式全部字段只读。

```html
<rxdb-entity-form
  [fields]="fields()"
  [data]="data()"
  [mode]="'edit'"
  (fieldChanged)="onFieldChanged($event)"
  (formSubmitted)="onFormSubmitted($event)"
  (formCancelled)="onFormCancelled()"
  (validationErrors)="onValidationErrors($event)"
/>
```

输入 `fields`（`FormFieldConfig[]`，通常由 `buildFormFields(metadata, mode)` 产出）、`data`（`EntityFormData`）、`mode`（缺省 `view`）、`showActions`（是否渲染保存/取消按钮，缺省 `true`）、`relatedEntityProvider`（关系字段下拉数据源）。

## 查询构建器

`QueryBuilderComponent`（selector `rxdb-query-builder`）：AND/OR 分组、规则增删、拖拽重排、字段/操作符/值选择器、子查询、嵌套深度限制。`EntityList` 的筛选弹层已内嵌查询构建器，直接使用列表即可；独立使用时：

```html
<rxdb-query-builder
  [fields]="fields()"
  [initialQuery]="initialQuery()"
  [maxDepth]="5"
  (queryChange)="onQueryChange($event)"
  (validationChange)="onValidationChange($event)"
/>
```

主题注入：`provideQueryBuilderTheme(theme)` 在组件树任一层提供自定义 `QueryBuilderTheme`（字段选择器 / 操作符选择器 / 值输入组件的替换实现），缺省用内置 `DEFAULT_QUERY_BUILDER_THEME`。
