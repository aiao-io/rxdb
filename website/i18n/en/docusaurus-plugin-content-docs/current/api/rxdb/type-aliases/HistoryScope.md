# HistoryScope

```ts
type HistoryScope = 
  | {
  type: "database";
}
  | {
  entity: string;
  namespace: string;
  type: "repository";
}
  | {
  entity: string;
  entityId: RxDBEntityId;
  namespace: string;
  type: "entity";
};
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L222)

History record scope configuration
