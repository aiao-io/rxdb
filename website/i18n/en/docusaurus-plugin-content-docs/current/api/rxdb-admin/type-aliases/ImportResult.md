# ImportResult

```ts
type ImportResult = 
  | {
  ok: true;
}
  | {
  ok: false;
  reason: "invalid-json" | "not-object";
};
```

Defined in: [preferences/store.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/store.ts#L64)

Result of [PreferencesStore.importJson](../classes/PreferencesStore.md#importjson).
