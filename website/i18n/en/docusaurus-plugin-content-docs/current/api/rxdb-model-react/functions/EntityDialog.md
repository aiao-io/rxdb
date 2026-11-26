# EntityDialog()

```ts
function EntityDialog(__namedParameters): Element;
```

Defined in: [packages/rxdb-model-react/src/entity-dialog/entity-dialog.tsx:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/entity-dialog/entity-dialog.tsx#L41)

Dialog shell component: title bar (drag / fullscreen / close) + eight-direction resizing + content projection.

## Parameters

| Parameter           | Type                                                      |
| ------------------- | --------------------------------------------------------- |
| `__namedParameters` | [`EntityDialogProps`](../interfaces/EntityDialogProps.md) |

## Returns

`Element`

## Remarks

When used inside a Dialog, the panel reference comes from DialogContext;
when used standalone (no dialog context), only `children` are rendered, matching Angular's
"non-DIALOG context renders only projected content".
