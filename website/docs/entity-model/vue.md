# Vue 用法

`@aiao/rxdb-model-vue` 提供实体列表、详情、表单、对话框、表格与查询构建器的 Vue 3 组件，API 命名、行为与 Angular / React 端功能等价。

## 安装与集成

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-model @aiao/rxdb-model-vue
```

组件在使用前要求数据库已初始化：调用 `injectRxDB()` 即可触发首次连接（应用侧通过 `RxDBPlugin` / provider 提供实例，见 [Vue 集成](../frameworks/vue.md)）。

## 实体列表

`EntityList`：无限滚动可编辑表格、行内编辑、撤销/重做、筛选弹层、级联新增、多对多选择模式、列头排序与手动排序实体的行拖放。

```vue
<script lang="ts" setup>
import { injectRxDB } from '@aiao/rxdb-vue';
import { EntityList } from '@aiao/rxdb-model-vue';
import { computed } from 'vue';
import { useRoute } from 'vue-router';

// 注入 RxDB 以初始化本地数据库（首次查询经适配器 ready() 自动 connect）
injectRxDB();

/** 路由参数 :namespace / :name */
const route = useRoute();
const namespace = computed(() => String(route.params.namespace ?? ''));
const name = computed(() => String(route.params.name ?? ''));
</script>

<template>
  <div class="page-host bg-base-100 flex h-full flex-col">
    <EntityList class="block h-full" :name="name" :namespace="namespace" />
  </div>
</template>
```

主要 props：`namespace` / `name`（实体定位，必填）、`fixed-query`（列表固定查询，钉住固定查询后才能对分组排序实体拖拽排序）、`mode`（`'default'` 或 `'select'` 多对多选择模式）、`creation-chain` / `edit-chain`（级联新增与关系下钻的防环链路）。

「查看」行 → 组件内置打开 edit 详情对话框（关系 Tab 内同理可无限下钻，`editChain` 防环）。

## 实体详情

`EntityDetail`：Tab 式详情，基础表单 + 关系表格；create 模式先在内存中生成草稿实体，保存时才落库。

```vue
<script lang="ts" setup>
import { EntityDetail, type EntityFormData } from '@aiao/rxdb-model-vue';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const namespace = computed(() => String(route.params.namespace ?? ''));
const name = computed(() => String(route.params.name ?? ''));
const entityId = computed(() => String(route.params.entityId ?? ''));

function onSaved(data: EntityFormData): void {
  // 保存由组件内部完成（edit 模式实例路径），这里只做保存后的导航
  void router.push({ name: 'entity-list', params: { namespace: namespace.value, name: name.value } });
}
</script>

<template>
  <div class="page-host bg-base-100 flex h-full flex-col">
    <EntityDetail
      class="block h-full"
      :entity-id="entityId"
      :name="name"
      :namespace="namespace"
      @form-cancelled="router.back()"
      @form-submitted="onSaved"
    />
  </div>
</template>
```

主要 props：`namespace` / `name` / `entity-id`（路由输入通道，与 `metadata` 二选一）、`metadata` / `form-fields` / `form-data` / `form-mode`（直接传入元数据与表单数据）；事件 `form-submitted` / `form-cancelled` / `field-changed` / `validation-errors`。

## 实体表单

`EntityForm`：按模式渲染全部字段类型的输入控件，create / edit / view 三模式，view 模式全部字段只读。

```vue
<script lang="ts" setup>
import { EntityForm, type EntityFormData, type FormFieldConfig } from '@aiao/rxdb-model-vue';
import { ref } from 'vue';

const fields = ref<FormFieldConfig[]>([]); // 通常由 buildFormFields(metadata, mode) 产出
const formData = ref<EntityFormData>({});
</script>

<template>
  <EntityForm
    :data="formData"
    :fields="fields"
    mode="edit"
    @field-changed="({ field, value }) => console.log(field, value)"
    @form-submitted="data => void save(data)"
  />
</template>
```

props：`fields`（`FormFieldConfig[]`）、`data`（`EntityFormData`）、`mode`（缺省 `view`）、`related-entity-provider`（关系字段下拉数据源）、`show-actions`（是否渲染保存/取消按钮，缺省 `true`）；事件 `field-changed` / `form-submitted` / `form-cancelled` / `validation-errors`。

## 对话框外壳

`EntityDialog`：标题栏拖拽、八向缩放、全屏。在应用的对话框语境中作为面板使用；独立使用（无对话框语境）时仅渲染插槽内容（与 Angular 的「非 DIALOG 语境只渲染投影内容」一致）。

```vue
<template>
  <EntityDialog title="添加 Todo" @close-requested="close">
    <EntityForm :data="formData" :fields="fields" mode="create" />
  </EntityDialog>
</template>
```

## 查询构建器

`QueryBuilder`：AND/OR 分组、规则增删、拖拽重排、字段/操作符/值选择器、子查询、嵌套深度限制。`EntityList` 的筛选弹层已内嵌查询构建器，直接使用列表即可；独立使用时：

```vue
<script lang="ts" setup>
import { QueryBuilder, type FieldMetadata, type RxDBQueryOutput, type ValidationResult } from '@aiao/rxdb-model-vue';
import { ref } from 'vue';

const fields = ref<FieldMetadata[]>([]);
const initialQuery = ref({ combinator: 'and' as const, rules: [] });

function onQueryChange(query: RxDBQueryOutput): void {
  console.log(query);
}

function onValidationChange(result: ValidationResult): void {
  console.log(result);
}
</script>

<template>
  <QueryBuilder
    :fields="fields"
    :initial-query="initialQuery"
    :max-depth="5"
    @query-change="onQueryChange"
    @validation-change="onValidationChange"
  />
</template>
```

主要 props：`fields`（字段列表，优先于 `schema`）、`schema`（Schema 信息）、`initial-query`（可回填既有查询）、`max-depth`（最大嵌套层级，缺省 `5`）、`height`（内容区最大高度，缺省 `'80vh'`）、`enable-drag` / `enable-collapse`；事件 `query-change` / `validation-change`。

主题注入：`provideQueryBuilderTheme(theme)` 提供自定义 `QueryBuilderTheme`（字段选择器 / 操作符选择器 / 值输入组件的替换实现），缺省用内置 `DEFAULT_QUERY_BUILDER_THEME`。
