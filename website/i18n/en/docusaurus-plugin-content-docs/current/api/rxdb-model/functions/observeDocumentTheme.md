# observeDocumentTheme()

```ts
function observeDocumentTheme(onChange): () => void;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-theme.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-theme.ts#L115)

Observes document theme changes: the root node's `data-theme`, the inline `style` (runtime-overridden primary color / corner radius are written here),
and the system light/dark change when there is no explicit `data-theme`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `onChange` | () => `void` | Called when the theme may have changed |

## Returns

A function that stops observing; a no-op in non-browser environments

() => `void`

## Remarks

The tables of all three frameworks use it to trigger a VTable theme repaint. Observing only the "is dark" boolean is not enough:
changes like light → cupcake or a primary color change do not flip the boolean, yet the canvas needs to repaint with the new CSS variables.
