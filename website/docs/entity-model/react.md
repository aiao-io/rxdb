# React 用法

`@aiao/rxdb-model-react` 提供实体列表、详情、表单、对话框、表格与查询构建器的 React 组件，API 命名、行为与 Angular / Vue 端功能等价。

## 安装与集成

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-model @aiao/rxdb-model-react
```

组件在使用前要求数据库已初始化：调用 `useRxDB()` 即可触发首次连接（应用侧通过 `RxDBProvider` 提供实例，见 [React 集成](../frameworks/react.md)）。

## 实体列表

`EntityList`：无限滚动可编辑表格、行内编辑、撤销/重做、筛选弹层、级联新增、多对多选择模式、列头排序与手动排序实体的行拖放。

```tsx
import { EntityList, type EntityInstance } from '@aiao/rxdb-model-react';
import { useRxDB } from '@aiao/rxdb-react';
import { useParams } from 'react-router-dom';

export default function EntityListPage(): React.JSX.Element {
  // 注入 RxDB 以初始化本地数据库（首次查询经适配器 ready() 自动 connect）
  useRxDB();

  const { namespace = '', name = '' } = useParams();

  return (
    <div className="page-host bg-base-100 flex h-full flex-col">
      <EntityList name={name} namespace={namespace} />
    </div>
  );
}
```

主要 props：

| prop                                            | 说明                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `namespace` / `name`                            | 实体定位（必填）                                                                  |
| `fixedQuery`                                    | 列表固定查询（`{ combinator, rules }`，钉住固定查询后才能对分组排序实体拖拽排序） |
| `mode`                                          | `'default'` 或 `'select'`（多对多选择模式，配合 `onSelectionConfirmed`）          |
| `onSelectionConfirmed` / `onSelectionCancelled` | 选择模式确认 / 取消                                                               |
| `creationChain` / `editChain`                   | 级联新增与关系下钻的防环链路                                                      |

「查看」行 → 组件内置打开 edit 详情对话框（关系 Tab 内同理可无限下钻，`editChain` 防环）。

## 实体详情

`EntityDetail`：Tab 式详情，基础表单 + 关系表格；create 模式先在内存中生成草稿实体，保存时才落库。

```tsx
import { EntityDetail, type EntityFormData } from '@aiao/rxdb-model-react';
import { useRxDB } from '@aiao/rxdb-react';
import { useNavigate, useParams } from 'react-router-dom';

export default function EntityDetailPage(): React.JSX.Element {
  useRxDB();

  const { namespace = '', name = '', entityId = '' } = useParams();
  const navigate = useNavigate();

  return (
    <div className="page-host bg-base-100 flex h-full flex-col">
      <EntityDetail
        entityId={entityId}
        name={name}
        namespace={namespace}
        onFormCancelled={() => void navigate('..', { relative: 'path' })}
        onFormSubmitted={(data: EntityFormData) => void navigate('..', { relative: 'path' })}
      />
    </div>
  );
}
```

主要 props：`namespace` / `name` / `entityId`（路由输入通道，与 `metadata` 二选一）、`metadata` / `formFields` / `formData` / `formMode`（直接传入元数据与表单数据）、`onFormSubmitted` / `onFormCancelled` / `onFieldChanged` / `onValidationErrors`。

## 实体表单

`EntityForm`：按模式渲染全部字段类型的输入控件，create / edit / view 三模式，view 模式全部字段只读。

```tsx
import {
  EntityForm,
  type EntityFormData,
  type FormFieldConfig,
  type FormValidationResult
} from '@aiao/rxdb-model-react';

function EditForm({ fields, initial }: { fields: FormFieldConfig[]; initial: EntityFormData }): React.JSX.Element {
  const [formData, setFormData] = React.useState(initial);

  return (
    <EntityForm
      data={formData}
      fields={fields}
      mode="edit"
      onFieldChanged={({ field, value }) => console.log(field, value)}
      onFormCancelled={() => setFormData(initial)}
      onFormSubmitted={(data: EntityFormData) => void save(data)}
      onValidationErrors={(result: FormValidationResult) => console.error(result.errors)}
    />
  );
}
```

props：`fields`（`FormFieldConfig[]`，通常由 `buildFormFields(metadata, mode)` 产出）、`data`（`EntityFormData`）、`mode`（缺省 `view`）、`relatedEntityProvider`（关系字段下拉数据源）、`showActions`（是否渲染保存/取消按钮，缺省 `true`）、`onFieldChanged` / `onFormSubmitted` / `onFormCancelled` / `onValidationErrors`。

## 对话框外壳

`EntityDialog`：标题栏拖拽、八向缩放、全屏。在应用的对话框语境中作为面板使用；独立使用（无对话框语境）时仅渲染 `children`（与 Angular 的「非 DIALOG 语境只渲染投影内容」一致）。

```tsx
import { EntityDialog } from '@aiao/rxdb-model-react';

<EntityDialog title="添加 Todo" onCloseRequested={close}>
  <EntityForm data={formData} fields={fields} mode="create" />
</EntityDialog>;
```

## 查询构建器

`QueryBuilder`：AND/OR 分组、规则增删、拖拽重排、字段/操作符/值选择器、子查询、嵌套深度限制。`EntityList` 的筛选弹层已内嵌查询构建器，直接使用列表即可；独立使用时：

```tsx
import { QueryBuilder, type FieldMetadata, type RxDBQueryOutput, type ValidationResult } from '@aiao/rxdb-model-react';

function FilterPanel({ fields }: { fields: FieldMetadata[] }): React.JSX.Element {
  return (
    <QueryBuilder
      fields={fields}
      initialQuery={{ combinator: 'and', rules: [] }}
      onQueryChange={(query: RxDBQueryOutput) => console.log(query)}
      onValidationChange={(result: ValidationResult) => console.log(result)}
    />
  );
}
```

主要 props：`fields`（字段列表，优先于 `schema`）、`schema`（Schema 信息）、`initialQuery`（可回填既有查询）、`maxDepth`（最大嵌套层级，缺省 `5`）、`height`（内容区最大高度，缺省 `'80vh'`）、`enableDrag` / `enableCollapse`、`onQueryChange` / `onValidationChange`。

主题注入：用 `QueryBuilderThemeProvider` 包裹组件树提供自定义 `QueryBuilderTheme`（字段选择器 / 操作符选择器 / 值输入组件的替换实现），缺省用内置 `DEFAULT_QUERY_BUILDER_THEME`。
