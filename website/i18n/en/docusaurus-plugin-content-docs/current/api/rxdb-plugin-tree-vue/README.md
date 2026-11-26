# rxdb-plugin-tree-vue

The Vue integration layer for [`@aiao/rxdb-plugin-tree`](../rxdb-plugin-tree/README.md). Wires the four tree queries into Vue reactive state.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-tree @aiao/rxdb-vue @aiao/rxdb-plugin-tree-vue vue rxjs
```

## Usage

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
    <h2>{{ total.value }} descendants total</h2>
    <ul>
      <li v-for="node in children.value" :key="String(node.id)">{{ node.name }}</li>
    </ul>
  </section>
</template>
```

The four composables depend on the `TreeRepository` registered by the plugin; the application must call `rxdb.use(rxDBPluginTree)` and then `init()`. When options are passed as getters, their dependencies are tracked and a change re-runs the query.

## API

| Composable            | Repository method  | Result type                      | Default |
| --------------------- | ------------------ | --------------------------------- | ------- |
| `useFindDescendants`  | `findDescendants`  | `RxDBResource<InstanceType<T>[]>` | `[]`    |
| `useCountDescendants` | `countDescendants` | `RxDBResource<number>`            | `0`     |
| `useFindAncestors`    | `findAncestors`    | `RxDBResource<InstanceType<T>[]>` | `[]`    |
| `useCountAncestors`   | `countAncestors`   | `RxDBResource<number>`            | `0`     |

All four are thin wrappers around [`useRepositoryQuery`](../rxdb-vue/README.md): they only decide "which repository method to query and what the default value is"; subscriptions and the lifecycle are entirely handled by `@aiao/rxdb-vue`'s effect scope.

The generics are narrowed to `TreeEntityType`: entities whose instances do not satisfy `ITreeEntity` (missing `createdAt` / `updatedAt`) are rejected at compile time.

Symmetric functionality across the three frameworks: see [`@aiao/rxdb-plugin-tree-angular`](../rxdb-plugin-tree-angular/README.md) for Angular and [`@aiao/rxdb-plugin-tree-react`](../rxdb-plugin-tree-react/README.md) for React.

## Migration

These four composables used to be exported by `@aiao/rxdb-vue`. Import them from this package instead; see the [tree-split migration notes](https://github.com/aiao-io/rxdb/blob/main/website/docs/migration/tree-split.md).

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)

rxdb-plugin-tree-vue - Vue integration layer

Provides the four composables `useFindDescendants` / `useCountDescendants` / `useFindAncestors` / `useCountAncestors`,
wiring the tree queries registered by `@aiao/rxdb-plugin-tree` into the Vue reactivity system.

## Remarks

These four composables depend on the `TreeRepository` registered by the plugin; the application must call `rxdb.use(rxDBPluginTree)` first.

## Functions

| Function | Description |
| ------ | ------ |
| [useCountAncestors](functions/useCountAncestors.md) | Counts the ancestor entities under the tree structure |
| [useCountDescendants](functions/useCountDescendants.md) | Counts the descendant entities under the tree structure |
| [useFindAncestors](functions/useFindAncestors.md) | Finds all ancestor entities under the tree structure |
| [useFindDescendants](functions/useFindDescendants.md) | Finds all descendant entities under the tree structure |
