# @aiao/rxdb-plugin-tree-vue

[`@aiao/rxdb-plugin-tree`](../rxdb-plugin-tree) 的 Vue 集成层。把四个树查询接到 Vue 响应式状态。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-tree @aiao/rxdb-vue @aiao/rxdb-plugin-tree-vue vue rxjs
```

## 用法

```vue
<script lang="ts" setup>
import { useCountDescendants, useFindDescendants } from '@aiao/rxdb-plugin-tree-vue';

const props = defineProps<{ rootId: string }>();

const children = useFindDescendants(Category, () => ({ entityId: props.rootId, level: 1 }));
const total = useCountDescendants(Category, () => ({ entityId: props.rootId }));
</script>

<template>
  <p v-if="children.error" role="alert">{{ children.error.message }}</p>
  <section v-else :aria-busy="children.isLoading">
    <h2>共 {{ total.value }} 个后代</h2>
    <ul>
      <li v-for="node in children.value" :key="String(node.id)">{{ node.name }}</li>
    </ul>
  </section>
</template>
```

四个 composable 依赖插件注册的 `TreeRepository`，应用必须先 `rxdb.use(rxDBPluginTree)` 再 `init()`。选项传 getter 时依赖会被追踪，变化即重查。

## API

| Composable            | 仓储方法           | 结果类型                          | 默认值 |
| --------------------- | ------------------ | --------------------------------- | ------ |
| `useFindDescendants`  | `findDescendants`  | `RxDBResource<InstanceType<T>[]>` | `[]`   |
| `useCountDescendants` | `countDescendants` | `RxDBResource<number>`            | `0`    |
| `useFindAncestors`    | `findAncestors`    | `RxDBResource<InstanceType<T>[]>` | `[]`   |
| `useCountAncestors`   | `countAncestors`   | `RxDBResource<number>`            | `0`    |

都是 [`useRepositoryQuery`](../rxdb-vue) 的薄包装：只决定「查哪个仓储方法、默认值是什么」，订阅与生命周期全部由 `@aiao/rxdb-vue` 的 effect scope 负责。

泛型收紧到 `TreeEntityType`：实例不满足 `ITreeEntity`（缺 `createdAt` / `updatedAt`）的实体在编译期就被拒。

三框架同功能对称：Angular 见 [`@aiao/rxdb-plugin-tree-angular`](../rxdb-plugin-tree-angular)，React 见 [`@aiao/rxdb-plugin-tree-react`](../rxdb-plugin-tree-react)。

## 迁移

这四个 composable 曾由 `@aiao/rxdb-vue` 导出。改从本包取，见 [tree-split 迁移说明](https://github.com/aiao-io/rxdb/blob/main/website/docs/migration/tree-split.md)。

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
