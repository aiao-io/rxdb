# observeDocumentTheme()

```ts
function observeDocumentTheme(onChange): () => void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-theme.d.ts:64

Observes document theme changes: the root node's `data-theme`, its inline `style` (runtime-overridden primary colors / border radius are written there),
and system light/dark changes when there is no explicit `data-theme`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `onChange` | () => `void` | Called when the theme may have changed |

## Returns

A function that stops the observation; returns a no-op in non-browser environments

() => `void`

## Remarks

The tables of all three frameworks use it to trigger a VTable theme redraw. Observing only the "is dark" boolean is not enough:
changes like light → cupcake or a different primary color do not flip the boolean, but the canvas still needs to redraw with the new CSS variables.
