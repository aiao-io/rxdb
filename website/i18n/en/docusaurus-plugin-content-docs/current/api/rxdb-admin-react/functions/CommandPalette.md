# CommandPalette()

```ts
function CommandPalette(): ReactElement;
```

Defined in: [palette/command-palette.tsx:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin-react/src/palette/command-palette.tsx#L11)

Command palette: aggregates menus, commands, and app-registered sources (such as full-text search), keyboard up/down selection, Enter to run.
Rendered as a native modal `<dialog>`; the input is a combobox and the results are a listbox.

## Returns

`ReactElement`

The palette element.
