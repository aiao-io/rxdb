# RESTORE_TARGET_KEY

```ts
const RESTORE_TARGET_KEY: "rxdb-board-restore-target" = 'rxdb-board-restore-target';
```

Defined in: [packages/rxdb-plugin-board/src/board-storage.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-storage.ts#L23)

Record key (localStorage) for this restore's target database name: reopening after an interruption cleans only this one storage; when cleanup fails it stays for the next retry.
