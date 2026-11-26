# WorkspaceCacheEntry

Defined in: [packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts:150](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L150)

Deep snapshot of a draft returned by RxDBPluginWorkspace.list.

## Properties

### cacheId \{#cacheid\}

```ts
cacheId: `${string}:${string}:${string}-${string}-${string}-${string}-${string}`;
```

Defined in: [packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts:152](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L152)

The draft's persisted primary key.

***

### data \{#data\}

```ts
data: Record<string, unknown>;
```

Defined in: [packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts:160](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L160)

Deep snapshot of the draft with no shared references to the plugin's internal state.

***

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L156)

Entity name.

***

### id \{#id\}

```ts
id: `${string}-${string}-${string}-${string}-${string}`;
```

Defined in: [packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts:158](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L158)

Entity UUID.

***

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts:154](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts#L154)

Entity namespace.
