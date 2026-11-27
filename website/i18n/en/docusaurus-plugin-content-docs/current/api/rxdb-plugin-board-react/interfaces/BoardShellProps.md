# BoardShellProps

Defined in: [packages/rxdb-plugin-board-react/src/board-shell.tsx:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/board-shell.tsx#L16)

Props of [BoardShell](../functions/BoardShell.md).

## Properties

### options \{#options\}

```ts
readonly options: BoardShellOptions;
```

Defined in: [packages/rxdb-plugin-board-react/src/board-shell.tsx:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/board-shell.tsx#L21)

Host configuration: instance factory, local adapter name, optional demo data. Pass a stable reference (a module-level constant or `useMemo`) — a changed reference rebuilds the shell and disconnects the current board. The Angular binding's input of the same name is `options`.
