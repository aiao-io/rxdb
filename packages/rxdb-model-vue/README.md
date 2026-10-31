# @aiao/rxdb-model-vue

## Headless 绑定

没有默认展示层时，从 `@aiao/rxdb-model-vue/headless` 使用共享控制器：

```ts
import { useEntityForm } from '@aiao/rxdb-model-vue/headless';

const { controller, snapshot } = useEntityForm({ fields, data, mode: 'edit' });
controller.setField('title', value);
```

`snapshot` 是响应式 ref；传入响应式选项以跟随输入变化，组件卸载时自动清理订阅。字段、模式与关系候选更新保留未提交草稿，内容变化的 `data` / `entity` 才重置输入。只使用 headless 入口不需要 VTable 或 Tailwind。

列表切换查询、排序或页码后调用 `refresh()` 执行数据源，过期请求不会回写。批量删除可能部分成功并以 `AggregateError.errors` 报告失败项；详情保存拒绝重复调用，取消/关闭或输入切换后的迟到结果不会覆盖新会话。默认 QueryBuilder、列表和详情尚未全部复用新控制器，headless 历史/手动排序与完整独立 UI 示例仍待完成。

[`@aiao/rxdb-model`](../rxdb-model) 的 Vue 组件层：元数据驱动的实体列表、详情、表单、对话框、可编辑表格与查询构建器。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-vue @aiao/rxdb-model @aiao/rxdb-model-vue @aiao/rxdb-plugin-history vue rxjs @visactor/vtable @lucide/vue
```

## 用法

```vue
<script lang="ts" setup>
import { EntityList } from '@aiao/rxdb-model-vue';
</script>

<template>
  <EntityList name="Todo" namespace="public" />
</template>
```

自定义控件可从 `@aiao/rxdb-model-vue/headless` 使用 `useEntityForm`、`useQueryBuilder`、`useEntityList`、`useEntityDetail`、`useEntityDialog` 和 `useQueryTable`。这些 composable 返回共享 `controller` 与 `snapshot`，在组件卸载时清理订阅，不要求 Tailwind、daisyUI 或 VTable。

## 样式

组件的 scoped 样式（对话框 / 表格 / 拖拽指示等）打包在 `dist/index.css`，引入一次即可：

```ts
import '@aiao/rxdb-model-vue/index.css';
```

模板使用 daisyUI 工具类（`btn` / `tabs` / `menu` / `fieldset` 等），
由消费方在 Tailwind 入口引入本库的扫描注册文件：

```css
@import '@aiao/rxdb-model-vue/tailwind.css';
```
