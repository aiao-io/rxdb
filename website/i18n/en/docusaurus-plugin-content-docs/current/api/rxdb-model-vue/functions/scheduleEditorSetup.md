# scheduleEditorSetup()

```ts
function scheduleEditorSetup(fn): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:21

Defers editor initialization (registering the outside-click listener + focusing) to avoid VTable event interference

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fn` | () => `void` | Initialization callback executed after a delay |

## Returns

`void`
