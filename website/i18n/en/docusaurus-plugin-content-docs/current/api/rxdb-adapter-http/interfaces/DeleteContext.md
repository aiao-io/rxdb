# DeleteContext

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:170](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L170)

Context for the `delete` write entry point.

## Remarks

`ids` is always an array: core's duck signature is `delete(entityName, ids: string | string[])`, the single-value branch is normalized by the adapter at the boundary, and handlers only need to handle arrays.

## Properties

### entityName \{#entityname\}

```ts
entityName: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L171)

***

### ids \{#ids\}

```ts
ids: string[];
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L172)
