---
sidebar_label: "DevToolsSnapshotLockResult⟨TValue⟩"
---

# DevToolsSnapshotLockResult`<TValue>`

```ts
type DevToolsSnapshotLockResult<TValue> = 
  | {
  outcome: "held";
  value: TValue;
}
  | {
  outcome: "lost";
}
  | {
  outcome: "aborted";
};
```

Defined in: [native/native-snapshot-source.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/native/native-snapshot-source.ts#L43)

Result of a single task run inside the lock.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-tvalue"></a> `TValue` |
