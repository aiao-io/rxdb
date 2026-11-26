# useEntityChange()

```ts
function useEntityChange<T>(entity, options?): EntityChangeResource<T>;
```

Defined in: [rxdb-vue/src/use-entity-change.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-entity-change.ts#L101)

Bridges the entity's patch stream into Vue's reactivity system so in-place mutations are reflected in the view in real time.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* `unknown` | Entity instance type |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `MaybeRefOrGetter`&lt;`T` \| `undefined`&gt; | The entity instance to watch; may be a constant, a `Ref` or a getter. No subscription is established while it is `undefined` |
| `options?` | [`EntityChangeOptions`](../interfaces/EntityChangeOptions.md) | See [EntityChangeOptions](../interfaces/EntityChangeOptions.md) |

## Returns

[`EntityChangeResource`](../interfaces/EntityChangeResource.md)&lt;`T`&gt;

See [EntityChangeResource](../interfaces/EntityChangeResource.md)

## Throws

An RxDBError thrown by `getEntityStatus` when what was passed in is not a mounted RxDB entity instance

## Example

```vue
<script lang="ts" setup>
import { useEntityChange } from '@aiao/rxdb-vue';

const props = defineProps<{ todo: Todo }>();
// Re-renders only after input pauses for 200ms; destructure value into a top-level Ref so the template auto-unwraps it
const { value: todo } = useEntityChange(() => props.todo, { debounceTime: 200 });
</script>

<template>
  <div>{{ todo?.title }}</div>
</template>
```

## Remarks

Entities are mutable-in-place class instances, so Vue's reactivity system cannot see their field changes. When an entity being edited needs live previews in multiple places, use this hook to connect `patches$` into the render dependencies.

`patches$` carries `shareReplay(1)`: if the entity already had patches before subscription, a replay is received **immediately**, so `revision` may become `1` right after the subscription is established.

The subscription is cleaned up automatically when the scope is destroyed; when the entity or time window changes, the old subscription is unsubscribed first and then rebuilt.

Equivalent implementations on the other two frameworks: Angular's `RxDBEntityChangeDirective` (OnPush views use `markForCheck`), React's `useEntityChange` (snapshot + revision). Time-window logic is shared via `@aiao/utils`'s `withTimeWindows`, with identical semantics across all three frameworks.
