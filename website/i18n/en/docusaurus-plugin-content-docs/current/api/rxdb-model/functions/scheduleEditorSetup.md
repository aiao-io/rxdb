# scheduleEditorSetup()

```ts
function scheduleEditorSetup(fn): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L26)

Defers editor initialization (registers outside-click listener + focus) to avoid VTable event interference

## Parameters

| Parameter | Type         | Description                      |
| --------- | ------------ | -------------------------------- |
| `fn`      | () => `void` | Deferred initialization callback |

## Returns

`void`
