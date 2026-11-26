# scheduleEditorSetup()

```ts
function scheduleEditorSetup(fn): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:21

Defers editor setup (registering outside-click listeners + focusing) to avoid interference from VTable events

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fn` | () => `void` | The deferred initialization callback |

## Returns

`void`
