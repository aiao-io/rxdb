# @aiao/rxdb-model-vue

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
