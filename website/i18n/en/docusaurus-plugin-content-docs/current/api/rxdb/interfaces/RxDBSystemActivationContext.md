# RxDBSystemActivationContext

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L48)

The context after an existing database finishes bootstrapping and before the connection is handed back to the caller

## Remarks

It carries only one thing — the adapter — because the contributor **can already get everything else** at this point: it holds the `RxDB`
instance that created it, and `entityManager` / `config` are public members. The adapter it cannot get — it is the instance resolved
on the spot by this `connect()` call, and one database can have multiple adapters; asking `RxDB` would produce a different one.

## Properties

### adapter \{#adapter\}

```ts
readonly adapter: RxDBAdapterLocalBase;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L50)

The local adapter of this bootstrap; tables created, migrations run, `completeBootstrap()` called
