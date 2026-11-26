# isDocumentDarkMode()

```ts
function isDocumentDarkMode(): boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-theme.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-theme.ts#L84)

Determines whether the current document is in dark mode.

## Returns

`boolean`

true when a dark theme or system dark mode is active; returns false in non-browser environments

## Remarks

Reads the root node's computed `color-scheme` first: every daisyUI theme (dracula, night, business, ...)
declares it, so this is not limited to themes named `dark`. When it cannot be read (`normal` / `light dark` / no style engine),
it falls back to whether `data-theme` is exactly `dark` / `light`, and finally follows the system `prefers-color-scheme`.
