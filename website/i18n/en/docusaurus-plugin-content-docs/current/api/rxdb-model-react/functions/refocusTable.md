# refocusTable()

```ts
function refocusTable(container): void;
```

Defined in: packages/rxdb-model/dist/entity-table/editors/global-overlay-editor.d.ts:27

Returns focus to the VTable root element after editing ends (the .vtable div with tabindex=0 = ctx.container = table.getElement()), so that arrow-key navigation keeps working

## Parameters

| Parameter   | Type                                   | Description                  |
| ----------- | -------------------------------------- | ---------------------------- |
| `container` | `HTMLElement` \| `null` \| `undefined` | The VTable container element |

## Returns

`void`
