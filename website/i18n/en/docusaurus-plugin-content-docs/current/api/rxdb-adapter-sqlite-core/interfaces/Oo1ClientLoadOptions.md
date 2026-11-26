# Oo1ClientLoadOptions

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L61)

Runtime options accepted by `Oo1ClientBase.init`. Subclasses can extend via generics (e.g. `WaSqliteLoadOptions extends Oo1ClientLoadOptions`).

## Properties

### batchTimeout? \{#batchtimeout\}

```ts
batchTimeout?: number;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L64)

***

### cacheSizeKb? \{#cachesizekb\}

```ts
cacheSizeKb?: number;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L63)

***

### opfs? \{#opfs\}

```ts
opfs?: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L62)

***

### opfsFallback? \{#opfsfallback\}

```ts
opfsFallback?: OpfsFallback;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L66)

#### Default

```ts
'throw'
```
