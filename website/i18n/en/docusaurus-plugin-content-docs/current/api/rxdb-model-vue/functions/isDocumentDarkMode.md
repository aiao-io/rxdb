# isDocumentDarkMode()

```ts
function isDocumentDarkMode(): boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-theme.d.ts:52

Determines whether the current document is in dark mode

## Returns

`boolean`

`true` for a dark theme or system dark; returns false in non-browser environments

## Remarks

First reads `color-scheme` from the root node's computed style: every daisyUI theme (dracula, night, business…)
declares it, so this is not limited to the theme named `dark`. When it cannot be read (`normal` / `light dark` / no style engine),
checks whether `data-theme` is exactly `dark` / `light`, and finally falls back to the system `prefers-color-scheme`.
