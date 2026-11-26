# useWorkingTree()

```ts
function useWorkingTree(): WorkingTreeResource;
```

Defined in: [use-working-tree.ts:165](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L165)

Reads and writes the working tree of the current database.

## Returns

[`WorkingTreeResource`](../interfaces/WorkingTreeResource.md)

See [WorkingTreeResource](../interfaces/WorkingTreeResource.md)

## Throws

Throws one distinct message each when there is no provider or the database is not ready yet; when the async source creation fails, the creation error is rethrown as-is (same semantics as `useRxDB`).

## Example

```vue
<script lang="ts" setup>
import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-vue';

const tree = useWorkingTree();
await tree.status();
</script>

<template>
  <span v-if="tree.statusState.value.phase === 'empty'">No uncommitted changes</span>
  <span v-else-if="tree.statusState.value.phase === 'success'">
    {{ tree.statusState.value.value.entryCount }} uncommitted
  </span>
</template>
```

## Remarks

**Must be called in setup** — it obtains the database via `useRxDB()` (`inject` is only available during setup).

**The creation entry point itself issues no IO**: all fourteen cells start as `idle`, and the database is only read when a method is actually called. Querying on mount would make every component that only wants `commit()` waste a query round on mount.

**No change stream**: state only updates after commands issued through this entry point, so there are no subscriptions to unsubscribe from here. Changes written in from other tabs, or writes that go directly through `entity.save()`, will not push a fresh status — call `status()` again when you need the latest value. This faithfully reflects that the core side has no working-tree change stream yet; it is not a skipped step here.

State is held in a `shallowRef`: the whole state is a new object every time, and deep reactivity would only make Vue needlessly walk fourteen fixed-structure trees.

When the database cannot be obtained, it **throws instead of** returning a default value implying "everything is clean": that would disguise "the entry point is not wired up" as "no uncommitted changes" — staying silent exactly when it matters most to speak up.
