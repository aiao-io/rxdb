# observeDocumentTheme()

```ts
function observeDocumentTheme(onChange): () => void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-theme.d.ts:64

Observes document theme changes: the root node's `data-theme`, inline `style` (runtime overrides of the primary color / corner radius are written here),
and system light/dark changes when there is no explicit `data-theme`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `onChange` | () => `void` | Called when the theme may have changed |

## Returns

The function that stops observing; returns a no-op in non-browser environments

() => `void`

## Remarks

All three frameworks' tables use it to trigger VTable theme repaints. Observing only the "is dark" boolean is not enough:
changes like light → cupcake or a different primary color do not flip the boolean, yet the canvas must repaint with the new CSS variables.
