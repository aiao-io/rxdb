# BoardViewProps

Defined in: [packages/rxdb-plugin-board-react/src/board-view.tsx:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/board-view.tsx#L16)

Props of [BoardView](../functions/BoardView.md).

## Properties

### onExportBackup? \{#onexportbackup\}

```ts
readonly onExportBackup?: () => void | Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-react/src/board-view.tsx:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/board-view.tsx#L20)

Backup export callback (US-537 orchestration is wired by the host; by default a placeholder hint is shown). The Angular binding's input of the same role is named `exportBackup`.

#### Returns

`void` \| `Promise`&lt;`void`&gt;

***

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: [packages/rxdb-plugin-board-react/src/board-view.tsx:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/board-view.tsx#L18)

Connected board RxDB instance (entities include the five entities in the board namespace; requires the history plugin).
