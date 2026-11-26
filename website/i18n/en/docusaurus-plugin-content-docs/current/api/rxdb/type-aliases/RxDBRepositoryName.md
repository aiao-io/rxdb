# RxDBRepositoryName

```ts
type RxDBRepositoryName = keyof RxDBRepositories | (string & object);
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:1214](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L1214)

Facade repository name

## Remarks

The `(string & {})` branch lets facade names of unregistered types still be passed to `@Entity({ repository })`,
while keeping autocompletion for the keys already registered in [RxDBRepositories](../interfaces/RxDBRepositories.md).

The type widening does **not** mean runtime widening: if the name has not been registered via `RxDB.repository()`,
`EntityManager.init()` still throws `Repository '<name>' not found for entity '<entity>'`.
