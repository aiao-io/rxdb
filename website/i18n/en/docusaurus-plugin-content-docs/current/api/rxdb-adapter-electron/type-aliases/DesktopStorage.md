# DesktopStorage

```ts
type DesktopStorage = 
  | DesktopSqliteFileStorage
  | DesktopPgliteDirectoryStorage;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-storage.d.ts:34

Discriminated union of desktop storage configurations, distinguished by `engine`.
