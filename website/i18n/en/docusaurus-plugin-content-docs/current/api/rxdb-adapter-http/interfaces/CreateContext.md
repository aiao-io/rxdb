# CreateContext

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:151](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L151)

Context for the `create` write entry point.

## Remarks

`data` is `unknown`: core's duck signature is `create<R>(entityName, data: R)`, and the row type is decided **per call**, not by the adapter instance (same reason as [FetchMetadataContext](FetchMetadataContext.md)).

## Properties

### data \{#data\}

```ts
data: unknown;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:153](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L153)

---

### entityName \{#entityname\}

```ts
entityName: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:152](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L152)
