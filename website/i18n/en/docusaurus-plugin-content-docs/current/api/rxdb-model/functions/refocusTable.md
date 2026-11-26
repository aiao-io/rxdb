# refocusTable()

```ts
function refocusTable(container): void;
```

Defined in: [packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/editors/global-overlay-editor.ts#L35)

After editing ends, returns focus to the VTable root element (the .vtable div with tabindex=0 = ctx.container = table.getElement()) so that arrow-key navigation keeps working.

## Parameters

| Parameter   | Type                                   | Description                  |
| ----------- | -------------------------------------- | ---------------------------- |
| `container` | `HTMLElement` \| `null` \| `undefined` | The VTable container element |

## Returns

`void`
