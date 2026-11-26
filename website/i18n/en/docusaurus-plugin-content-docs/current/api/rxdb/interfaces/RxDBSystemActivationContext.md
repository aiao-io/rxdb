# RxDBSystemActivationContext

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L48)

The context after an existing database's bootstrap completes, before the connection is handed back to the caller

## Remarks

Carries only the adapter, because contributors **can already get everything else** at this point: they hold the `RxDB` instance that created them, and `entityManager` / `config` are public members. The adapter cannot be gotten — it is the instance resolved on-site by this `connect()`, and since one database can have multiple adapters, asking `RxDB` would yield a different one.

## Properties

### adapter \{#adapter\}

```ts
readonly adapter: RxDBAdapterLocalBase;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L50)

The local adapter of this bootstrap; tables created, migrated, and `completeBootstrap()` already called
