# Angular 用法

`@aiao/rxdb-model-angular` 提供实体列表、详情、表单、对话框、表格与查询构建器的 Angular 组件（standalone，signal inputs / outputs）。组件按 `namespace` + `name` 定位实体元数据，查询与写入走实体类的 Repository 路径。

## 安装与集成

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-model @aiao/rxdb-model-angular
```

组件自己经依赖注入读取 `RxDB`，应用须先用 `provideRxDB` 提供实例（见 [Angular 集成](../frameworks/angular.md)）；`provideRxDB` 在应用初始化阶段就解析好数据库，页面本身不需要再注入 `RxDB`。

## 实体列表

`EntityListComponent`（selector `rxdb-entity-list`）：无限滚动可编辑表格、行内编辑、撤销/重做、筛选弹层、级联新增、多对多选择模式、列头排序与手动排序实体的行拖放。

```typescript
import { EntityListComponent } from '@aiao/rxdb-model-angular';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-entity-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityListComponent],
  template: ` <rxdb-entity-list
    class="block h-full"
    [fixedQuery]="fixedQuery()"
    [name]="name()"
    [namespace]="namespace()"
  />`,
  host: { class: 'page-host flex h-full flex-col bg-base-100' }
})
export default class EntityListPage {
  /** 路由参数 :namespace / :name（withComponentInputBinding 自动绑定） */
  readonly namespace = input.required<string>();
  readonly name = input.required<string>();
  /** 可选固定查询（列表钉住固定查询后才能对分组排序实体拖拽排序） */
  readonly fixedQuery = input<{ combinator: 'and' | 'or'; rules: unknown[] } | undefined>(undefined);
}
```

主要输入：

| 输入                          | 说明                                                 |
| ----------------------------- | ---------------------------------------------------- |
| `namespace` / `name`          | 实体定位（必填）                                     |
| `fixedQuery`                  | 列表固定查询（`{ combinator, rules }` 的 JSON 形态） |
| `initialFilter`               | 从既有查询回填筛选条件                               |
| `mode`                        | `'default'`（默认）或 `'select'`（多对多选择模式）   |
| `creationChain` / `editChain` | 级联新增与关系下钻的防环链路                         |

主要输出：`(viewEntity)`、`(selectionConfirmed)` / `(selectionCancelled)`，以及 `(dirtyChange)`（见下方「未保存输入」）。

「查看」行 → 组件内置打开 edit 详情对话框（关系 Tab 内同理可无限下钻，`editChain` 防环）。

### 未保存输入

列表打开的新增 / 编辑对话框里还没点保存的取值，组件经 `(dirtyChange)` 输出交给宿主，用来在离开页面前提示、在同步或切换前拦下：

```html
<rxdb-entity-list (dirtyChange)="unsaved.set($event)" [name]="name()" [namespace]="namespace()" />
```

- 只在状态真正变化时输出：输入后为 `true`，改回原值（含把新建表单的字段清空）为 `false`；保存成功、取消、关闭对话框（Escape、遮罩）都回到 `false`。表单在 `change`（失焦或回车）时提交取值，失焦之前的按键还不算输入。
- 关系 Tab 里嵌套列表的同类输入、级联新增进本地草稿（随父实体一起保存）的子记录也算未保存，父实体保存或取消之后才回到 `false`。
- 组件销毁时仍是 `true` 就在 `ngOnDestroy` 里补发一次 `false`（模板上的监听那时还在），宿主不会停在 `true`。
- `EntityDetailComponent` 有同名的 `(dirtyChange)`，独立使用详情时同样可用；判定规则在 `@aiao/rxdb-model` 的 `EntityDirtyTracker`（见 [Headless](headless.md#未保存输入)），三端一致。

## 实体详情

`EntityDetailComponent`（selector `rxdb-entity-detail`）：Tab 式详情，基础表单 + 关系表格。create 模式下，传了 `metadata`（DIALOG_DATA / 直接输入通道）时先在内存中生成草稿实体，保存时才落库；只给路由输入（`namespace` + `name`）时不建草稿，保存经 `(formSubmitted)` 交给调用方。

```typescript
import { EntityDetailComponent, type EntityFormData } from '@aiao/rxdb-model-angular';

@Component({
  selector: 'app-entity-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityDetailComponent],
  template: ` <rxdb-entity-detail
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

| 输入 / 输出                                         | 说明                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| `namespace` / `name` / `entityId`                   | 路由输入通道（与 `metadata` 二选一）                             |
| `metadata` / `formFields` / `formData` / `formMode` | 直接传入元数据与表单数据（Dialog / metadata 输入通道）           |
| `fixedFormData` / `delegateSave`                    | 级联创建：预填充外键数据、委托父链保存                           |
| `(formSubmitted)` / `(formCancelled)`               | 保存 / 取消                                                      |
| `(fieldChanged)` / `(validationErrors)`             | 字段变更与校验失败事件                                           |
| `(dirtyChange)`                                     | 是否有未保存输入；保存成功、交给宿主、取消或换目标即回到 `false` |

编辑目标未就绪（按 `entityId` 加载中或加载失败）时，表单内部动作隐藏、tabs 下方只留「取消」，提交被拦截；就绪后表单按加载到的实例重置，未就绪期间的输入不保留。`fixedFormData` 只合入 create 草稿与无实例的透传表单；已加载实例的 edit 模式下只把对应字段设为只读、显示实例自身的值。这两点与 React 一致，Vue 不同（见 Vue 页的「实体详情」）。

## 实体表单

`EntityFormComponent`（selector `rxdb-entity-form`）：按模式渲染全部字段类型的输入控件，create / edit / view 三模式，view 模式全部字段只读。

```html
<rxdb-entity-form
  (fieldChanged)="onFieldChanged($event)"
  (formCancelled)="onFormCancelled()"
  (formSubmitted)="onFormSubmitted($event)"
  (validationErrors)="onValidationErrors($event)"
  [data]="data()"
  [fields]="fields()"
  [mode]="'edit'"
/>
```

输入 `fields`（`FormFieldConfig[]`，通常由 `buildFormFields(metadata, mode)` 产出）、`data`（`EntityFormData`）、`mode`（缺省 `view`）、`showActions`（是否渲染保存/取消按钮，缺省 `true`）、`relatedEntityProvider`（关系字段下拉数据源）。

## 查询构建器

`QueryBuilderComponent`（selector `rxdb-query-builder`）：AND/OR 分组、规则增删、拖拽重排、字段/操作符/值选择器、子查询、嵌套深度限制。`EntityList` 的筛选弹层已内嵌查询构建器，直接使用列表即可；独立使用时：

```html
<rxdb-query-builder
  (queryChange)="onQueryChange($event)"
  (validationChange)="onValidationChange($event)"
  [fields]="fields()"
  [initialQuery]="initialQuery()"
  [maxDepth]="5"
/>
```

挂载时 `(queryChange)` / `(validationChange)` 各发一次当前值（载入的 `initialQuery` 及其校验结果，没传时是空查询），之后随编辑再发。

主题注入：`provideQueryBuilderTheme(theme)` 在组件树任一层提供自定义 `QueryBuilderTheme`（字段选择器 / 操作符选择器 / 值输入组件的替换实现），缺省用内置 `DEFAULT_QUERY_BUILDER_THEME`。
