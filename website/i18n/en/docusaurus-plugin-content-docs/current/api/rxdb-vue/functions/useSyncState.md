# useSyncState()

```ts
function useSyncState(): SyncStateResource;
```

Defined in: [rxdb-vue/src/use-sync-state.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-sync-state.ts#L69)

Reads the current database's sync state.

## Returns

[`SyncStateResource`](../interfaces/SyncStateResource.md)

See [SyncStateResource](../interfaces/SyncStateResource.md)

## Throws

No provider and database not ready each throw a distinct message; when an async source fails to create, the creation error is thrown as-is (same semantics as `useRxDB`)

## Example

```vue
<script lang="ts" setup>
import { useSyncState } from '@aiao/rxdb-vue';

const sync = useSyncState();
</script>

<template>
  <span v-if="!sync.online.value">Offline · {{ sync.pendingCount }} pending push</span>
</template>
```

## Remarks

**Must be called inside setup** — it gets the database via `useRxDB()` (`inject` is only available during setup), and the subscription is unsubscribed automatically when the current scope is destroyed.

When the database is unavailable it **throws instead of** returning an "everything is fine" default: that would masquerade "the panel is not connected" as "there is nothing to push" — staying silent exactly when a voice is needed most.

The upstream is a `BehaviorSubject`-backed stream, so subscribing immediately overwrites the initial value, meaning the `snapshot` initial value given here is effectively unobservable — it is still taken from the same snapshot, introducing no second initial-value convention.

When `provideRxDB()` received a caller-held `Ref`, swapping in another ready database unsubscribes from the old database on the spot, starts from the new database's snapshot and follows it (same semantics as React re-fetching the hub when the provider changes); when the `Ref` temporarily becomes `undefined`, the previous database's state is kept until the next database becomes ready.
