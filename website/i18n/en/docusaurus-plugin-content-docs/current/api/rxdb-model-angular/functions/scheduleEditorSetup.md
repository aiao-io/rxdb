# scheduleEditorSetup()

```ts
function scheduleEditorSetup(fn): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:21

Defers editor initialization (registers the outside-click listener + focus) to avoid VTable event interference

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fn` | () => `void` | The deferred initialization callback |

## Returns

`void`
