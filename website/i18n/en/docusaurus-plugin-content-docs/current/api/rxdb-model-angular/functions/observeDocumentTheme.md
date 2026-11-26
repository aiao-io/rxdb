# observeDocumentTheme()

```ts
function observeDocumentTheme(onChange): () => void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-theme.d.ts:64

Observes document theme changes: the root node's `data-theme`, the inline `style` (the primary color / border radius overridden at runtime are written here),
and the system light/dark change when there is no explicit `data-theme`.

## Parameters

| Parameter  | Type         | Description                            |
| ---------- | ------------ | -------------------------------------- |
| `onChange` | () => `void` | Called when the theme may have changed |

## Returns

The function that stops observing; a no-op in non-browser environments

() => `void`

## Remarks

All three framework tables use it to trigger a VTable theme repaint. Observing only the "is dark" boolean is not enough:
changes like light → cupcake or a different primary color do not flip the boolean, but the canvas still needs to repaint with the new CSS variables.
