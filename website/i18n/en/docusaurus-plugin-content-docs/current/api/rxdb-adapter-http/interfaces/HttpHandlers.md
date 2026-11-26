# HttpHandlers

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:238](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L238)

The handler set for phase A.

## Remarks

**Mind the naming direction**: handler fields always carry the `on` prefix, while **method names on the adapter class don't**. `fetchMetadata` / `findByIds` are abstracts on `RxDBAdapterRemoteBase` and must keep the same name; `create` / `update` / `delete` are optional ducks on `QueryCacheRemoteAdapter`, and `QueryCacheEngine` feature-detects with `if (!this.remoteAdapter.create)` before calling — naming the class methods `onCreate` too would make the probe return `false`, silently degrading the write entry points to "create not supported" even though the handler is right there in the config.

## Properties

### onCreate? \{#oncreate\}

```ts
onCreate?: CreateHandler;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:241](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L241)

***

### onDelete? \{#ondelete\}

```ts
onDelete?: DeleteHandler;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:243](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L243)

***

### onFetchMetadata \{#onfetchmetadata\}

```ts
onFetchMetadata: FetchMetadataHandler;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:239](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L239)

***

### onFindByIds \{#onfindbyids\}

```ts
onFindByIds: FindByIdsHandler;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:240](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L240)

***

### onIsTableExisted? \{#onistableexisted\}

```ts
onIsTableExisted?: IsTableExistedHandler;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:247](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L247)

When unconfigured, reuses `onFetchMetadata` with a `limit: 1` probe

***

### onUpdate? \{#onupdate\}

```ts
onUpdate?: UpdateHandler;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:242](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L242)

***

### onVersion? \{#onversion\}

```ts
onVersion?: VersionHandler;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:245](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L245)

When unconfigured, `version()` throws unsupported; it **must not** fall back to this package's `package.json` version
