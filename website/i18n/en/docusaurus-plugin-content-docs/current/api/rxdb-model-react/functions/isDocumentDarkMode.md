# isDocumentDarkMode()

```ts
function isDocumentDarkMode(): boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-theme.d.ts:52

Determines whether the current document is in dark mode

## Returns

`boolean`

true when a dark theme or system dark is active; returns false in non-browser environments

## Remarks

Preferentially reads the root node's computed `color-scheme`: every daisyUI theme (dracula, night, business, ...)
declares it, so it is not limited to themes named `dark`. When it cannot be read (`normal` / `light dark` / no style engine),
fall back to checking whether `data-theme` is exactly `dark` / `light`, and finally follow the system `prefers-color-scheme`.
